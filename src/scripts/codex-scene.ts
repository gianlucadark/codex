import {
	ACESFilmicToneMapping, CanvasTexture, Color, DirectionalLight, HemisphereLight, MathUtils,
	Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PCFShadowMap, PerspectiveCamera, PointLight,
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
	/** Switches to candlelight while retaining a restrained fill for legibility. */
	setDark: (dark: boolean) => void;
	pause: () => void;
	resume: () => void;
	dispose: () => void;
};

/** Real geometry, PBR materials and the camera/hinge curves sampled from Blender. */
export async function createCodexScene(
	canvas: HTMLCanvasElement,
	options: {
		signal: AbortSignal;
		onProgress: (progress: number) => void;
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
	const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'default' });
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.toneMapping = ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = PCFShadowMap;
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
			loader.loadAsync('/codex/scene_codex_v3.glb', event => {
				onLoadProgress?.(event.lengthComputable && event.total ? event.loaded / event.total : NaN);
			}).then(gltf => {
				// A fetch/timeout can fail before the worker finishes decoding.
				// Dispose late arrivals too; they must never keep GPU resources alive.
				if (disposed) { scene.add(gltf.scene); disposed = false; dispose(); throw new DOMException('Cancelled', 'AbortError'); }
				return gltf;
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
			scene.add(model.scene); disposed = false; dispose(); throw new DOMException('Cancelled', 'AbortError');
		}
		scene.add(model.scene);
		const hinge = model.scene.getObjectByName('OPEN_CODEX');
		if (!hinge) throw new Error('Codex hinge is missing');
		let screen: Mesh | undefined;
		let flame: Mesh | undefined;
		let flameMaterial: MeshStandardMaterial | undefined;
		let waxMaterial: MeshStandardMaterial | undefined;
		const inkRelease = { value: 0 };
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
				if (material.map?.name?.includes('folio_studi') || material.name.includes('original portfolio ink')) {
					material.onBeforeCompile = shader => {
						shader.uniforms.inkRelease = inkRelease;
						shader.fragmentShader = 'uniform float inkRelease;\n' + shader.fragmentShader;
						shader.fragmentShader = shader.fragmentShader.replace('#include <colorspace_fragment>', '#include <colorspace_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.89, 0.81, 0.66), inkRelease);');
					};
				}
				// Use the exported physical maps: ink must not become raised relief,
				// and wood roughness must retain its subtle variation across the grain.
				for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
					if (texture) texture.anisotropy = anisotropy;
				}
				if (material.name === 'Candle flame') flameMaterial = material;
				if (material.name === 'Beeswax') { waxMaterial = material; material.emissive.set('#ff8f3a'); material.emissiveIntensity = 0; }
				if (material.name.startsWith('PORTFOLIO_SCREEN')) {
					screen = object;
					// The original quad is only a projection anchor. The ink is now
					// part of the full paper surface, lit by the scene like the left page.
					object.visible = false;
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
		const key = new DirectionalLight('#fff0dc', 2.1);
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
		const rim = new DirectionalLight('#c8d5e5', .45);
		rim.position.set(4, 5, -5); scene.add(rim);
		// A fixed, unbounded inverse-power falloff avoids crossing Three.js's
		// special distance=0 value halfway through a lighting transition.
		const candle = new PointLight('#ff9d44', 3, 0, 2);
		if (flame) { flame.getWorldPosition(candle.position); candle.position.y += .1; }
		else candle.position.set(-3, 2.5, -3);
		// Only perceptible once the room goes dark, where the flame is the one
		// light left and the book has to throw its own shadow away from it.
		candle.castShadow = false;
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
		const night = { background: new Color('#040201'), candle: new Color('#ffd1a0') };
		let darkness = options.dark ? 1 : 0;
		let darkTarget = darkness;
		let lightVelocity = 0;
		const advanceLight = (dt: number) => {
			// Exact critically damped response: continuous position AND velocity
			// when the user reverses a fade, independent of the rendering frame rate.
			const omega = 3.8;
			const error = darkness - darkTarget;
			const decay = Math.exp(-omega * dt);
			const step = (lightVelocity + omega * error) * dt;
			darkness = darkTarget + (error + step) * decay;
			lightVelocity = (lightVelocity - omega * step) * decay;
			if (Math.abs(darkness - darkTarget) < .0005 && Math.abs(lightVelocity) < .001) {
				darkness = darkTarget;
				lightVelocity = 0;
			}
		};
		const applyLight = (now: number) => {
			const d = MathUtils.clamp(darkness, 0, 1);
			sky.intensity = .4 * (1 - d) + .12 * d;
			key.intensity = 2.1 * (1 - d) + .32 * d;
			rim.intensity = .45 * (1 - d) + .12 * d;
			scene.environmentIntensity = .2 * (1 - d) + .006 * d;
			(scene.background as Color).lerpColors(day.background, night.background, d);
			candle.color.lerpColors(day.candle, night.candle, d);
			// A softer falloff than daylight's reaches across the whole book.
			candle.decay = MathUtils.lerp(2, 1.5, d);
			// A flame in still air: a slow breathing plus a quicker, irregular
			// flutter, which the dark makes far more visible than daylight does.
			const breathe = Math.sin(now * .0021) * .5 + Math.sin(now * .0037 + 1.3) * .3;
			const flutter = Math.sin(now * .013) * .35 + Math.sin(now * .029 + .7) * .2 + Math.sin(now * .047 + 2.1) * .12;
			const dayFlicker = Math.sin(now * .007) * .13 + Math.sin(now * .011) * .07;
			candle.intensity = MathUtils.lerp(3 + dayFlicker, 24 * (1 + breathe * .06 + flutter * .09), d);
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
		let slowFrames = 0;
		let qualityScale = 1;
		let visible = !document.hidden;
		let paused = false;
		let initialFov = motion.fov;
		const duration = (motion.end - motion.start) / motion.fps;
		if (!screen) throw new Error('Codex portal is missing');
		const portalMesh = screen;
		screen.geometry.computeBoundingBox();
		const bounds = screen.geometry.boundingBox!;
		const resize = () => {
			if (disposed) return;
			const width = canvas.clientWidth, height = canvas.clientHeight;
			if (!width || !height) return;
			camera.aspect = width / height;
			// In portrait, reveal more of the table instead of cropping away the book.
			const portrait = camera.aspect < .8;
			const widen = portrait ? Math.max(1, (4 / 3) / (camera.aspect * 1.35)) : 1;
			camera.fov = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(motion.fov) / 2) * widen));
			initialFov = camera.fov;
			camera.updateProjectionMatrix();
			renderer.setPixelRatio(qualityScale * Math.min(devicePixelRatio, portrait ? 1.35 : 1.5, Math.sqrt(2_000_000 / (width * height))));
			renderer.setSize(width, height, false);
		};
		observer = new ResizeObserver(resize); observer.observe(canvas); resize();
		model.scene.updateMatrixWorld(true);
		const paperCenter = bounds.getCenter(new Vector3()).applyMatrix4(portalMesh.matrixWorld);
		const finalRotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
		const finalPosition = new Vector3();
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
			// Continue the physical dolly toward the paper, aligning its normal
			// with the lens. The crop is smaller than the page on every aspect ratio.
			const progress = time / duration;
			const travel = MathUtils.smootherstep(progress, .53, .87);
			inkRelease.value = MathUtils.smootherstep(progress, .72, .90);
			camera.fov = MathUtils.lerp(initialFov, 30, travel);
			const cropHeight = Math.min(1.3, 1.85 / camera.aspect);
			const distance = cropHeight / (2 * Math.tan(MathUtils.degToRad(30) / 2));
			finalPosition.copy(paperCenter); finalPosition.y += distance;
			camera.position.lerp(finalPosition, travel);
			camera.quaternion.slerp(finalRotation, travel);
			camera.updateProjectionMatrix();
		};
		pose(0);
		applyLight(performance.now());
		await renderer.compileAsync(scene, camera);
		if (disposed) throw new DOMException('Cancelled', 'AbortError');
		renderer.render(scene, camera);
		canvas.dataset.ready = 'true';
		const tick = (now: number) => {
			if (disposed || paused) return;
			raf = requestAnimationFrame(tick);
			// Clamped both ways: rAF timestamps can occasionally arrive at or
			// slightly behind the previous frame's, and a negative dt would send
			// `elapsed` outside the sampled range.
			const dt = Math.min(Math.max((now - previous) / 1000, 0), .05); previous = now;
			if (!visible) return;
			if (animating && dt > .03) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
			if (slowFrames > 40 && qualityScale > .65) { qualityScale *= .8; slowFrames = 0; resize(); }
			if (animating) elapsed = direction === 1 ? Math.min(duration, elapsed + dt) : Math.max(0, elapsed - dt * closeSpeed);
			current.lerp(pointer, 1 - Math.exp(-dt * 4.5));
			const fading = darkness !== darkTarget || lightVelocity !== 0;
			if (fading) advanceLight(dt);
			// In the dark the flicker is the whole scene, so it keeps a smooth 30fps.
			const idleGap = darkness > 0 ? 33 : 100;
			if (!animating && !fading && now - previousRender < (current.distanceToSquared(pointer) > .00001 ? 16 : idleGap)) return;
			previousRender = now;
			pose(elapsed);
			if (animating && elapsed < 3) renderer.shadowMap.needsUpdate = true;
			applyLight(now);
			renderer.render(scene, camera);
			if (animating) {
				onProgress(elapsed / duration);
				if (direction === 1 && elapsed >= duration) { animating = false; onComplete(); }
				else if (direction === -1 && elapsed <= 0) { animating = false; onClosed?.(); }
			}
		};
		canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); onError(); }, { signal });
		document.addEventListener('visibilitychange', () => { visible = !document.hidden; previous = performance.now(); }, { signal });
		raf = requestAnimationFrame(tick);
		return {
			pause() { paused = true; cancelAnimationFrame(raf); },
			resume() { if (paused && !disposed) { paused = false; previous = performance.now(); raf = requestAnimationFrame(tick); } },
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
