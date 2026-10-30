import { expect, test, type Page } from '@playwright/test';

const run = <T>(page: Page, body: string): Promise<T> =>
  page.evaluate(`(() => { const s = window.__osc; ${body} })()`) as Promise<T>;

/** Steady amplitude A(ω) = (F₀/m) / √((ω₀² − ω²)² + (2γω)²). */
const theory = (p: { m: number; k: number; b: number; F0: number }, w: number) =>
  p.F0 / p.m / Math.hypot(p.k / p.m - w * w, (p.b / p.m) * w);

test.beforeEach(async ({ page }) => {
  await page.goto('/#/damped-driven');
  await page.waitForFunction(() => 'debug' in ((window as { __osc?: object }).__osc ?? {}));
});

test('resonance preset grows to the theoretical amplitude', async ({ page }) => {
  await page.getByTestId('preset-resonance').click();
  // 10 s, then 90 s more (transient e^{−γt} with γ = 0.1 s⁻¹), frame-locked in the page.
  const early = await run<number>(
    page,
    'for (let i = 0; i < 600; i++) s.loop.advanceFrame(); return s.extras.sweep.amplitude;',
  );
  const late = await run<{
    A: number;
    steady: boolean;
    p: { m: number; k: number; b: number; F0: number; omega: number };
  }>(
    page,
    'for (let i = 0; i < 5400; i++) s.loop.advanceFrame(); return { A: s.extras.sweep.amplitude, steady: s.extras.sweep.steady, p: { ...s.params } };',
  );
  const A = theory(late.p, late.p.omega);
  expect(early).toBeLessThan(0.75 * A);
  expect(Math.abs(late.A - A) / A).toBeLessThan(0.01);
  expect(late.steady).toBe(true);
  await expect(page.getByTestId('regime')).toHaveText(/Subamortiguado|Underdamped/);
});

test('automatic sweep points fall on the theoretical curve', async ({ page }) => {
  await run(page, 's.setParam("b", 1.2);');
  await page.getByTestId('action-sweep').click();
  const res = await run<{
    pts: { omega: number; A: number }[];
    auto: boolean;
    p: { m: number; k: number; b: number; F0: number };
  }>(
    page,
    's.play(); for (let i = 0; i < 36000; i++) s.loop.advanceFrame(); return { pts: s.extras.sweep.points, auto: s.extras.sweep.auto, p: { ...s.params } };',
  );
  expect(res.auto).toBe(false);
  expect(res.pts.length).toBe(25);
  for (const q of res.pts) {
    expect(Math.abs(q.A - theory(res.p, q.omega)) / theory(res.p, q.omega)).toBeLessThan(0.01);
  }
});

test('presets set the regime badge', async ({ page }) => {
  for (const [id, re] of [
    ['undamped', /Sin amortiguar|Undamped/],
    ['critical', /crítico|Critically/],
    ['overdamped', /Sobreamortiguado|Overdamped/],
  ] as const) {
    await page.getByTestId(`preset-${id}`).click();
    await expect(page.getByTestId('regime')).toHaveText(re);
  }
});

test('damper and motor popovers carry b, F₀ and ω sliders; none outside', async ({ page }) => {
  expect(await page.locator('input[type=range]').count()).toBe(0);
  const d = await run<{ x: number; bodyW: number }>(page, 'return s.debug();');
  const damper = await run<{ x: number; y: number }>(page, `return s.pageCoords(0.9, ${-0.53});`);
  await page.mouse.move(damper.x, damper.y);
  await expect(page.getByTestId('popover-damper')).toBeVisible();
  await expect(page.getByTestId('param-b')).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(page.getByTestId('popover-damper')).toHaveCount(0);

  // Wheel center: wall face (−1.85) + gap + radius, on the spring axis.
  const wheel = await run<{ x: number; y: number }>(
    page,
    `return s.pageCoords(-1.66, ${d.bodyW});`,
  );
  await page.mouse.move(wheel.x, wheel.y);
  await expect(page.getByTestId('popover-motor')).toBeVisible();
  await expect(page.getByTestId('param-F0')).toBeVisible();
  await expect(page.getByTestId('param-omega')).toBeVisible();
  expect(await page.locator('input[type=range]').count()).toBe(
    await page.locator('.popover input[type=range]').count(),
  );
});
