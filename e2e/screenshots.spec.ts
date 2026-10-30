import { test, type Page } from '@playwright/test';

// Captures the views reviewed at the end of each phase. Output: e2e/screenshots/*.png

const sim = (page: Page, fn: string) =>
  page.evaluate(`(() => { const s = window.__osc; ${fn} })()`);

async function open(page: Page, route: string, lang: 'es' | 'en') {
  await page.goto(route);
  await page.getByTestId(`lang-${lang}`).click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

test('screenshot sho-es (initial)', async ({ page }) => {
  await open(page, '/#/sho', 'es');
  await page.screenshot({ path: 'e2e/screenshots/sho-es.png' });
});

test('screenshot sho-en running', async ({ page }) => {
  await open(page, '/#/sho', 'en');
  await sim(page, 's.setPausedState(0.2, 1.6); s.play();');
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'e2e/screenshots/sho-en-running.png' });
});

test('screenshot sho grabbed (drag x0)', async ({ page }) => {
  await open(page, '/#/sho', 'es');
  const d = (await sim(page, 'return s.debug();')) as { block: { x: number; y: number } };
  await page.mouse.move(d.block.x, d.block.y);
  await page.mouse.down();
  await page.mouse.move(d.block.x + 80, d.block.y, { steps: 6 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'e2e/screenshots/sho-grabbed.png' });
  await page.mouse.up();
});

test('screenshot sho compressed with v0 arrow', async ({ page }) => {
  await open(page, '/#/sho', 'es');
  await sim(page, 's.setPausedState(-0.95, 2.2);');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/screenshots/sho-compressed.png' });
});

test('screenshot sho stretched with negative v0', async ({ page }) => {
  await open(page, '/#/sho', 'es');
  await sim(page, 's.setPausedState(1.3, -1.0);');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/screenshots/sho-stretched.png' });
});

test('screenshot sho fast (stretched by speed)', async ({ page }) => {
  await open(page, '/#/sho', 'es');
  await sim(page, 's.setPausedState(0, 3.9); s.play();');
  await page.waitForTimeout(160);
  await page.screenshot({ path: 'e2e/screenshots/sho-fast.png' });
});

test('screenshot sho serious mode + zoom', async ({ page }) => {
  await open(page, '/#/sho', 'es');
  await page.getByTestId('serious').click();
  const box = (await page.getByTestId('stage-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
  await page.mouse.wheel(0, -250);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'e2e/screenshots/sho-serious-zoom.png' });
});

test('screenshot damped-driven-es (placeholder)', async ({ page }) => {
  await open(page, '/#/damped-driven', 'es');
  await page.screenshot({ path: 'e2e/screenshots/damped-driven-es.png' });
});
