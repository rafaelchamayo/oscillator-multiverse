import { expect, test } from '@playwright/test';

test('loads with two tabs and the dark theme', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/#\/sho$/);
  await expect(page.getByTestId('tab-sho')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('tab-damped-driven')).toBeVisible();
  const bg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim(),
  );
  expect(bg).toBe('#0B1026');
});

test('switching tabs changes the route', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tab-damped-driven').click();
  await expect(page).toHaveURL(/#\/damped-driven$/);
  await expect(page.getByTestId('workspace-damped-driven')).toBeVisible();
});

test('language selector switches ES ↔ EN and persists', async ({ page }) => {
  await page.goto('/#/sho');
  await page.getByTestId('lang-es').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oscilador armónico simple');
  await page.getByTestId('lang-en').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Simple harmonic oscillator');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Simple harmonic oscillator');
});
