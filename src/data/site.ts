/**
 * Single source of truth for site-wide identity, SEO defaults and contact
 * links. This is the single source of truth for the public site domain.
 */
export const site = {
	/** Public domain. Used for canonical URLs, sitemap and absolute OG URLs. */
	url: 'https://codex-gianluca.vercel.app',
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
		/** CV scaricabile: metti il PDF in /public e imposta il percorso (es. '/cv.pdf'). */
		cv: '',
	},
} as const;
