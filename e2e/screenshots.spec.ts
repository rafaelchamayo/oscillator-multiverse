import { test } from '@playwright/test';

// Captures the views reviewed at the end of each phase. Output: e2e/screenshots/*.png
const shots = [
  { name: 'sho-es', route: '/#/sho', lang: 'es' },
  { name: 'sho-en', route: '/#/sho', lang: 'en' },
  { name: 'damped-driven-es', route: '/#/damped-driven', lang: 'es' },
];

for (const s of shots) {
  test(`screenshot ${s.name}`, async ({ page }) => {
    await page.goto(s.route);
    await page.getByTestId(`lang-${s.lang}`).click();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `e2e/screenshots/${s.name}.png` });
  });
}
