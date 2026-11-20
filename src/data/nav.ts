/** A link in the "Insula" index. Absolute (/#anchor) so it works from any folio. */
export interface NavLink {
	it: string;
	en: string;
	href: string;
}

// In reading order, including when returning from a project folio.
export const navLinks: NavLink[] = [
	{ it: 'Progetti', en: 'Work', href: '/#progetti' },
	{ it: 'Chi sono', en: 'About', href: '/#chi-sono' },
	{ it: 'Competenze', en: 'Skills', href: '/#competenze' },
	{ it: 'Il font', en: 'Typeface', href: '/#font' },
	{ it: 'Riconoscimenti', en: 'Awards', href: '/#riconoscimenti' },
	{ it: 'Contatti', en: 'Contact', href: '/#contatti' },
];
