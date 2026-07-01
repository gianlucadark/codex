import { defineConfig, devices } from '@playwright/test';

/**
 * E2E smoke tests for the codex. They run against the built site served by
 * `astro preview`, so build first (`npm run build`) — the CI workflow does this.
 *
 * Scroll-reveal elements start hidden and are revealed by GSAP when scrolled
 * into view, so tests that assert on deep content scroll it in first.
 */
export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	use: {
		baseURL: 'http://localhost:4329',
		trace: 'on-first-retry',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	// Dedicated port + no reuse so the run always hits the built preview, never a
	// stray `astro dev` server (whose images are unoptimised /@fs/ paths).
	webServer: {
		command: 'npm run preview -- --port 4329',
		url: 'http://localhost:4329',
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
