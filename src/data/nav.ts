/** A link in the "Insula" index. Absolute (/#anchor) so it works from any folio. */
export interface NavLink {
	it: string;
	en: string;
	href: string;
}

// L'ordine rispecchia la successione delle sezioni nella pagina
// (index.astro): Chi sono → Progetti → Competenze → Il font → Riconoscimenti → Contatti.
export const navLinks: NavLink[] = [
	{ it: 'Chi sono', en: 'About', href: '/#chi-sono' },
	{ it: 'Progetti', en: 'Work', href: '/#progetti' },
	{ it: 'Competenze', en: 'Skills', href: '/#competenze' },
	{ it: 'Il font', en: 'Typeface', href: '/#font' },
	{ it: 'Riconoscimenti', en: 'Awards', href: '/#riconoscimenti' },
	{ it: 'Contatti', en: 'Contact', href: '/#contatti' },
];
