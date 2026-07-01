import { test, expect } from '@playwright/test';

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
