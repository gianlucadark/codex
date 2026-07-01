/** A link in the "Insula" index. Absolute (/#anchor) so it works from any folio. */
export interface NavLink {
	it: string;
	en: string;
	href: string;
}

export const navLinks: NavLink[] = [
	{ it: 'Chi sono', en: 'About', href: '/#chi-sono' },
	{ it: 'Il font', en: 'Typeface', href: '/#font' },
	{ it: 'Progetti', en: 'Work', href: '/#progetti' },
	{ it: 'Competenze', en: 'Skills', href: '/#competenze' },
	{ it: 'Contatti', en: 'Contact', href: '/#contatti' },
];
