/** Project the real, responsive document into the book's page, then return it
 * to its original position. No iframe, duplicate DOM, screenshot or route reload.
 * The same projection runs both ways: progress rising mounts the live DOM and
 * grows it to fill the screen (entering); progress falling shrinks it back
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
		update(progress: number, points: number[]) {
			if (progress < .48) {
				if (mounted) { unmount(); surface.style.opacity = '0'; }
				return;
			}
			if (!mounted) mount();
			const width = innerWidth, height = innerHeight;
			surface.style.width = `${width}px`; surface.style.height = `${height}px`;
			const raw = Math.max(0, Math.min(1, (progress - .76) / .24));
			const blend = raw * raw * (3 - 2 * raw);
			const full = [0, 0, width, 0, width, height, 0, height];
			const p = points.map((value, i) => value + (full[i] - value) * blend);
			const [x0, y0, x1, y1, x2, y2, x3, y3] = p;
			const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
			const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
			const determinant = dx1 * dy2 - dx2 * dy1;
			if (Math.abs(determinant) < .001) return;
			const g = (dx3 * dy2 - dx2 * dy3) / determinant;
			const h = (dx1 * dy3 - dx3 * dy1) / determinant;
			const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3;
			const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
			surface.style.transform = `matrix3d(${a / width},${d / width},0,${g / width},${b / height},${e / height},0,${h / height},0,0,1,0,${x0},${y0},0,1)`;
			// Keep the ink study visible through the open-book pause. Reveal the
			// live page only as the camera enters it; reverse the same fade on exit.
			const reveal = Math.max(0, Math.min(1, (progress - .74) / .16));
			surface.style.opacity = String(reveal * reveal * (3 - 2 * reveal));
			surface.style.filter = `brightness(${.84 + blend * .16})`;
		},
		dispose() {
			unmount();
			surface.remove();
		},
	};
}
