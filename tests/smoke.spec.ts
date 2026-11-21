import { test, expect } from '@playwright/test';

// These tests cover the portfolio after entering; the cinematic entrance has
// its own suite, including first visits and the session bypass.
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => sessionStorage.setItem('codex-entered-v1', '1'));
});

test('home renders the cover and the inner folios', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle(/Codex/);
	await expect(page.locator('#chi-sono')).toBeVisible();
	await expect(page.locator('#progetti')).toBeVisible();
	await expect(page.locator('#contatti')).toBeVisible();
});

test('language switch flips to English and makes the URL shareable', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'it');
	await page.getByRole('button', { name: 'en', exact: true }).click();
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');
	await expect(page).toHaveURL(/lang=en/);
});

test('?lang=en renders English as the primary voice on first paint', async ({ page }) => {
	await page.goto('/?lang=en');
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');
});

test('the index links jump to the projects folio', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: /^(Progetti|Work)$/ }).first().click();
	await expect(page).toHaveURL(/#progetti/);
});

test('the mobile desk centres every project and ends with the last sheet on the wood', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/#progetti');
	const viewport = page.locator('[data-bench-window]');
	const sheets = viewport.locator('[data-sheet]');
	const count = await sheets.count();
	const next = page.locator('[data-next]');
	await expect(page.locator('[data-prev]')).toBeDisabled();
	for (let i = 0; i < count; i++) {
		if (i) await next.click();
		await expect(page.locator('[data-current]')).toHaveText(String(i + 1));
		const windowBox = (await viewport.boundingBox())!;
		const sheet = (await sheets.nth(i).boundingBox())!;
		expect(Math.abs(sheet.x + sheet.width / 2 - windowBox.x - windowBox.width / 2)).toBeLessThan(2);
		expect(sheet.width).toBeLessThan(windowBox.width);
		expect(sheet.y).toBeGreaterThan(windowBox.y);
		expect(sheet.y + sheet.height).toBeLessThan(windowBox.y + windowBox.height);
	}
	await expect(next).toBeDisabled();
	const deskWidth = await viewport.locator('[data-tavolo]').evaluate(desk => desk.clientWidth);
	expect(await viewport.evaluate(el => el.scrollWidth)).toBe(deskWidth);
	await sheets.last().locator('[data-face="recto"]').getByRole('button', { name: /Gira/ }).click();
	const link = sheets.last().locator('[data-face="verso"]').getByRole('link', { name: 'Apri progetto' });
	const href = await link.getAttribute('href');
	await link.click();
	await expect(page).toHaveURL(url => url.pathname.replace(/\/$/, '') === href);
});

test('an award opens in the lightbox dialog', async ({ page }) => {
	await page.goto('/');
	const firstAward = page.locator('.award .window').first();
	await firstAward.scrollIntoViewIfNeeded();
	await firstAward.click();
	await expect(page.locator('dialog.lightbox')).toBeVisible();
});

test('a copy button is offered for the email address', async ({ page }) => {
	await page.goto('/');
	const copy = page.locator('.copy-btn').first();
	// Contact sits at the bottom; scroll it in so its scroll-reveal has fired.
	await copy.scrollIntoViewIfNeeded();
	await expect(copy).toBeVisible();
	await expect(copy).toHaveAttribute('data-copy', /@/);
});

test('project folios carry a per-project OG image and CreativeWork JSON-LD', async ({ page }) => {
	await page.goto('/progetti/uxability');
	await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
		'content',
		/_astro\/uxability/,
	);
	await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
	const ld = await page.locator('script[type="application/ld+json"]').textContent();
	expect(ld).toContain('CreativeWork');
});
