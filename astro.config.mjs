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
			weights: [400, 500, 600],
			styles: ['normal', 'italic'],
			fallbacks: ['Georgia', 'serif'],
		},
		{
			name: 'Gianluca Hand',
			cssVariable: '--font-hand',
			provider: fontProviders.local(),
			fallbacks: ['cursive'],
			options: {
				variants: [
					{
						weight: 400,
						style: 'normal',
						src: [
							'./src/assets/mioFont/GianlucaHand-Regular.woff2',
							'./src/assets/mioFont/GianlucaHand-Regular.woff',
						],
					},
				],
			},
		},
	],
});
