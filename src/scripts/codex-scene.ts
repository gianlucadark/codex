import {
	ACESFilmicToneMapping, CanvasTexture, Color, DirectionalLight, HemisphereLight, MathUtils,
	Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, VSMShadowMap, PerspectiveCamera, PointLight,
	PMREMGenerator, Quaternion, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

type Sample = { p: number[]; q: number[]; h: number[] };
type Motion = { fps: number; start: number; end: number; fov: number; samples: Sample[] };
export type CodexScene = {
	open: () => void;
	close: () => void;
	move: (x: number, y: number) => void;
	/** Blows out every light but the candle: a dark room lit by its flame alone. */
	setDark: (dark: boolean) => void;
	dispose: () => void;
};

/** Real geometry, PBR materials and the camera/hinge curves sampled from Blender. */
export async function createCodexScene(
	canvas: HTMLCanvasElement,
	options: {
		signal: AbortSignal;
		onProgress: (progress: number, corners: number[]) => void;
		/** Download progress of the model, 0–1; NaN when its size is unknown. */
		onLoadProgress?: (fraction: number) => void;
		onComplete: () => void;
		onClosed?: () => void;
		onError: () => void;
		/** Start in the candle-lit dark instead of the daylight studio. */
		dark?: boolean;
	},
): Promise<CodexScene> {
	const { signal, onProgress, onLoadProgress, onComplete, onClosed, onError } = options;
	signal.throwIfAborted();
	const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.toneMapping = ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = VSMShadowMap;
	renderer.shadowMap.autoUpdate = false;
	renderer.shadowMap.needsUpdate = true;
	const scene = new Scene();
	scene.background = new Color('#21160f');
	const camera = new PerspectiveCamera(35, 1, .05, 100);
	const decoder = new DRACOLoader().setDecoderPath('/codex/draco/').setWorkerLimit(2);
	const loader = new GLTFLoader().setDRACOLoader(decoder);
	let disposed = false;
	let raf = 0;
	let env: ReturnType<PMREMGenerator['fromScene']> | undefined;
	let observer: ResizeObserver | undefined;
	let model: Awaited<ReturnType<GLTFLoader['loadAsync']>> | undefined;
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		cancelAnimationFrame(raf);
		observer?.disconnect();
		decoder.dispose();
		const textures = new Set<import('three').Texture>();
		scene.traverse(object => {
			if (!(object instanceof Mesh)) return;
			object.geometry.dispose();
			for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
				for (const value of Object.values(material)) if (value && typeof value === 'object' && 'isTexture' in value) textures.add(value as import('three').Texture);
				material.dispose();
			}
		});
		textures.forEach(texture => texture.dispose());
		env?.dispose();
		renderer.dispose();
	};
	signal.addEventListener('abort', dispose, { once: true });
	try {
		const loaded = await Promise.all([
			loader.loadAsync('/codex/codex.glb', event => {
				onLoadProgress?.(event.lengthComputable && event.total ? event.loaded / event.total : NaN);
			}),
			fetch('/codex/motion.json', { signal }).then(response => {
				if (!response.ok) throw new Error('Cannot load Codex motion');
				return response.json() as Promise<Motion>;
			}),
		]);
		model = loaded[0];
		const motion = loaded[1];
		if (signal.aborted) {
			// A skip can happen while the decoder is still completing its work.
			disposed = false; dispose(); throw new DOMException('Cancelled', 'AbortError');
		}
		scene.add(model.scene);
		const hinge = model.scene.getObjectByName('OPEN_CODEX');
		if (!hinge) throw new Error('Codex hinge is missing');
		let screenMaterial: MeshStandardMaterial | undefined;
		let screen: Mesh | undefined;
		let flame: Mesh | undefined;
		let flameMaterial: MeshStandardMaterial | undefined;
		let waxMaterial: MeshStandardMaterial | undefined;
		const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
		model.scene.traverse(object => {
			if (!(object instanceof Mesh)) return;
			if (object.name.includes('Smoked_walnut') || object.name.includes('Smoked walnut')) {
				object.geometry.computeBoundingBox();
				const center = object.geometry.boundingBox!.getCenter(new Vector3());
				object.geometry.translate(-center.x, 0, -center.z);
				object.geometry.scale(2.5, 1, 2.5);
				object.geometry.translate(center.x, 0, center.z);
			}
			object.castShadow = true;
			object.receiveShadow = true;
			if (object.name.startsWith('Small_flame')) flame = object;
			const materials = Array.isArray(object.material) ? object.material : [object.material];
			for (const material of materials) {
				if (!(material instanceof MeshStandardMaterial)) continue;
				if (material.map) material.map.anisotropy = anisotropy;
				if (/Oxblood|Leather turned/.test(material.name)) {
					material.bumpMap = material.map; material.bumpScale = .026; material.roughness = .86;
				} else if (/Warm rag/.test(material.name)) {
					material.bumpMap = material.map; material.bumpScale = .006; material.roughness = .96;
				} else if (/Smoked walnut/.test(material.name)) {
					material.bumpMap = material.map; material.bumpScale = .018; material.roughness = .78;
				}
				if (material.name === 'Candle flame') flameMaterial = material;
				if (material.name === 'Beeswax') { waxMaterial = material; material.emissive.set('#ff8f3a'); material.emissiveIntensity = 0; }
				if (material.name.startsWith('PORTFOLIO_SCREEN')) {
					screen = object;
					screenMaterial = material;
					material.emissiveMap = material.map;
					material.emissive.set(0xffffff);
					material.emissiveIntensity = .06;
					object.castShadow = false;
				}
				if (/printing ink|rubric red/.test(material.name)) object.castShadow = false;
			}
		});
		const pmrem = new PMREMGenerator(renderer);
		const room = new RoomEnvironment();
		env = pmrem.fromScene(room, .04);
		scene.environment = env.texture;
		scene.environmentIntensity = .2;
		room.dispose(); pmrem.dispose();
		const sky = new HemisphereLight('#e3d8c0', '#25130a', .4);
		scene.add(sky);
		const key = new DirectionalLight('#ffdfae', 2.1);
		key.position.set(-3, 8, 4);
		key.target.position.set(-.8, .4, 0);
		key.castShadow = true;
		key.shadow.mapSize.set(1024, 1024);
		Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .1, far: 25 });
		key.shadow.normalBias = .025;
		key.shadow.bias = -.00015;
		key.shadow.radius = 4;
		key.shadow.blurSamples = 8;
		scene.add(key, key.target);
		const rim = new DirectionalLight('#e5bc81', .45);
		rim.position.set(4, 5, -5); scene.add(rim);
		const candle = new PointLight('#ff9d44', 3, 7, 2);
		if (flame) { flame.getWorldPosition(candle.position); candle.position.y += .1; }
		else candle.position.set(-3, 2.5, -3);
		// Only perceptible once the room goes dark, where the flame is the one
		// light left and the book has to throw its own shadow away from it.
		candle.castShadow = true;
		candle.shadow.mapSize.set(512, 512);
		Object.assign(candle.shadow.camera, { near: .1, far: 16 });
		candle.shadow.bias = -.0004;
		candle.shadow.normalBias = .02;
		candle.shadow.radius = 6;
		candle.shadow.blurSamples = 8;
		scene.add(candle);
		const candleOrigin = candle.position.clone();
		const flameEmissive = flameMaterial?.emissiveIntensity ?? 1;
		// Daylight studio → dark room: every value the candle mode changes,
		// eased between as `darkness` goes 0 → 1.
		const day = { background: new Color('#21160f'), candle: new Color('#ff9d44') };
		const night = { background: new Color('#040201'), candle: new Color('#ffa257') };
		let darkness = options.dark ? 1 : 0;
		let darkTarget = darkness;
		const applyLight = (now: number) => {
			const d = MathUtils.smootherstep(darkness, 0, 1);
			sky.intensity = .4 * (1 - d);
			key.intensity = 2.1 * (1 - d);
			rim.intensity = .45 * (1 - d);
			scene.environmentIntensity = .2 * (1 - d) + .006 * d;
			(scene.background as Color).lerpColors(day.background, night.background, d);
			candle.color.lerpColors(day.candle, night.candle, d);
			candle.distance = MathUtils.lerp(7, 0, d);
			// A softer falloff than daylight's reaches across the whole book.
			candle.decay = MathUtils.lerp(2, 1.5, d);
			// A flame in still air: a slow breathing plus a quicker, irregular
			// flutter, which the dark makes far more visible than daylight does.
			const breathe = Math.sin(now * .0021) * .5 + Math.sin(now * .0037 + 1.3) * .3;
			const flutter = Math.sin(now * .013) * .35 + Math.sin(now * .029 + .7) * .2 + Math.sin(now * .047 + 2.1) * .12;
			const dayFlicker = Math.sin(now * .007) * .13 + Math.sin(now * .011) * .07;
			candle.intensity = MathUtils.lerp(3 + dayFlicker, 30 * (1 + breathe * .06 + flutter * .09), d);
			candle.position.set(
				candleOrigin.x + Math.sin(now * .0023) * .012 * d,
				candleOrigin.y + flutter * .01 * d,
				candleOrigin.z + Math.sin(now * .0031 + .5) * .012 * d,
			);
			// Wax glows where the flame shines through it.
			if (waxMaterial) waxMaterial.emissiveIntensity = d * (.14 + flutter * .02);
			if (flameMaterial) flameMaterial.emissiveIntensity = flameEmissive * (1 + d * (1.6 + flutter * .25));
			renderer.toneMappingExposure = MathUtils.lerp(1.05, 1.15, d);
		};
		// Subtle contact occlusion grounds the stationary page block. The cover's
		// moving shadow remains a real shadow map throughout the opening.
		const contactCanvas = document.createElement('canvas');
		contactCanvas.width = contactCanvas.height = 256;
		const context = contactCanvas.getContext('2d')!;
		context.filter = 'blur(14px)';
		context.fillStyle = 'rgba(20, 9, 3, .5)';
		context.fillRect(35, 26, 186, 204);
		const contact = new Mesh(new PlaneGeometry(4.6, 5.7), new MeshBasicMaterial({
			map: new CanvasTexture(contactCanvas), transparent: true, depthWrite: false,
		}));
		contact.rotation.x = -Math.PI / 2; contact.position.y = .043;
		scene.add(contact);
		const pointer = new Vector2();
		const current = new Vector2();
		const basePosition = new Vector3();
		const nextPosition = new Vector3();
		const baseRotation = new Quaternion();
		const nextRotation = new Quaternion();
		const nextHinge = new Quaternion();
		const target = new Vector3();
		const offset = new Vector3();
		let elapsed = 0;
		let animating = false;
		let direction: 1 | -1 = 1;
		// The return trip plays somewhat quicker than the opening — waiting for
		// the full opening pace to unwind feels sluggish once the reader already
		// knows what they're looking at.
		const closeSpeed = 1 / 0.75;
		let previous = performance.now();
		let previousRender = 0;
		let visible = !document.hidden;
		const duration = (motion.end - motion.start) / motion.fps;
		if (!screen) throw new Error('Codex portal is missing');
		const portalMesh = screen;
		screen.geometry.computeBoundingBox();
		const bounds = screen.geometry.boundingBox!;
		const portalCorners = [
			new Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
			new Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
			new Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
			new Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
		];
		const projected = new Vector3();
		const resize = () => {
			if (disposed) return;
			const width = canvas.clientWidth, height = canvas.clientHeight;
			if (!width || !height) return;
			camera.aspect = width / height;
			// In portrait, reveal more of the table instead of cropping away the book.
			const portrait = camera.aspect < .8;
			const widen = portrait ? Math.max(1, (4 / 3) / (camera.aspect * 1.5)) : 1;
			camera.fov = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(motion.fov) / 2) * widen));
			camera.updateProjectionMatrix();
			renderer.setPixelRatio(Math.min(devicePixelRatio, portrait ? 1.35 : 1.5, Math.sqrt(2_000_000 / (width * height))));
			renderer.setSize(width, height, false);
		};
		observer = new ResizeObserver(resize); observer.observe(canvas); resize();
		const pose = (time: number) => {
			const index = Math.min(motion.samples.length - 1, time * motion.fps);
			const i = Math.floor(index), t = index - i;
			const a = motion.samples[i], b = motion.samples[Math.min(i + 1, motion.samples.length - 1)];
			basePosition.fromArray(a.p).lerp(nextPosition.fromArray(b.p), t);
			baseRotation.fromArray(a.q).slerp(nextRotation.fromArray(b.q), t);
			hinge.quaternion.fromArray(a.h).slerp(nextHinge.fromArray(b.h), t);
			const weight = animating ? Math.max(0, 1 - elapsed / .6) : 1;
			target.set(0, 0, -1).applyQuaternion(baseRotation).multiplyScalar(basePosition.length()).add(basePosition);
			offset.set(current.x * .42 * weight, -current.y * .24 * weight, 0).applyQuaternion(baseRotation);
			camera.position.copy(basePosition).add(offset);
			camera.quaternion.copy(baseRotation);
			if (offset.lengthSq() > .000001) camera.lookAt(target);
			if (screenMaterial) screenMaterial.emissiveIntensity = .06 + .75 * MathUtils.smoothstep(time, 4, duration);
		};
		pose(0);
		applyLight(performance.now());
		await renderer.compileAsync(scene, camera);
		if (disposed) throw new DOMException('Cancelled', 'AbortError');
		renderer.render(scene, camera);
		canvas.dataset.ready = 'true';
		const tick = (now: number) => {
			if (disposed) return;
			raf = requestAnimationFrame(tick);
			// Clamped both ways: rAF timestamps can occasionally arrive at or
			// slightly behind the previous frame's, and a negative dt would send
			// `elapsed` outside the sampled range.
			const dt = Math.min(Math.max((now - previous) / 1000, 0), .05); previous = now;
			if (!visible) return;
			if (animating) elapsed = direction === 1 ? Math.min(duration, elapsed + dt) : Math.max(0, elapsed - dt * closeSpeed);
			current.lerp(pointer, 1 - Math.exp(-dt * 4.5));
			const fading = darkness !== darkTarget;
			if (fading) darkness = darkTarget > darkness ? Math.min(darkTarget, darkness + dt / 1.4) : Math.max(darkTarget, darkness - dt / .9);
			// In the dark the flicker is the whole scene, so it keeps a smooth 30fps.
			const idleGap = darkness > 0 ? 33 : 100;
			if (!animating && !fading && now - previousRender < (current.distanceToSquared(pointer) > .00001 ? 16 : idleGap)) return;
			previousRender = now;
			pose(elapsed);
			if (animating && elapsed < 3) renderer.shadowMap.needsUpdate = true;
			applyLight(now);
			renderer.render(scene, camera);
			if (animating) {
				const corners: number[] = [];
				for (const corner of portalCorners) {
					projected.copy(corner).applyMatrix4(portalMesh.matrixWorld).project(camera);
					corners.push((projected.x + 1) * canvas.clientWidth / 2, (1 - projected.y) * canvas.clientHeight / 2);
				}
				onProgress(elapsed / duration, corners);
				if (direction === 1 && elapsed >= duration) { animating = false; onComplete(); }
				else if (direction === -1 && elapsed <= 0) { animating = false; onClosed?.(); }
			}
		};
		canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); onError(); }, { signal });
		document.addEventListener('visibilitychange', () => { visible = !document.hidden; previous = performance.now(); }, { signal });
		raf = requestAnimationFrame(tick);
		return {
			open() { animating = true; direction = 1; pointer.set(0, 0); previous = performance.now(); },
			close() { animating = true; direction = -1; pointer.set(0, 0); previous = performance.now(); },
			move(x, y) { if (!animating) pointer.set(MathUtils.clamp(x, -1, 1), MathUtils.clamp(y, -1, 1)); },
			setDark(dark) { darkTarget = dark ? 1 : 0; },
			dispose,
		};
	} catch (error) {
		dispose(); throw error;
	}
}
