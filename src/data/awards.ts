import type { ImageMetadata } from 'astro';

import siteOfTheDay from '../assets/awards/site-of-the-day.webp';
import wdAwardsNominee from '../assets/awards/wd-awards-nominee.webp';
import favouriteWebDesign from '../assets/awards/favourite-web-design.webp';

/** A single "lauro" of the codex — a recognition with its framed certificate. */
export interface Award {
	/** Short mark stamped on the seal (e.g. SOTD). */
	seal: string;
	title: string;
	category: string;
	/** Roman-numeral year, kept consistent with the codex dating. */
	date: string;
	image: ImageMetadata;
}

export const awards: Award[] = [
	{
		seal: 'SOTD',
		title: 'Site of the Day',
		category: 'Design Nominees',
		date: 'MMXXVI',
		image: siteOfTheDay,
	},
	{
		seal: 'NOM',
		title: 'Awards Nominee',
		category: 'WD Awards',
		date: 'MMXXVI',
		image: wdAwardsNominee,
	},
	{
		seal: 'FAV',
		title: 'Favourite Web Design',
		category: 'WD Awards',
		date: 'MMXXVI',
		image: favouriteWebDesign,
	},
];
