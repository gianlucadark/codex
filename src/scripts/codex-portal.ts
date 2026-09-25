/** Crossfade the native responsive document after the camera reaches the paper, then return it
 * to its original position. No iframe, duplicate DOM, screenshot or route reload.
 * The same projection runs both ways: progress rising mounts the live DOM and
 * reveals it at native size (entering); progress falling fades it back
 * into the page and hands the DOM back (returning to the book).
 */
export function createCodexPortal(host: HTMLElement, options: { scrollOffset?: number } = {}) {
	const { scrollOffset = 0 } = options;
	const surface = document.createElement('div');
	surface.className = 'codex-live-portal';
	surface.inert = true;
	surface.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;background:#d4be97;pointer-events:none;contain:layout paint;opacity:0;';
	host.append(surface);
	const sources = [document.querySelector<HTMLElement>('[data-codex-nav]'), document.querySelector<HTMLElement>('main.codex')].filter((node): node is HTMLElement => !!node);
	const slots: { node: HTMLElement; marker: Comment }[] = [];
	let mounted = false;
	const mount = () => {
		mounted = true;
		for (const node of sources) {
			const marker = document.createComment('codex-portal-origin');
			node.before(marker); slots.push({ node, marker }); surface.append(node);
			// The moved <main> becomes its own containing block once the transformed
			// surface wraps it, so it would otherwise render from the top of the
			// page. Shifting it back by the saved scroll keeps the returning shot
			// matching whatever the reader was actually looking at.
			if (scrollOffset && node.tagName === 'MAIN') node.style.transform = `translateY(${-scrollOffset}px)`;
		}
	};
	const unmount = () => {
		for (const { node, marker } of slots) { node.style.transform = ''; marker.replaceWith(node); }
		slots.length = 0;
		mounted = false;
	};
	return {
		update(progress: number) {
			// The camera crosses the paper first. HTML stays at its native viewport
			// size throughout: no homography, scale, perspective or moving rectangle.
			const reveal = Math.max(0, Math.min(1, (progress - .79) / .21));
			if (!reveal) { if (mounted) unmount(); surface.style.opacity = '0'; return; }
			if (!mounted) mount();
			surface.style.width = '100%'; surface.style.height = '100%';
			surface.style.opacity = String(reveal * reveal * (3 - 2 * reveal));
		},
		dispose() { unmount(); surface.remove(); },
	};
}
