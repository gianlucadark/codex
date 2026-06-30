/**
 * Single source of truth for site-wide identity, SEO defaults and contact
 * links. Swap the placeholders here when the real domain / handles are ready —
 * this is the only file you need to touch.
 */
export const site = {
	/** TODO: dominio reale. Usato per canonical, sitemap e URL assoluti OG. */
	url: 'https://gianluca-darcangelo.example',
	name: "Gianluca D'Arcangelo",
	role: 'Fullstack Developer · 3D · UI/UX Design',
	title: "Gianluca D'Arcangelo — Codex · Portfolio",
	description:
		"Portfolio di Gianluca D'Arcangelo, fullstack developer · 3D · UI/UX design. Un codice miniato fatto a mano.",
	locale: 'it_IT',
	localeAlternate: 'en_GB',
	/** Open Graph share image, relative to the site root (in /public). */
	ogImage: '/og.png',

	/** Contatti. I link vuoti non vengono mostrati finché non li compili. */
	contact: {
		email: 'gianlucadark1@gmail.com',
		linkedin: 'https://www.linkedin.com/in/gianluca-d-arcangelo',
		place: 'Sperlonga, Italia',
	},
} as const;
