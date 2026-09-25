import { test, expect } from '@playwright/test';

for (const [name, viewport] of [
	['desktop', { width: 1440, height: 900 }],
	['mobile', { width: 390, height: 844 }],
] as const) {
	test(`${name}: real 3D opens into the live, usable portfolio`, async ({ page }) => {
		await page.setViewportSize(viewport);
		const errors: string[] = [];
		page.on('pageerror', error => errors.push(error.message));
		await page.goto('/');
		await expect(page.locator('.codex-entrance')).toBeVisible();
		await expect(page.locator('video')).toHaveCount(0);
		await page.locator('.entrance-open').focus();
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-scene', 'ready', { timeout: 30_000 });
		await expect(page.locator('canvas.entrance-canvas')).toHaveAttribute('data-ready', 'true');
		await expect(page.locator('html')).toHaveAttribute('data-codex-intro', 'active');
		await page.locator('.entrance-book').click();
		await expect(page.locator('.codex-entrance')).toHaveAttribute('data-state', 'playing');
		await expect(page.locator('.codex-live-portal main')).toHaveCount(1, { timeout: 8_000 });
		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.locator('.codex-entrance')).not.toBeVisible({ timeout: 12_000 });
		await expect(page.locator('html')).not.toHaveAttribute('data-codex-intro');
		await expect(page.locator('h1')).toBeFocused();
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		await page.mouse.wheel(0, 700);
		await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
		expect(errors).toEqual([]);
	});
}

test('skip restores focus and does not repeat on the next visit in this session', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Salta introduzione/ }).click();
	await expect(page.locator('.codex-entrance')).not.toBeVisible();
	await expect(page.locator('h1')).toBeFocused();
	await page.reload();
	await expect(page.locator('.codex-entrance')).toHaveCount(0);
	await page.goto('/?intro=1');
	await expect(page.locator('.codex-entrance')).toBeVisible();
});

test('reduced motion opens immediately without downloading the 3D model', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const models: string[] = [];
	page.on('request', request => { if (request.url().endsWith('.glb')) models.push(request.url()); });
	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();
	await expect(page.locator('.codex-entrance')).not.toBeVisible();
	expect(models).toEqual([]);
});

test('direct section links bypass the cover', async ({ page }) => {
	await page.goto('/#progetti');
	await expect(page.locator('.codex-entrance')).toHaveCount(0);
	await expect(page.locator('html')).not.toHaveAttribute('data-codex-intro');
	await expect(page.locator('#progetti')).toBeInViewport();
});

test('a failed 3D model still releases the reader into the portfolio', async ({ page }) => {
	await page.route('**/codex/*.glb', route => route.abort());
	await page.goto('/');
	// The loader keeps the book/open buttons inert until the fallback is settled.
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-scene', 'unavailable');
	await page.locator('.entrance-open').focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('.codex-entrance')).not.toBeVisible();
	await expect(page.locator('html')).not.toHaveAttribute('data-codex-intro');
});

test('skipping during the portal zoom restores the original DOM and navigation', async ({ page }) => {
	await page.goto('/');
	await page.locator('.entrance-open').focus();
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-scene', 'ready', { timeout: 30_000 });
	await page.locator('.entrance-open').click();
	await expect(page.locator('.codex-live-portal main')).toHaveCount(1, { timeout: 8_000 });
	await page.locator('.entrance-skip').click();
	await expect(page.locator('.codex-entrance')).not.toBeVisible();
	await expect(page.locator('body > main')).toHaveCount(1);
	await expect(page.locator('body > [data-codex-nav]')).toHaveCount(1);
	await page.getByRole('link', { name: /^(Progetti|Work)$/ }).first().click();
	await expect(page).toHaveURL(/#progetti/);
});

test('WebGL unavailable falls back to the cover with an immediate entrance', async ({ page }) => {
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, options?: unknown) {
			if (type.startsWith('webgl')) return null;
			return original.call(this, type as '2d', options);
		} as typeof original;
	});
	await page.goto('/');
	await page.locator('.entrance-open').focus();
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-scene', 'unavailable');
	await page.locator('.entrance-open').click();
	await expect(page.locator('.codex-entrance')).not.toBeVisible();
	await expect(page.locator('h1')).toBeFocused();
});

test('keyboard stays inside the cover, and Escape enters the site', async ({ page }) => {
	await page.goto('/?lang=en');
	await expect(page.getByRole('button', { name: /Skip introduction/ })).toBeVisible();
	for (let i = 0; i < 6; i++) {
		await page.keyboard.press('Tab');
		expect(await page.evaluate(() => !!document.activeElement?.closest('.codex-entrance'))).toBe(true);
	}
	await page.keyboard.press('Escape');
	await expect(page.locator('.codex-entrance')).not.toBeVisible();
	await expect(page.locator('h1')).toBeFocused();
});

test('the navbar can close the book and reopen it, in place', async ({ page }) => {
	// Three full scene loads happen in this one test (open, close, reopen);
	// the default per-test timeout is tight for that under CI/parallel load.
	test.setTimeout(60_000);
	const errors: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.goto('/');
	await page.locator('.entrance-open').focus();
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-scene', 'ready', { timeout: 30_000 });
	await page.locator('.entrance-open').click();
	await expect(page.locator('.codex-entrance')).not.toBeVisible({ timeout: 12_000 });

	// Scroll partway down before leaving, to check the trip back preserves it.
	await page.mouse.wheel(0, 600);
	await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
	const scrollBeforeReturn = await page.evaluate(() => scrollY);

	const returnLink = page.locator('[data-codex-return]');
	await expect(returnLink).toBeVisible();
	await returnLink.click();
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-state', 'closing');
	await expect(page.locator('html')).toHaveAttribute('data-codex-intro', 'active');
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-state', 'idle', { timeout: 30_000 });
	// Back at the cover: scroll stays frozen, same as the very first visit.
	await expect(page.locator('html')).toHaveAttribute('data-codex-intro');
	// The DOM went back to the document, not lost mid-trip.
	await expect(page.locator('body > main')).toHaveCount(1);
	await expect(page.locator('body > [data-codex-nav]')).toHaveCount(1);

	// Reopening resumes exactly where the reader left off, not back at the top.
	await page.locator('.entrance-open').click();
	await expect(page.locator('.codex-entrance')).not.toBeVisible({ timeout: 12_000 });
	await expect(page.locator('h1')).toBeVisible();
	expect(await page.evaluate(() => scrollY)).toBe(scrollBeforeReturn);
	expect(errors).toEqual([]);
});

test('Escape while the book is closing cancels the trip and keeps the reader on the site', async ({ page }) => {
	await page.goto('/');
	await page.locator('.entrance-open').focus();
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-scene', 'ready', { timeout: 30_000 });
	await page.locator('.entrance-open').click();
	await expect(page.locator('.codex-entrance')).not.toBeVisible({ timeout: 12_000 });

	await page.locator('[data-codex-return]').click();
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-state', 'closing');
	await page.keyboard.press('Escape');
	await expect(page.locator('.codex-entrance')).not.toBeVisible();
	await expect(page.locator('html')).not.toHaveAttribute('data-codex-intro');
	await expect(page.locator('h1')).toBeVisible();
});

test('on a project page, "torna al codice" is a plain link back to the cover', async ({ page }) => {
	await page.goto('/progetti/creta/?intro=0');
	const returnLink = page.locator('[data-codex-return]');
	await expect(returnLink).toHaveAttribute('href', '/?intro=1');
	await returnLink.click();
	await expect(page).toHaveURL(/\/\?intro=1$/);
	await expect(page.locator('.codex-entrance')).toBeVisible();
});

test('without JavaScript the portfolio remains available', async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto('http://localhost:4329/');
	await expect(page.locator('.codex-entrance')).not.toBeVisible();
	await expect(page.locator('h1')).toBeVisible();
	await expect(page.locator('html')).not.toHaveAttribute('data-codex-intro');
	await context.close();
});

test('a slow 3D load shows the parchment loader, never a black screen', async ({ page }) => {
	let release!: () => void;
	const held = new Promise<void>(resolve => { release = resolve; });
	await page.route('**/codex/*.glb', async route => { await held; await route.continue(); });
	await page.goto('/');
	const loader = page.locator('.entrance-loader');
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-scene', 'loading');
	await expect(loader).toBeVisible();
	await expect(loader.locator('.loader-title')).toHaveText('Codex');
	await expect(page.getByRole('button', { name: /Salta introduzione/ })).toBeVisible();
	release();
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-scene', 'ready', { timeout: 30_000 });
	await expect(loader).not.toBeVisible();
});

test('the parchment loader appears at once, the model loads without interaction, and handoff never scales HTML', async ({ page }) => {
	const models: string[] = [];
	page.on('request', r => { if (r.url().endsWith('.glb')) models.push(r.url()); });
	await page.goto('/');
	await expect(page.locator('.entrance-loader')).toBeVisible();
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-scene', 'loading');
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-scene', 'ready', { timeout: 30_000 });
	await expect(page.locator('.entrance-loader')).not.toBeVisible();
	expect(models).toHaveLength(1);
	await page.locator('.entrance-open').click();
	await expect(page.locator('.codex-live-portal main')).toHaveCount(1, { timeout: 20_000 });
	expect(await page.locator('.codex-live-portal').evaluate(el => getComputedStyle(el).transform)).toBe('none');
	await expect(page.locator('.codex-entrance')).not.toBeVisible();
	expect(models).toHaveLength(1);
});

test('the candle is lit by default, and switching to daylight is remembered', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-light', 'candle');
	await expect(page.locator('.entrance-light')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.codex-entrance')).toHaveAttribute('data-scene', 'ready', { timeout: 30_000 });
	await page.locator('.entrance-light').click();
	await expect(page.locator('.entrance-light')).toHaveAttribute('aria-pressed', 'false');
	await expect(page.locator('.codex-entrance')).not.toHaveAttribute('data-light');
	await page.reload();
	await expect(page.locator('.codex-entrance')).not.toHaveAttribute('data-light');
	await expect(page.locator('.entrance-light')).toHaveAttribute('aria-pressed', 'false');
});

test('skip works while the model request is stalled',async ({page})=>{
 await page.route('**/codex/*.glb',()=>{});
 await page.goto('/');
 await expect(page.locator('.codex-entrance')).toHaveAttribute('data-scene', 'loading');
 await page.locator('.entrance-skip').click();
 await expect(page.locator('.codex-entrance')).not.toBeVisible();
 await expect(page.locator('h1')).toBeFocused();
});
