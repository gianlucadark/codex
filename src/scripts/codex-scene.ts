import {
	ACESFilmicToneMapping, AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial, Sprite, SpriteMaterial, CanvasTexture, Color, DirectionalLight, HemisphereLight, MathUtils,
	Mesh, MeshDepthMaterial, MeshDistanceMaterial, RGBADepthPacking, Raycaster, Plane, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, PCFShadowMap, PerspectiveCamera, PointLight,
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
	leave: () => void;
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
			if (!(object instanceof Mesh) && !(object instanceof Points) && !(object instanceof Sprite)) return;
			object.geometry.dispose();
			if (object instanceof Mesh) { object.customDepthMaterial?.dispose(); object.customDistanceMaterial?.dispose(); }
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
		const presence = { value: 0 };
		const paperTime = { value: 0 };
		// Deform only the exposed sheet edges. The spine stays anchored and the
		// coherent wave across neighbouring sheets preserves their separation.
		const flutterShader: MeshStandardMaterial['onBeforeCompile'] = shader => {
			shader.uniforms.bookPresence = presence;
			shader.uniforms.paperTime = paperTime;
			shader.vertexShader = 'uniform float bookPresence; uniform float paperTime;\n' + shader.vertexShader;
			shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
				#include <begin_vertex>
				float edge = smoothstep(-1.45, 1.5, position.x);
				float wave = sin(position.z * 3.2 + paperTime * 5.4 + position.y * 24.);
				transformed.y += bookPresence * edge * edge * (1. + wave) * .0025;
			`);
		};
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
			if (/Folio[ _]tone/.test(object.name)) {
				const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
				const distance = new MeshDistanceMaterial();
				depth.onBeforeCompile = flutterShader; distance.onBeforeCompile = flutterShader;
				object.customDepthMaterial = depth; object.customDistanceMaterial = distance;
			}
			if (/^Small[ _]flame/.test(object.name)) { flame = object; object.castShadow = false; }
			const materials = Array.isArray(object.material) ? object.material : [object.material];
			for (const material of materials) {
				if (!(material instanceof MeshStandardMaterial)) continue;
				if (/Folio tone/.test(material.name)) material.onBeforeCompile = flutterShader;
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
				// The candle and its holder do not project a dark patch onto the table.
				if (material.name === 'Aged brass' || material.name === 'Beeswax') object.castShadow = false;
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
		key.shadow.mapSize.set(2048, 2048);
		Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .1, far: 25 });
		key.shadow.normalBias = .025;
		key.shadow.bias = -.00015;
		key.shadow.radius = 4;
		key.shadow.blurSamples = 8;
		scene.add(key, key.target);
		const rim = new DirectionalLight('#c8d5e5', .45);
		rim.position.set(4, 5, -5); scene.add(rim);
		// A restrained warm reflection travels over the real embossed metal.
		const glint = new DirectionalLight('#ffe0ac', 0);
		glint.position.set(-2, 3, 5); scene.add(glint, glint.target);
		// A fixed, unbounded inverse-power falloff avoids crossing Three.js's
		// special distance=0 value halfway through a lighting transition.
		const candle = new PointLight('#ff9d44', 3, 0, 2);
		if (flame) { flame.getWorldPosition(candle.position); candle.position.y += .1; }
		else candle.position.set(-3, 2.5, -3);
		// Only perceptible once the room goes dark, where the flame is the one
		// light left and the book has to throw its own shadow away from it.
		candle.castShadow = true;
		candle.shadow.mapSize.set(1024, 1024);
		Object.assign(candle.shadow.camera, { near: .1, far: 16 });
		candle.shadow.bias = -.0004;
		candle.shadow.normalBias = .02;
		candle.shadow.radius = 2;
		candle.shadow.intensity = .72;
		candle.shadow.blurSamples = 8;
		scene.add(candle);
		const candleOrigin = candle.position.clone();
		// A small optical halo remains anchored in 3D and occluded by the book.
		const glowCanvas = document.createElement('canvas');
		glowCanvas.width = glowCanvas.height = 64;
		const glowContext = glowCanvas.getContext('2d')!;
		const halo = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
		halo.addColorStop(0, 'rgba(255,236,180,.7)');
		halo.addColorStop(.18, 'rgba(255,184,74,.25)');
		halo.addColorStop(.5, 'rgba(240,110,24,.06)');
		halo.addColorStop(1, 'rgba(240,110,24,0)');
		glowContext.fillStyle = halo; glowContext.fillRect(0, 0, 64, 64);
		const glow = new Sprite(new SpriteMaterial({ map: new CanvasTexture(glowCanvas), blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
		glow.position.copy(candleOrigin); glow.position.y -= .07;
		glow.scale.setScalar(.65); scene.add(glow);
		const flameScale = flame?.scale.clone();
		const flameRotation = flame?.rotation.z ?? 0;
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
			rim.intensity = .45 * (1 - d) + .22 * d;
			scene.environmentIntensity = .2 * (1 - d) + .025 * d;
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
			// A tethered, breathing flame: the wick stays still while its tip leans.
			if (flame && flameScale) {
				flame.scale.set(flameScale.x * (1 - flutter * .09), flameScale.y * (1 + flutter * .12), flameScale.z);
				flame.rotation.z = flameRotation + flutter * .065;
			}
			// Wax glows where the flame shines through it.
			glow.material.opacity = .6 + d * .3 + flutter * .08;
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
		// Sparse airborne fibres catch the candle, with real depth and parallax.
		// One draw call, GPU drift, no postprocessing or full-screen glow wash.
		const dustGeometry = new BufferGeometry();
		const dustPositions = [], dustSeeds = [];
		for (let i = 0; i < 180; i++) {
			const seed = (i * .61803398875) % 1;
			dustPositions.push(((i * .754877666) % 1 - .5) * 10, .25 + seed * 4.5, ((i * .569840291) % 1 - .5) * 8);
			dustSeeds.push(seed);
		}
		dustGeometry.setAttribute('position', new Float32BufferAttribute(dustPositions, 3));
		dustGeometry.setAttribute('seed', new Float32BufferAttribute(dustSeeds, 1));
		const dustMaterial = new ShaderMaterial({
			transparent: true, depthWrite: false, blending: AdditiveBlending,
			uniforms: { time: { value: 0 }, strength: { value: 1 }, candlePosition: { value: candleOrigin } },
			vertexShader: `
				attribute float seed;
				uniform float time;
				uniform vec3 candlePosition;
				varying float illumination;
				void main() {
					vec3 p = position;
					p.x += sin(time * .17 + seed * 40.) * .18;
					p.z += cos(time * .13 + seed * 30.) * .14;
					p.y += sin(time * .21 + seed * 50.) * .16;
					vec4 view = modelViewMatrix * vec4(p, 1.);
					illumination = (.1 + .65 / (1. + dot(p - candlePosition, p - candlePosition) * .3)) * (.4 + seed * .6);
					gl_PointSize = clamp((12. + seed * 12.) / max(1., -view.z), 1., 3.);
					gl_Position = projectionMatrix * view;
				}
			`,
			fragmentShader: `
				uniform float strength;
				varying float illumination;
				void main() {
					float radius = length(gl_PointCoord - .5) * 2.;
					float alpha = (1. - smoothstep(.05, 1., radius)) * illumination * strength;
					gl_FragColor = vec4(1., .72, .38, alpha);
				}
			`,
		});
		const dust = new Points(dustGeometry, dustMaterial);
		scene.add(dust);
		const pointer = new Vector2();
		const current = new Vector2();
		let pointerActive = false;
		let approach = 0;
		let openingApproach = 0;
		const ray = new Raycaster();
		const coverPlane = new Plane(new Vector3(0, 1, 0), -.735);
		const hit = new Vector3();
		const lift = new Quaternion();
		const spineAxis = new Vector3(0, 0, 1);
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
		let previousShadow = 0;
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
			// Continue from the lifted cover on click, then merge into Blender's
			// opening curve without snapping the hinge back to its closed pose.
			const response = animating
				? (direction === 1 ? openingApproach * (1 - MathUtils.smootherstep(time, 0, .7)) : 0)
				: (time === 0 ? approach : 0);
			presence.value = response;
			hinge.quaternion.multiply(lift.setFromAxisAngle(spineAxis, response * .055));
			glint.intensity = response * .85;
			glint.position.set(-2 + current.x * 4, 3.5, 4 + current.y * 2);
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
			let proximity = 0;
			if (pointerActive && !animating && elapsed === 0) {
				camera.updateMatrixWorld();
				ray.setFromCamera(new Vector2(pointer.x, -pointer.y), camera);
				if (ray.ray.intersectPlane(coverPlane, hit)) {
					const outside = Math.hypot(Math.max(0, Math.abs(hit.x) - 1.6), Math.max(0, Math.abs(hit.z) - 2.15));
					proximity = 1 - MathUtils.smootherstep(outside, 0, 1.15);
				}
			}
			approach = MathUtils.lerp(approach, proximity, 1 - Math.exp(-dt * 6));
			if (approach < .0001) approach = 0;
			paperTime.value = now * .001;
			const fading = darkness !== darkTarget || lightVelocity !== 0;
			if (fading) advanceLight(dt);
			// In the dark the flicker is the whole scene, so it keeps a smooth 30fps.
			const idleGap = approach > .001 || pointerActive ? 16 : darkness > 0 ? 33 : 100;
			if (!animating && !fading && now - previousRender < (current.distanceToSquared(pointer) > .00001 ? 16 : idleGap)) return;
			previousRender = now;
			pose(elapsed);
			if (animating || now - previousShadow > 100) { renderer.shadowMap.needsUpdate = true; previousShadow = now; }
			dustMaterial.uniforms.time.value = now * .001;
			dustMaterial.uniforms.strength.value = 1 - MathUtils.smootherstep(elapsed / duration, .5, .78);
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
			pause() { pointerActive = false; approach = 0; paused = true; cancelAnimationFrame(raf); },
			resume() { if (paused && !disposed) { paused = false; previous = performance.now(); raf = requestAnimationFrame(tick); } },
			open() { openingApproach = presence.value; pointerActive = false; animating = true; direction = 1; pointer.set(0, 0); previous = performance.now(); },
			close() { pointerActive = false; approach = 0; animating = true; direction = -1; pointer.set(0, 0); previous = performance.now(); },
			move(x, y) { if (!animating) { pointerActive = true; pointer.set(MathUtils.clamp(x, -1, 1), MathUtils.clamp(y, -1, 1)); } },
			leave() { pointerActive = false; pointer.set(0, 0); },
			setDark(dark) { darkTarget = dark ? 1 : 0; },
			dispose,
		};
	} catch (error) {
		dispose(); throw error;
	}
}
