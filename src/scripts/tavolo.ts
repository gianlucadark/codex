/**
 * Il tavolo di bottega — paper physics for the projects desk.
 *
 * Every `[data-item]` on the desk (the sheets, the dividers, the quill) can be
 * picked up and moved. A sheet grabbed off-centre pivots around the finger, so
 * its centre trails behind the pointer. Let go while moving and it glides
 * briefly before settling on the wood.
 *
 * State lives here (centre in desk pixels + rotation); the DOM only receives a
 * transform. On a narrow desk each sheet has a snap slot. Its reference strip
 * can be picked up; swiping the artwork pans the bench.
 */

interface Item {
	el: HTMLElement;
	sheet: boolean;
	home: { x: number; y: number; r: number };
	x: number;
	y: number;
	r: number;
	vx: number;
	vy: number;
	vr: number;
	w: number;
	h: number;
	flying: boolean;
	flyTimer?: number;
}

const COMPACT = '(max-width: 959px)';
const DEG = Math.PI / 180;

export function initTavolo() {
	const desk = document.querySelector<HTMLElement>('[data-tavolo]');
	if (!desk) return;
	const compact = matchMedia(COMPACT);
	let stop: (() => void) | null = null;

	const apply = () => {
		stop?.();
		stop = live(desk, compact.matches);
	};
	compact.addEventListener('change', apply);
	apply();
}

function live(desk: HTMLElement, compact: boolean): () => void {
	const reduce = matchMedia('(prefers-reduced-motion: reduce)');
	const abort = new AbortController();
	const { signal } = abort;
	const section = desk.closest('section') ?? desk;
	const viewport = desk.parentElement!;

	desk.classList.add('desk-live');

	const items: Item[] = Array.from(desk.querySelectorAll<HTMLElement>(compact ? '[data-sheet]' : '[data-item]')).map((el) => ({
		el,
		sheet: el.hasAttribute('data-sheet'),
		home: { x: Number(el.dataset.x), y: Number(el.dataset.y), r: Number(el.dataset.r) },
		x: 0,
		y: 0,
		r: 0,
		vx: 0,
		vy: 0,
		vr: 0,
		w: el.offsetWidth,
		h: el.offsetHeight,
		flying: false,
	}));
	const sheets = items.filter((it) => it.sheet);
	const slots = sheets.map(it => it.el.parentElement!);
	const byEl = new Map(items.map((it) => [it.el, it]));

	const moving = new Set<Item>();
	let raf = 0;
	let last = 0;
	const layoutWidth = () => compact && slots.length ? slots[0].clientWidth : desk.clientWidth;
	let W = layoutWidth();
	let H = desk.clientHeight;
	let top = items.length;

	const write = (it: Item) => {
		it.el.style.transform = `translate3d(${it.x - it.w / 2}px, ${it.y - it.h / 2}px, 0) rotate(${it.r}deg)`;
		if (it.sheet) {
			it.el.style.setProperty('--bearing', `${it.r}deg`);
			it.el.style.setProperty('--exposure', (1.065 - .105 * it.x / W - .045 * it.y / H).toFixed(3));
		}
	};
	const raise = (it: Item) => {
		it.el.style.zIndex = String(++top);
	};
	/** Keep most of each item reachable, even after a fast throw. */
	const bounds = (it: Item) => ({
		minX: it.w * 0.42,
		maxX: W - it.w * 0.42,
		minY: it.h * 0.42,
		maxY: H - it.h * 0.42,
	});

	/** Stop a CSS flight where it is, so a hand can catch a sheet mid-air. */
	const settle = (it: Item) => {
		if (!it.flying) return;
		const m = new DOMMatrixReadOnly(getComputedStyle(it.el).transform);
		it.r = Math.atan2(m.b, m.a) / DEG;
		it.x = m.e + it.w / 2;
		it.y = m.f + it.h / 2;
		land(it);
		write(it);
	};
	const land = (it: Item) => {
		it.flying = false;
		clearTimeout(it.flyTimer);
		it.el.classList.remove('is-flying');
		it.el.style.transitionDelay = '';
	};
	const fly = (it: Item, x: number, y: number, r: number, delay = 0) => {
		moving.delete(it);
		it.vx = it.vy = it.vr = 0;
		it.x = x;
		it.y = y;
		it.r = r;
		if (reduce.matches) {
			land(it);
			write(it);
			return;
		}
		it.flying = true;
		it.el.classList.add('is-flying');
		it.el.style.transitionDelay = `${delay}ms`;
		write(it);
		clearTimeout(it.flyTimer);
		it.flyTimer = window.setTimeout(() => land(it), delay + 850);
	};

	// — Layouts —
	const toHome = (it: Item) => compact
		? [W / 2, H * Number(it.el.style.getPropertyValue('--mobile-y')), Math.max(-4, Math.min(4, it.home.r))] as const
		: [it.home.x * W, it.home.y * H, it.home.r] as const;
	const pile = (i: number) => [W * 0.5 + (i - 2.5) * 4, H * 0.5 + (i % 2 ? 5 : -5), (i % 2 ? 1 : -1) * (2 + i * 1.3)] as const;

	const gather = () => {
		sheets.forEach((it, i) => {
			raise(it);
			fly(it, ...pile(i), i * 60);
		});
	};
	const scatter = () => {
		const places = sheets.map(it => it.home);
		for (let i = places.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[places[j], places[i]] = [places[i], places[j]];
		}
		sheets.forEach((it, i) => {
			const { x: cx, y: cy } = places[i];
			const inside = (v: number, size: number, max: number) =>
				Math.max(Math.min(size / 2 + 24, max / 2), Math.min(Math.max(max - size / 2 - 24, max / 2), v));
			const x = inside((cx + (Math.random() - 0.5) * 0.065) * W, it.w, W);
			const y = inside((cy + (Math.random() - 0.5) * 0.075) * H, it.h, H);
			raise(it);
			fly(it, x, y, (Math.random() - 0.5) * 18, i * 70);
		});
	};

	items.forEach((it) => {
		[it.x, it.y, it.r] = toHome(it);
		write(it);
	});
	sheets.forEach((it) => raise(it));
	if (compact) {
		// A grip drag belongs to the sheet. Let swipes elsewhere scroll natively,
		// and keep the browser from treating the next tap as a request to stop a fling.
		desk.querySelectorAll<HTMLElement>('[data-grip]').forEach(grip => {
			grip.addEventListener('touchmove', event => event.preventDefault(), { signal, passive: false });
		});
		const prev = section.querySelector<HTMLButtonElement>('[data-prev]')!;
		const next = section.querySelector<HTMLButtonElement>('[data-next]')!;
		const current = section.querySelector<HTMLElement>('[data-current]')!;
		// The first and last slots have equal end padding, so both can centre.
		const currentIndex = () => Math.max(0, Math.min(slots.length - 1, Math.round(viewport.scrollLeft / layoutWidth())));
		const sync = () => {
			const index = currentIndex();
			current.textContent = String(index + 1);
			prev.disabled = index === 0;
			next.disabled = index >= slots.length - 1;
		};
		const pan = (direction: number) => {
			const target = slots[currentIndex() + direction];
			if (!target) return;
			const left = target.offsetLeft + target.offsetWidth / 2 - viewport.clientWidth / 2;
			viewport.scrollTo({ left, behavior: reduce.matches ? 'instant' : 'smooth' });
		};
		prev.addEventListener('click', () => pan(-1), { signal });
		next.addEventListener('click', () => pan(1), { signal });
		viewport.addEventListener('scroll', sync, { signal, passive: true });
		window.addEventListener('resize', sync, { signal });
		sync();
	}

	if (!compact) {
		section.querySelector('[data-gather]')?.addEventListener('click', gather, { signal });
		section.querySelector('[data-scatter]')?.addEventListener('click', scatter, { signal });
	}

	// — Inertia —
	const step = (t: number) => {
		const dt = last ? Math.min(32, t - last) : 16;
		last = t;
		for (const it of moving) {
			it.x += it.vx * dt;
			it.y += it.vy * dt;
			it.r += it.vr * dt;
			const f = Math.pow(0.989, dt);
			it.vx *= f;
			it.vy *= f;
			it.vr *= Math.pow(0.991, dt);
			const b = bounds(it);
			if (it.x < b.minX) { it.x = b.minX; it.vx = Math.abs(it.vx) * 0.45; }
			if (it.x > b.maxX) { it.x = b.maxX; it.vx = -Math.abs(it.vx) * 0.45; }
			if (it.y < b.minY) { it.y = b.minY; it.vy = Math.abs(it.vy) * 0.45; }
			if (it.y > b.maxY) { it.y = b.maxY; it.vy = -Math.abs(it.vy) * 0.45; }
			write(it);
			if (Math.hypot(it.vx, it.vy) < 0.012 && Math.abs(it.vr) < 0.004) moving.delete(it);
		}
		if (moving.size) raf = requestAnimationFrame(step);
		else {
			raf = 0;
			last = 0;
		}
	};
	const glide = (it: Item) => {
		moving.add(it);
		if (!raf) raf = requestAnimationFrame(step);
	};

	// — Hands —
	let hold: {
		it: Item;
		id: number;
		lx: number;
		ly: number;
		px: number;
		py: number;
		sx: number;
		sy: number;
		moved: boolean;
		trail: { t: number; x: number; y: number; r: number }[];
	} | null = null;
	let swallowClick = false;
	const surface = (it: Item) => compact ? it.el.parentElement! : desk;

	desk.addEventListener(
		'pointerdown',
		(e) => {
			const target = e.target as Element;
			if (e.button !== 0 || hold || target.closest('button')) return;
			if (compact && e.pointerType === 'touch' && !target.closest('[data-grip]')) return;
			const el = (e.target as Element).closest<HTMLElement>('[data-item]');
			const it = el && byEl.get(el);
			if (!it) return;
			settle(it);
			moving.delete(it);
			const origin = surface(it).getBoundingClientRect();
			const px = e.clientX - origin.left;
			const py = e.clientY - origin.top;
			// The grab point, in the sheet's own (unrotated) frame.
			const dx = px - it.x;
			const dy = py - it.y;
			const c = Math.cos(-it.r * DEG);
			const s = Math.sin(-it.r * DEG);
			hold = { it, id: e.pointerId, lx: dx * c - dy * s, ly: dx * s + dy * c, px, py, sx: px, sy: py, moved: false, trail: [] };
			// Capture only once it really moves: capturing now would retarget the
			// click of a plain tap away from the title link.
			raise(it);
		},
		{ signal },
	);

	window.addEventListener(
		'pointermove',
		(e) => {
			if (!hold || e.pointerId !== hold.id) return;
			const { it } = hold;
			const origin = surface(it).getBoundingClientRect();
			const px = e.clientX - origin.left;
			const py = e.clientY - origin.top;
			const ddx = px - hold.px;
			const ddy = py - hold.py;
			hold.px = px;
			hold.py = py;
			if (!hold.moved) {
				if (Math.hypot(px - hold.sx, py - hold.sy) <= 4) return;
				hold.moved = true;
				if (it.sheet) {
					it.el.style.setProperty('--tilt-x', `${5 * hold.ly / it.h}deg`);
					it.el.style.setProperty('--tilt-y', `${-6 * hold.lx / it.w}deg`);
				}
				it.el.classList.add('is-held');
				it.el.setPointerCapture(e.pointerId);
			}

			// Torque: the pointer drags the grab point, the sheet turns so its
			// centre trails behind (r × d over r², softened near the centre).
			let c = Math.cos(it.r * DEG);
			let s = Math.sin(it.r * DEG);
			const rx = hold.lx * c - hold.ly * s;
			const ry = hold.lx * s + hold.ly * c;
			const turn = Math.max(-0.06, Math.min(0.06, (rx * ddy - ry * ddx) / (rx * rx + ry * ry + 1800)));
			it.r += turn * 0.6 / DEG;
			c = Math.cos(it.r * DEG);
			s = Math.sin(it.r * DEG);
			it.x = px - (hold.lx * c - hold.ly * s);
			it.y = py - (hold.lx * s + hold.ly * c);
			write(it);

			hold.trail.push({ t: e.timeStamp, x: it.x, y: it.y, r: it.r });
			if (hold.trail.length > 8) hold.trail.shift();
		},
		{ signal },
	);

	const release = (e: PointerEvent) => {
		if (!hold || e.pointerId !== hold.id) return;
		const { it, moved, trail } = hold;
		hold = null;
		it.el.classList.remove('is-held');
		if (it.el.hasPointerCapture(e.pointerId)) it.el.releasePointerCapture(e.pointerId);
		if (!moved) return;

		// A drag is not a click: keep the links from firing on release.
		swallowClick = true;
		setTimeout(() => (swallowClick = false), 0);

		if (compact) {
			fly(it, ...toHome(it));
			return;
		}
		const recent = trail.filter((p) => e.timeStamp - p.t < 90);
		const a = recent[0];
		const b = recent[recent.length - 1];
		const span = a && b ? b.t - a.t : 0;
		if (e.type === 'pointerup' && !reduce.matches && span > 8) {
			const cap = (v: number, m: number) => Math.max(-m, Math.min(m, v));
			it.vx = cap((b.x - a.x) / span, 2.6);
			it.vy = cap((b.y - a.y) / span, 2.6);
			it.vr = cap((b.r - a.r) / span, 0.5);
			glide(it);
			return;
		}
		// Dropped (not thrown) past the edge: slide back onto the pad.
		const bd = bounds(it);
		const x = Math.max(bd.minX, Math.min(bd.maxX, it.x));
		const y = Math.max(bd.minY, Math.min(bd.maxY, it.y));
		if (x !== it.x || y !== it.y) fly(it, x, y, it.r);
	};
	window.addEventListener('pointerup', release, { signal });
	window.addEventListener('pointercancel', release, { signal });
	desk.addEventListener(
		'click',
		(e) => {
			if (!swallowClick) return;
			e.preventDefault();
			e.stopPropagation();
		},
		{ capture: true, signal },
	);
	desk.addEventListener('click', (e) => {
		const button = (e.target as Element).closest<HTMLButtonElement>('[data-turn]');
		const sheet = button?.closest<HTMLElement>('[data-sheet]');
		if (!sheet) return;
		const turned = sheet.classList.toggle('is-turned');
		const recto = sheet.querySelector<HTMLElement>('[data-face="recto"]')!;
		const verso = sheet.querySelector<HTMLElement>('[data-face="verso"]')!;
		recto.inert = turned;
		verso.inert = !turned;
		(turned ? verso : recto).querySelector<HTMLButtonElement>('[data-turn]')?.focus({ preventScroll: true });
	}, { signal });
	// Keyboard focus brings a sheet to the top of the pile.
	desk.addEventListener(
		'focusin',
		(e) => {
			const el = (e.target as Element).closest<HTMLElement>('[data-item]');
			const it = el && byEl.get(el);
			if (it) raise(it);
		},
		{ signal },
	);

	// Keep the layout proportional when the desk changes size.
	const resize = new ResizeObserver(() => {
		const nw = layoutWidth();
		const nh = desk.clientHeight;
		if (!nw || !nh || (nw === W && nh === H)) return;
		const scaleX = nw / W;
		const scaleY = nh / H;
		W = nw;
		H = nh;
		for (const it of items) {
			settle(it);
			it.x *= scaleX;
			it.y *= scaleY;
			it.w = it.el.offsetWidth;
			it.h = it.el.offsetHeight;
			write(it);
		}
	});
	resize.observe(desk);

	return () => {
		abort.abort();
		resize.disconnect();
		cancelAnimationFrame(raf);
		moving.clear();
		desk.classList.remove('desk-live');
		viewport.scrollLeft = 0;
		for (const it of items) {
			land(it);
			it.el.classList.remove('is-held');
			it.el.style.transform = '';
			it.el.style.zIndex = '';
			it.el.style.removeProperty('--bearing');
			it.el.style.removeProperty('--exposure');
		}
	};
}
