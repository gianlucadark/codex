import type { ImageMetadata } from 'astro';

import uxabilityCover from '../assets/progetti/uxability.webp';
import uxabilityExtensionCover from '../assets/progetti/uxability-extension.webp';
import portfolio3dCover from '../assets/progetti/portfolio-3d.webp';
import portfolio3dCover2 from '../assets/progetti/portfolio-3d-2.webp';
import lightshipCover from '../assets/progetti/lightship.webp';
import cretaCover from '../assets/progetti/creta.webp';

/** A single "tavola" (plate) in the projects section of the codex. */
export interface Project {
	/** Roman numeral shown as the illuminated index. */
	numeral: string;
	/** URL fragment for the dedicated detail folio (/progetti/<slug>). */
	slug: string;
	title: string;
	/** Tech stack, set in the serif italic. */
	stack: string;
	/** Description (Italian). */
	desc: string;
	/** Description (English gloss). */
	descEn: string;

	/* — Detail folio fields — */
	/** Short category, the "genere" of the plate. */
	category: string;
	categoryEn: string;
	year: string;
	role: string;
	/** Project status, shown in the meta block. */
	status: string;
	/** Longer opening paragraph for the detail page (Italian). */
	summary: string;
	/** Longer opening paragraph for the detail page (English). */
	summaryEn: string;
	/** Bilingual feature bullets — the "note di bottega". */
	highlights: { it: string; en: string }[];
	/**
	 * Optional case-study narrative for the detail folio. Each block is bilingual
	 * and rendered only when present, so you can flesh out a project's story
	 * (problem → approach → result) without touching the template.
	 */
	caseStudy?: {
		problem?: { it: string; en: string };
		approach?: { it: string; en: string };
		result?: { it: string; en: string };
	};
	/** Optional outbound links (live demo, repo, case study), label per language. */
	links?: { it: string; en: string; href: string }[];
	/**
	 * Optional landscape images for the detail folio. When set, they replace the
	 * placeholder photo slot; each is drawn as its own horizontal plate. Import
	 * them from `src/assets/progetti/` and assign here:
	 *   import shot from '../assets/progetti/uxability.webp';
	 *   images: [shot],
	 */
	images?: ImageMetadata[];
}

export const projects: Project[] = [
	{
		numeral: 'I',
		slug: 'uxability',
		title: 'UXability',
		stack: 'Angular · AI Analysis · UX Audit',
		desc: 'Analizza UX, accessibilità, SEO e AEO in un’unica scansione leggibile.',
		descEn: 'Analyses UX, accessibility, SEO and AEO in one readable scan.',
		category: 'Web App · Quality Analysis',
		categoryEn: 'Web App · Quality Analysis',
		year: 'MMXXVI · 2026',
		role: 'Fullstack · Product',
		status: 'completato · completed',
		summary:
			'UXability trasforma l’analisi qualità di un sito in un flusso unico e leggibile. Scansiona una pagina, evidenzia i problemi, assegna punteggi e traduce UX, accessibilità, SEO e AEO in priorità d’intervento concrete.',
		summaryEn:
			'UXability turns website quality analysis into one readable workflow. It scans a page, surfaces issues, assigns scores and translates UX, accessibility, SEO and AEO into concrete improvement priorities.',
		highlights: [
			{ it: 'Scansione unica che combina UX, accessibilità, SEO e AEO.', en: 'A single scan combining UX, accessibility, SEO and AEO.' },
			{ it: 'Analisi automatica della pagina con evidenziazione dei problemi.', en: 'Automatic page analysis with issues highlighted.' },
			{ it: 'Report dettagliati con punteggi per ogni area di qualità.', en: 'Detailed reports with scores for each quality area.' },
			{ it: 'Suggerimenti mirati per l’esperienza utente e la visibilità sugli AI search engine.', en: 'Targeted suggestions for user experience and AI search engine visibility.' },
		],
		caseStudy: {
			problem: {
				it: 'Avevo bisogno di monitorare la qualità dei miei progetti — UX, accessibilità, SEO, AEO — senza saltare tra strumenti diversi e report scollegati.',
				en: 'I needed to monitor the quality of my own projects — UX, accessibility, SEO, AEO — without hopping between separate tools and disconnected reports.',
			},
			approach: {
				it: 'Ho raccolto tutti i controlli in un’unica web app: scansiona una pagina, evidenzia i problemi e li traduce in punteggi e priorità d’intervento leggibili.',
				en: 'I gathered every check into a single web app: it scans a page, surfaces issues and translates them into readable scores and improvement priorities.',
			},
			result: {
				it: 'È diventato il punto di partenza di una piccola famiglia di strumenti di qualità: la stessa analisi l’ho poi portata nel browser (estensione) e nella pipeline (Lightship).',
				en: 'It became the starting point of a small family of quality tools: the same analysis later moved into the browser (extension) and into the pipeline (Lightship).',
			},
		},
		links: [{ it: 'demo · live', en: 'demo · live', href: 'https://uxability.vercel.app' }],
		images: [uxabilityCover],
	},
	{
		numeral: 'II',
		slug: 'uxability-extension',
		title: 'UXability Browser Extension',
		stack: 'JavaScript · Browser APIs',
		desc: 'Controlla accessibilità, usabilità e SEO senza uscire dalla pagina.',
		descEn: 'Checks accessibility, usability and SEO without leaving the page.',
		category: 'Browser Extension',
		categoryEn: 'Browser Extension',
		year: 'MMXXVI · 2026',
		role: 'Frontend · Extension',
		status: 'completato · completed',
		summary:
			'L’estensione browser di UXability porta l’analisi direttamente dentro la navigazione. Con un clic controlla accessibilità, usabilità, SEO e AEO, mostrando gli errori sul sito aperto senza passare da strumenti esterni.',
		summaryEn:
			'The UXability browser extension brings analysis directly into the browsing flow. With one click it checks accessibility, usability, SEO and AEO, showing issues on the open site without requiring external tools.',
		highlights: [
			{ it: 'Analisi di qualsiasi pagina con un solo clic durante la navigazione.', en: 'One-click analysis of any page while browsing.' },
			{ it: 'Controlli di accessibilità, usabilità, SEO e AEO integrati.', en: 'Built-in accessibility, usability, SEO and AEO checks.' },
			{ it: 'Errori mostrati in tempo reale, direttamente sul sito.', en: 'Errors shown in real time, right on the site.' },
			{ it: 'Nessuno strumento esterno: tutto nel browser.', en: 'No external tools needed — everything in the browser.' },
		],
		caseStudy: {
			problem: {
				it: 'Gli stessi controlli di UXability mi servivano mentre navigavo, non solo aprendo un’app a parte: volevo vedere i problemi sul sito, nel momento in cui lo guardavo.',
				en: 'I wanted the same UXability checks while browsing, not only by opening a separate app: I needed to see issues on the site, right as I was looking at it.',
			},
			approach: {
				it: 'Ho portato l’analisi dentro il browser come estensione: con un clic controlla accessibilità, usabilità, SEO e AEO della pagina aperta e mostra gli errori in tempo reale.',
				en: 'I brought the analysis into the browser as an extension: one click checks accessibility, usability, SEO and AEO of the open page and shows the errors in real time.',
			},
			result: {
				it: 'La seconda tappa della famiglia UXability: l’analisi entra nel flusso di lavoro quotidiano, senza dover passare da strumenti esterni.',
				en: 'The second step of the UXability family: the analysis enters the everyday workflow, with no need for external tools.',
			},
		},
		images: [uxabilityExtensionCover],
	},
	{
		numeral: 'III',
		slug: 'portfolio-3d',
		title: 'Portfolio 3D',
		stack: 'Angular · Three.js · WebGL · Blender',
		desc: 'Un portfolio esplorabile che racconta progetti e competenze in 3D.',
		descEn: 'An explorable portfolio that presents projects and skills in 3D.',
		category: 'Esperienza 3D · Portfolio',
		categoryEn: '3D Experience · Portfolio',
		year: 'MMXXV · 2025',
		role: '3D · Creative Dev',
		status: 'completato · completed',
		summary:
			'Portfolio 3D trasforma una presentazione personale in un ambiente da esplorare. L’utente entra in una scena ispirata a Windows XP, interagisce con gli elementi e scopre progetti, tecnologie e informazioni attraverso un percorso narrativo.',
		summaryEn:
			'Portfolio 3D turns a personal presentation into an explorable environment. The user enters a Windows XP-inspired scene, interacts with its elements and discovers projects, technologies and information through a narrative path.',
		highlights: [
			{ it: 'Ambiente 3D esplorabile ispirato a Windows XP.', en: 'An explorable 3D environment inspired by Windows XP.' },
			{ it: 'Interazione diretta con gli elementi della scena.', en: 'Direct interaction with the elements of the scene.' },
			{ it: 'Progetti e tecnologie raccontati come un percorso narrativo.', en: 'Projects and technologies told as a narrative path.' },
			{ it: 'Alternativa immersiva alla tradizionale pagina web.', en: 'An immersive alternative to the traditional web page.' },
		],
		links: [{ it: 'demo · live', en: 'demo · live', href: 'https://gianlucadarcangelo.vercel.app' }],
		caseStudy: {
			problem: {
				it: 'Nessun problema da risolvere, ma una passione da inseguire: ricreare Windows XP e integrarlo con il 3D, trasformando una presentazione personale in qualcosa da esplorare.',
				en: 'No problem to solve, but a passion to chase: recreate Windows XP and integrate it with 3D, turning a personal presentation into something to explore.',
			},
			approach: {
				it: 'Ho costruito una scena 3D esplorabile ispirata a Windows XP, in cui si interagisce con gli elementi e si scoprono progetti e tecnologie seguendo un percorso narrativo.',
				en: 'I built an explorable 3D scene inspired by Windows XP, where you interact with its elements and discover projects and technologies along a narrative path.',
			},
			result: {
				it: 'Un’alternativa immersiva alla classica pagina web: la presentazione personale diventa un ambiente da attraversare, non una pagina da scorrere.',
				en: 'An immersive alternative to the classic web page: the personal presentation becomes an environment to move through, not a page to scroll.',
			},
		},
		images: [portfolio3dCover, portfolio3dCover2],
	},
	{
		numeral: 'IV',
		slug: 'lightship',
		title: 'Lightship',
		stack: 'Node.js · Rust · CLI',
		desc: 'CLI per controllare qualità, accessibilità e SEO prima del deploy.',
		descEn: 'CLI for checking quality, accessibility and SEO before deploy.',
		category: 'CLI · Lightship',
		categoryEn: 'CLI · Lightship',
		year: 'MMXXVI · 2026',
		role: 'Tooling · DX',
		status: 'in sviluppo · in progress',
		summary:
			'Lightship è una CLI per portare controlli di qualità dentro il flusso di sviluppo. Analizza codice e output prima della pubblicazione, verifica accessibilità, semantica HTML, SEO, performance e asset, e può bloccare le build sotto soglia.',
		summaryEn:
			'Lightship is a CLI that brings quality checks into the development workflow. It analyses code and output before publishing, verifies accessibility, HTML semantics, SEO, performance and assets, and can block builds below the configured threshold.',
		highlights: [
			{ it: 'Pensato per sviluppatori e pipeline CI/CD.', en: 'Built for developers and CI/CD pipelines.' },
			{ it: 'Controlli su accessibilità, semantica HTML, SEO, performance e asset.', en: 'Checks on accessibility, HTML semantics, SEO, performance and assets.' },
			{ it: 'Report dettagliati prima della pubblicazione.', en: 'Detailed reports before publishing.' },
			{ it: 'Blocca le build che non rispettano i requisiti di qualità configurati.', en: 'Blocks builds that fail the configured quality requirements.' },
		],
		caseStudy: {
			problem: {
				it: 'Sito ed estensione controllavano la qualità a lavoro finito: i problemi emergevano troppo tardi. Volevo gli stessi controlli prima del deploy, dentro il flusso di sviluppo.',
				en: 'The site and extension checked quality once the work was done: issues surfaced too late. I wanted the same checks before deploy, inside the development flow.',
			},
			approach: {
				it: 'Ho scritto una CLI che analizza codice e output prima della pubblicazione — accessibilità, semantica HTML, SEO, performance, asset — e può bloccare le build sotto soglia in CI/CD.',
				en: 'I built a CLI that analyses code and output before publishing — accessibility, HTML semantics, SEO, performance, assets — and can block builds below the threshold in CI/CD.',
			},
			result: {
				it: 'Chiude il cerchio della famiglia UXability: la stessa idea di qualità va dal sito al browser fino alla pipeline, spostando i controlli il più a monte possibile. (Questo stesso portfolio la usa.)',
				en: 'It closes the loop of the UXability family: the same quality idea runs from the site to the browser to the pipeline, pushing checks as far upstream as possible. (This very portfolio uses it.)',
			},
		},
		links: [{ it: 'npm · package', en: 'npm · package', href: 'https://www.npmjs.com/package/lightship-cli' }],
		images: [lightshipCover],
	},
	{
		numeral: 'V',
		slug: 'creta',
		title: 'Creta',
		stack: 'Next.js · React · Generative UI',
		desc: 'Trasforma un documento Word in una landing page coerente e modificabile.',
		descEn: 'Turns a Word document into a coherent, editable landing page.',
		category: 'Generative UI · Documenti',
		categoryEn: 'Generative UI · Documents',
		year: 'MMXXVI · 2026',
		role: 'Fullstack · AI',
		status: 'in sviluppo · in progress',
		summary:
			'Creta trasforma un documento in un’interfaccia: la struttura diventa design, il testo resta intatto. Dato un documento Word, Creta lo legge e ne genera automaticamente una landing page completa, traducendo titoli, sezioni e gerarchie in layout e componenti. I documenti si possono scrivere a mano, modificare e rielaborare, e la pagina si rigenera di conseguenza.',
		summaryEn:
			'Creta turns a document into an interface: structure becomes design, the text stays intact. Given a Word document, Creta reads it and automatically generates a complete landing page, translating headings, sections and hierarchy into layout and components. Documents can be written by hand, edited and reworked, and the page regenerates accordingly.',
		highlights: [
			{ it: 'Da documento Word a landing page completa in modo automatico.', en: 'From Word document to a complete landing page, automatically.' },
			{ it: 'La struttura del testo diventa design, il contenuto resta intatto.', en: 'The text’s structure becomes design, the content stays intact.' },
			{ it: 'Documenti scrivibili a mano, modificabili e rielaborabili.', en: 'Documents you can write by hand, edit and rework.' },
			{ it: 'La pagina si rigenera al variare del documento.', en: 'The page regenerates as the document changes.' },
		],
		caseStudy: {
			problem: {
				it: 'La generative UI di solito parte da un prompt e da chi sa scriverlo. Volevo testarla in modo diverso: renderla accessibile a chiunque, partendo da qualcosa che tutti già usano.',
				en: 'Generative UI usually starts from a prompt and from someone who knows how to write it. I wanted to test it differently: make it accessible to anyone, starting from something everyone already uses.',
			},
			approach: {
				it: 'Creta prende un documento Word, ne legge la struttura e genera una landing page: titoli, sezioni e gerarchie diventano layout e componenti, mentre il testo resta intatto.',
				en: 'Creta takes a Word document, reads its structure and generates a landing page: headings, sections and hierarchy become layout and components, while the text stays intact.',
			},
			result: {
				it: 'Chiunque, scrivendo e modificando un normale documento, ottiene una landing coerente che si rigenera al variare del testo — senza toccare codice o design.',
				en: 'Anyone, by writing and editing an ordinary document, gets a coherent landing page that regenerates as the text changes — without touching code or design.',
			},
		},
		images: [cretaCover],
	},
];
