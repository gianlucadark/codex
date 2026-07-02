// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { site } from './src/data/site.ts';

// https://astro.build/config
export default defineConfig({
	// Canonical origin — used by the sitemap and absolute URLs.
	site: site.url,
	// Minify the generated HTML.
	compressHTML: true,
	build: {
		// Il CSS del sito è minuscolo (~7 KB in tutto): incorporandolo nell'HTML
		// eliminiamo le richieste di fogli di stile render-blocking, migliorando
		// FCP/LCP (niente round-trip prima del primo paint).
		inlineStylesheets: 'always',
	},
	// Pre-load project folios on hover for instant navigation.
	prefetch: {
		prefetchAll: true,
		defaultStrategy: 'hover',
	},
	integrations: [sitemap()],
	// Self-hosted fonts via Astro's built-in Fonts API.
	// - EB Garamond: the codex "body/serif" voice, pulled from Google and self-hosted.
	// - Gianluca Hand: my own handwriting, digitised into a font (src/assets/mioFont).
	fonts: [
		{
			name: 'EB Garamond',
			cssVariable: '--font-garamond',
			provider: fontProviders.google(),
			// Solo il peso realmente usato (il corpo del testo): 500/600 non
			// comparivano in nessuno stile e generavano @font-face inutili.
			weights: [400],
			styles: ['normal', 'italic'],
			// `swap`: il testo compare subito col fallback e passa al font quando è
			// pronto — niente FOIT (testo invisibile durante il caricamento).
			display: 'swap',
			fallbacks: ['Georgia', 'serif'],
		},
		{
			name: 'Gianluca Hand',
			cssVariable: '--font-hand',
			provider: fontProviders.local(),
			display: 'swap',
			fallbacks: ['cursive'],
			options: {
				variants: [
					{
						weight: 400,
						style: 'normal',
						// Solo woff2: ogni browser che sa caricare font web moderni lo
						// supporta; la sorgente woff raddoppiava soltanto i file in dist.
						src: ['./src/assets/mioFont/GianlucaHand-Regular.woff2'],
					},
				],
			},
		},
	],
});
