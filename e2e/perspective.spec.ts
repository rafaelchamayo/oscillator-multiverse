import { expect, test, type Page } from '@playwright/test';

type Debug = {
  x: number;
  v: number;
  t: number;
  angle: number;
  historyLength: number;
  params: { m: number; k: number; g: number };
};

const osc = (page: Page): Promise<Debug> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.evaluate(() => (window as any).__osc.debug());

test.beforeEach(async ({ page }) => {
  await page.goto('/#/sho');
  await page.waitForFunction(() => 'debug' in ((window as { __osc?: object }).__osc ?? {}));
});

test('switching perspective keeps the motion, the time and the trace', async ({ page }) => {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__osc;
    s.setPausedState(0.4, 0.7);
    s.play();
  });
  await page.waitForTimeout(700);
  await page.getByTestId('play').click(); // pause
  const before = await osc(page);
  expect(before.historyLength).toBeGreaterThan(10);

  await page.getByTestId('perspective').click();
  await page.waitForTimeout(900); // 600 ms rotation
  const vert = await osc(page);
  const { m, k, g } = vert.params;
  expect(vert.angle).toBeCloseTo(-Math.PI / 2, 6);
  expect(g).toBeCloseTo(9.81, 6);
  // Same displacement from equilibrium (x_eq = −mg/k), velocity, time and history.
  expect(vert.x - (-m * g) / k).toBeCloseTo(before.x, 9);
  expect(vert.v).toBeCloseTo(before.v, 9);
  expect(vert.t).toBe(before.t);
  expect(vert.historyLength).toBe(before.historyLength);
  await expect(page.getByTestId('gravity')).toHaveAttribute('aria-pressed', 'true');

  // Gravity off in the vertical view: back to x measured from the natural length.
  await page.getByTestId('gravity').click();
  await page.waitForTimeout(100);
  const noG = await osc(page);
  expect(noG.params.g).toBe(0);
  expect(noG.x).toBeCloseTo(before.x, 9);

  await page.getByTestId('perspective').click();
  await page.waitForTimeout(900);
  const back = await osc(page);
  expect(back.angle).toBeCloseTo(0, 9);
  expect(back.x).toBeCloseTo(before.x, 9);
  expect(back.t).toBe(before.t);
  await expect(page.getByTestId('gravity')).toHaveCount(0);
});

test('plot chips show and hide side-panel plots', async ({ page }) => {
  await expect(page.getByTestId('panel-motion')).toBeVisible();
  await expect(page.getByTestId('panel-phase')).toHaveCount(0);
  await page.getByTestId('chip-phase').click();
  await expect(page.getByTestId('panel-phase')).toBeVisible();
  await page.getByTestId('chip-x').click();
  await page.getByTestId('chip-v').click();
  await expect(page.getByTestId('panel-motion')).toHaveCount(0);
});
