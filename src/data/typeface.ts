/** Data for the Typeface ("Manus Auctoris") folio: facts, process and usage. */

/** A single specimen fact (glyph count, ligatures…). */
export interface TypeFact {
	value: string;
	it: string;
	en: string;
}

/** One step of the "how the font was made" process. */
export interface TypeStage {
	step: string;
	it: string;
	en: string;
	itText: string;
	enText: string;
}

/** One "how the font is used" note. */
export interface TypeFeature {
	it: string;
	en: string;
	itText: string;
	enText: string;
}

export const facts: TypeFact[] = [
	{ value: '166', it: 'glifi', en: 'glyphs' },
	{ value: 'calt', it: 'varianti naturali', en: 'no repeats' },
	{ value: 'fi · tt', it: 'legature', en: 'ligatures' },
	{ value: '×3', it: 'TTF · WOFF · WOFF2', en: 'TTF · WOFF · WOFF2' },
];

export const stages: TypeStage[] = [
	{
		step: '01',
		it: 'Campione',
		en: 'Sample',
		itText: 'Prima ho scritto alfabeti, numeri e segni su carta, cercando il ritmo naturale della mia mano.',
		enText: 'First I wrote alphabets, numbers and marks on paper, keeping the natural rhythm of my hand.',
	},
	{
		step: '02',
		it: 'Disegno',
		en: 'Drawing',
		itText: 'Poi ho ripulito ogni forma senza renderla troppo perfetta: il tremolio resta parte della firma.',
		enText: 'Then I cleaned each shape without making it too perfect: the small wobble stays part of the signature.',
	},
	{
		step: '03',
		it: 'Font',
		en: 'Font',
		itText: 'Infine ho costruito spaziature, accenti, legature e varianti per usarlo davvero nel sito.',
		enText: 'Finally I built spacing, accents, ligatures and alternates so it could actually live on the site.',
	},
];

export const features: TypeFeature[] = [
	{
		it: 'Titoli e firme',
		en: 'Titles and signatures',
		itText: 'Usato dove serve una voce personale, non per lunghi blocchi di lettura.',
		enText: 'Used where a personal voice helps, not for long reading passages.',
	},
	{
		it: 'Alternative automatiche',
		en: 'Automatic alternates',
		itText: 'Le varianti contestuali spezzano la ripetizione delle lettere uguali.',
		enText: 'Contextual alternates break up repeated identical letters.',
	},
	{
		it: 'Supporto web',
		en: 'Web-ready',
		itText: 'Esportato in formati leggeri e caricato come font self-hosted.',
		enText: 'Exported in lightweight formats and loaded as a self-hosted font.',
	},
];
