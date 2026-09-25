import type { CodexScene } from './codex-scene';
import { createCodexPortal } from './codex-portal';

/** The document remains server rendered; only the cover loads the 3D runtime.
 * The scene is created once and kept alive for as long as the dialog exists:
 * opening and closing the book just calls open()/close() on the same instance,
 * so the reader always sees the real 3D scene, never a static stand-in photo.
 * The dialog itself is never removed after a first entry either — it is
 * simply closed and kept dormant, ready to run the same scene in reverse when
 * "torna al codice" in the navbar asks to go back to the book.
 */
export function setupCodexEntrance() {
	const html = document.documentElement;
	const dialog = document.querySelector<HTMLDialogElement>('.codex-entrance');
	if (!dialog) return;
	if (!html.hasAttribute('data-codex-intro')) { dialog.remove(); return; }
	const canvas = dialog.querySelector<HTMLCanvasElement>('canvas')!;
	const open = dialog.querySelector<HTMLButtonElement>('.entrance-open')!;
	const book = dialog.querySelector<HTMLButtonElement>('.entrance-book')!;
	const skip = dialog.querySelector<HTMLButtonElement>('.entrance-skip')!;
	const status = dialog.querySelector<HTMLElement>('.entrance-status')!;
	const light = dialog.querySelector<HTMLButtonElement>('.entrance-light')!;
	const sceneHost = dialog.querySelector<HTMLElement>('.entrance-scene')!;
	const invitation = dialog.querySelector<HTMLElement>('.entrance-invitation')!;
	const loaderCount = dialog.querySelector<HTMLElement>('.loader-count');
	// While the parchment loader covers the book and "apri il codice", their
	// buttons must not be reachable by Tab — a keyboard reader would otherwise
	// land on controls hidden under the sheet.
	const setLoaderInert = (active: boolean) => { book.inert = active; invitation.inert = active; };
	const reduced = matchMedia('(prefers-reduced-motion: reduce)');
	const en = () => html.dataset.lang === 'en';

	// Page-lifetime input handling — kept alive across as many open/close
	// cycles as the reader triggers, only torn down on real navigation.
	const page = new AbortController();
	const { signal: pageSignal } = page;

	// idle (cover, awaiting input) → loading → playing → done (live site) →
	// closing → back to idle (book closed) or back to done (cancelled).
	type State = 'idle' | 'loading' | 'playing' | 'done' | 'closing';
	const phase: { value: State } = { value: 'idle' };
	const setState = (next: State) => { phase.value = next; dialog.dataset.state = next; };
	// Reading through a helper (rather than comparing phase.value inline) avoids a
	// TS quirk where a literal comparison narrows the property and that narrowing
	// is never invalidated by the later setState() calls that actually change it.
	const is = (s: State) => phase.value === s;

	let scene: CodexScene | undefined;
	let portal: ReturnType<typeof createCodexPortal> | undefined;
	let sceneReady: Promise<void> | undefined;
	let sceneController: AbortController | undefined;
	let failed = false;
	let timeout = 0;
	let loadTimeout = 0;
	let dragged = false;
	let downX = 0, downY = 0;
	let savedScroll = window.scrollY;

	// The codex opens by candlelight; remember an explicit switch back to daylight.
	// A distinct key from the previous default (which was daylight) avoids reading
	// a stale 'day' that every reader's browser saved without ever choosing it.
	let dark = true;
	try { dark = localStorage.getItem('codex-light-v2') !== 'day'; } catch { /* Storage blocked. */ }
	const applyDark = (next: boolean) => {
		dark = next;
		light.setAttribute('aria-pressed', String(dark));
		if (dark) dialog.dataset.light = 'candle'; else delete dialog.dataset.light;
		scene?.setDark(dark);
	};
	const setDark = (next: boolean) => {
		applyDark(next);
		try { localStorage.setItem('codex-light-v2', dark ? 'candle' : 'day'); } catch { /* Storage blocked. */ }
	};

	const lenis = () => (window as unknown as { lenis?: { start(): void; stop(): void } }).lenis;

	/** Only used to give the portal's DOM nodes back; the 3D scene itself
	 * outlives every open/close cycle so the real render is always on screen. */
	const disposePortal = () => { portal?.dispose(); portal = undefined; };

	/** A genuinely broken scene (load failure, lost context) is discarded for good. */
	const discardScene = () => {
		clearTimeout(timeout);
		clearTimeout(loadTimeout);
		sceneController?.abort();
		disposePortal();
		scene?.dispose(); scene = undefined;
		sceneReady = undefined;
		dialog.style.removeProperty('--entrance-progress');
	};

	const onSceneFailure = () => {
		failed = true;
		discardScene();
		dialog.dataset.scene = 'unavailable';
		setLoaderInert(false);
		status.textContent = en() ? 'Enter the portfolio to continue.' : 'Entra nel portfolio per continuare.';
		if (is('loading') || is('playing')) enterSite(true);
		else if (is('closing')) returnDone();
	};

	/** Loads the one scene instance the whole page lifetime shares. A no-op once it exists. */
	const ensureScene = () => {
		if (sceneReady || reduced.matches) return sceneReady;
		sceneController = new AbortController();
		const { signal } = sceneController;
		dialog.dataset.scene = 'loading';
		setLoaderInert(true);
		loadTimeout = window.setTimeout(onSceneFailure, 12000);
		sceneReady = import('./codex-scene')
			.then(({ createCodexScene }) => createCodexScene(canvas, {
				signal,
				dark,
				onProgress(progress) {
					dialog.style.setProperty('--entrance-progress', String(progress));
					portal?.update(progress);
				},
				onLoadProgress(fraction) {
					// Without a Content-Length the loader keeps drawing, without a number.
					if (Number.isNaN(fraction)) { dialog.dataset.load = 'unknown'; return; }
					dialog.dataset.load = 'known';
					dialog.style.setProperty('--entrance-load', fraction.toFixed(3));
					if (loaderCount) loaderCount.textContent = `${Math.round(fraction * 100)}%`;
				},
				onComplete: () => enterSite(true),
				onClosed: () => returnDone(),
				onError: onSceneFailure,
			}))
			.then(result => {
				if (signal.aborted) { result.dispose(); return; }
				clearTimeout(loadTimeout);
				scene = result;
				if (is('done')) scene.pause();
				// The reader may have flipped the switch while the model was loading.
				scene.setDark(dark);
				dialog.dataset.scene = 'ready';
				setLoaderInert(false);
				status.textContent = en()
					? 'The codex is ready. Move the pointer to look around.'
					: 'Il codice è pronto. Muovi il puntatore per guardarti intorno.';
			})
			.catch(() => { if (!signal.aborted) onSceneFailure(); });
		return sceneReady;
	};

	// — Forward: cover → live site —
	const enter = async () => {
		if (!is('idle') || dragged) return;
		if (reduced.matches || failed) { enterSite(true); return; }
		setState('loading');
		open.setAttribute('aria-disabled', 'true'); book.setAttribute('aria-disabled', 'true');
		status.textContent = en() ? 'Opening the codex…' : 'Il codice si sta aprendo…';
		timeout = window.setTimeout(() => enterSite(), 15000);
		await ensureScene();
		if (!is('loading')) return;
		clearTimeout(timeout);
		if (!scene) { enterSite(); return; }
		setState('playing');
		scene.resume();
		portal = createCodexPortal(sceneHost);
		scene.open();
		timeout = window.setTimeout(() => enterSite(true), 10000);
	};

	const enterSite = (immediate = false) => {
		if (is('done')) return;
		setState('done');
		try { sessionStorage.setItem('codex-entered-v1', '1'); } catch { /* Private browsing. */ }
		const finish = () => {
			clearTimeout(timeout);
			disposePortal();
			dialog.close();
			scene?.pause();
			open.removeAttribute('aria-disabled'); book.removeAttribute('aria-disabled');
			html.removeAttribute('data-codex-intro');
			lenis()?.start();
			document.dispatchEvent(new Event('codex:entered'));
			window.scrollTo({ top: savedScroll, behavior: 'instant' });
			const heading = document.querySelector<HTMLElement>('main h1');
			heading?.setAttribute('tabindex', '-1');
			heading?.focus({ preventScroll: true });
			heading?.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
			try {
				const url = new URL(location.href);
				if (url.searchParams.has('intro')) { url.searchParams.delete('intro'); history.replaceState(null, '', url); }
			} catch { /* ignore */ }
		};
		if (immediate || reduced.matches) { finish(); return; }
		const from = Number(dialog.style.getPropertyValue('--entrance-progress')) || 0;
		const animation = dialog.animate([{ opacity: 1 - from }, { opacity: 0 }], {
			duration: 650 * (1 - from), easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards',
		});
		animation.finished.then(finish).catch(finish);
	};

	// — Reverse: live site → cover, closing the book. Reuses the same scene:
	// by the time this is reachable the forward entrance already loaded it. —
	const returnToCodex = () => {
		if (!is('done') || dialog.open) return;
		savedScroll = window.scrollY;
		dialog.getAnimations().forEach(animation => animation.cancel());
		html.dataset.codexIntro = 'active';
		setState('closing');
		lenis()?.stop();
		dialog.showModal();
		dialog.focus({ preventScroll: true });
		if (!scene || reduced.matches || failed) { returnDone(); return; }
		status.textContent = en() ? 'Closing the codex…' : 'Il codice si sta chiudendo…';
		// Grab the live DOM and pin it full-screen *before* the dialog appears,
		// so opening the modal causes no visible change at all.
		portal = createCodexPortal(sceneHost, { scrollOffset: savedScroll });
		portal.update(1);
		timeout = window.setTimeout(() => returnDone(), 15000);
		scene.resume();
		scene.close();
	};

	const returnDone = () => {
		if (!is('closing')) return;
		clearTimeout(timeout);
		disposePortal();
		// The scene itself is left running at its closed pose — the cover stays
		// real-time 3D, never a photo standing in while idle.
		setState('idle');
		status.textContent = en() ? 'Back at the cover.' : 'Di nuovo alla copertina.';
		try {
			const url = new URL(location.href);
			url.searchParams.set('intro', '1'); history.replaceState(null, '', url);
		} catch { /* ignore */ }
		open.focus({ preventScroll: true });
	};

	/** Escape while the book is closing cancels the trip back and keeps the reader on the site. */
	const returnCancel = () => {
		if (!is('closing')) return;
		clearTimeout(timeout);
		disposePortal();
		dialog.close();
		html.removeAttribute('data-codex-intro');
		lenis()?.start();
		setState('done');
		window.scrollTo({ top: savedScroll, behavior: 'instant' });
		const heading = document.querySelector<HTMLElement>('main h1');
		heading?.focus({ preventScroll: true });
	};

	const bindReturnButtons = () => {
		document.querySelectorAll<HTMLAnchorElement>('[data-codex-return]').forEach(btn => {
			btn.addEventListener('click', event => {
				if (!is('done')) return;
				event.preventDefault();
				returnToCodex();
			}, { signal: pageSignal });
		});
	};

	try {
		// Reduced motion never loads the 3D: show the still cover, not the loader.
		if (reduced.matches) dialog.dataset.scene = 'still'; else setLoaderInert(true);
		dialog.showModal(); dialog.focus({ preventScroll: true }); html.dataset.codexIntro = 'active';
		savedScroll = window.scrollY;
		bindReturnButtons();
		open.addEventListener('click', () => { dragged = false; void enter(); }, { signal: pageSignal });
		book.addEventListener('click', () => void enter(), { signal: pageSignal });
		skip.addEventListener('click', () => { if (!is('done') && !is('closing')) enterSite(true); }, { signal: pageSignal });
		applyDark(dark);
		light.addEventListener('click', () => setDark(!dark), { signal: pageSignal });
		dialog.addEventListener('cancel', event => {
			event.preventDefault();
			if (is('closing')) returnCancel();
			else if (!is('done')) enterSite();
		}, { signal: pageSignal });
		dialog.addEventListener('pointerdown', event => { dragged = false; downX = event.clientX; downY = event.clientY; }, { signal: pageSignal });
		dialog.addEventListener('pointermove', event => {
			if (!is('idle')) return;
			if (event.pointerType === 'touch' && !event.buttons) return;
			if (event.buttons && Math.hypot(event.clientX - downX, event.clientY - downY) > 8) dragged = true;
			scene?.move(event.clientX / innerWidth * 2 - 1, event.clientY / innerHeight * 2 - 1);
		}, { signal: pageSignal, passive: true });
		dialog.addEventListener('pointerleave', () => { if (is('idle')) scene?.move(0, 0); }, { signal: pageSignal });
		dialog.addEventListener('keydown', event => {
			if (event.key === 'Tab') {
				// The loader (while up) makes book/open inert, so only ever wrap
				// around the controls that are actually reachable right now.
				const buttons = [book, open, ...(dialog.dataset.scene === 'ready' ? [light] : []), skip].filter(el => !el.inert);
				const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
				if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === buttons.length - 1)) {
					event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0].focus();
				}
			} else if (is('idle') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
				event.preventDefault();
				scene?.move(event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0, event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0);
			}
		}, { signal: pageSignal });
		reduced.addEventListener('change', () => {
			if (!reduced.matches) return;
			if (is('idle') || is('loading') || is('playing')) { sceneController?.abort(); scene?.dispose(); scene = undefined; sceneReady = undefined; enterSite(true); }
			else if (is('closing')) { scene?.dispose(); scene = undefined; sceneReady = undefined; returnDone(); }
		}, { signal: pageSignal });
		addEventListener('hashchange', () => { savedScroll = 0; if (!is('done') && !is('closing')) enterSite(true); }, { signal: pageSignal });
		addEventListener('pagehide', () => { discardScene(); page.abort(); }, { signal: pageSignal, once: true });
		// The parchment loader is painted first; the model download starts right
		// after, once the browser has had a frame to show it — never behind a
		// static poster standing in as a fake "screen".
		requestAnimationFrame(() => requestAnimationFrame(() => { if (is('idle')) void ensureScene(); }));
	} catch { discardScene(); dialog.remove(); }
}
