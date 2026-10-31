import { expect, test, type Page } from '@playwright/test';

const run = <T>(page: Page, body: string): Promise<T> =>
  page.evaluate(`(() => { const s = window.__osc; ${body} })()`) as Promise<T>;

async function open(page: Page, route: string) {
  await page.goto(route);
  await page.waitForFunction(() => 'debug' in ((window as { __osc?: object }).__osc ?? {}));
}

for (const route of ['/#/sho', '/#/damped-driven']) {
  test(`the block bounces off the track ends (${route})`, async ({ page }) => {
    await open(page, route);
    // A fling far beyond the track: without the stops it would cross the wall.
    const r = await run<{ lo: number; hi: number; min: number; max: number }>(
      page,
      `s.setPausedState(0, 4); s.play();
       const lo = s.scene.clampX(-1e9, s.params), hi = s.scene.clampX(1e9, s.params);
       let min = Infinity, max = -Infinity;
       for (let i = 0; i < 900; i++) {
         s.loop.advanceFrame();
         min = Math.min(min, s.state[0]); max = Math.max(max, s.state[0]);
       }
       return { lo, hi, min, max };`,
    );
    expect(r.min).toBeGreaterThanOrEqual(r.lo - 1e-9);
    expect(r.max).toBeLessThanOrEqual(r.hi + 1e-9);
    // It does reach both stops (so it really bounced).
    expect(r.max).toBeGreaterThan(r.hi - 0.05);
  });
}

test('the ODE shrinks with the stage, clear of the clock, and can be hidden', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 760 });
  await open(page, '/#/damped-driven');
  const ode = page.locator('.ode');
  const stage = (await page.getByTestId('stage-canvas').boundingBox())!;
  const box = (await ode.boundingBox())!;
  // The clock is drawn at (22, 20) and is ~130 px wide.
  expect(box.x - stage.x).toBeGreaterThan(140);
  expect(stage.x + stage.width - (box.x + box.width)).toBeGreaterThan(60);
  const size = await ode.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeLessThan(19);

  await page.getByTestId('ode-hide').click();
  await expect(page.getByTestId('ode')).toHaveCount(0);
  await page.keyboard.press('e');
  await expect(page.getByTestId('ode')).toBeVisible();
  await page.keyboard.press('e');
  await page.getByTestId('ode-show').click();
  await expect(page.getByTestId('ode')).toBeVisible();
});

test('hovering a preset explains the scenario', async ({ page }) => {
  await open(page, '/#/damped-driven');
  await page.getByTestId('lang-en').click();
  await page.getByTestId('preset-critical').hover();
  await expect(page.getByTestId('preset-tip')).toContainText('γ = ω₀');
  await page.mouse.move(5, 5);
  await expect(page.getByTestId('preset-tip')).toHaveCount(0);
  await page.getByTestId('preset-beats').focus();
  await expect(page.getByTestId('preset-tip')).toContainText('2π/|ω₀ − ω|');
});

test('the toolbar shrinks to fit a narrow stage', async ({ page }) => {
  await open(page, '/#/damped-driven');
  const wide = (await page.getByRole('toolbar').boundingBox())!;
  await page.setViewportSize({ width: 800, height: 700 });
  await page.waitForTimeout(100);
  const stage = (await page.getByTestId('stage-canvas').boundingBox())!;
  const narrow = (await page.getByRole('toolbar').boundingBox())!;
  expect(narrow.width).toBeLessThan(wide.width);
  expect(narrow.x).toBeGreaterThanOrEqual(stage.x);
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(stage.x + stage.width);
});
