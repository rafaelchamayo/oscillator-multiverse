import { expect, test, type Page } from '@playwright/test';

const pageCoords = (page: Page, u: number, w: number): Promise<{ x: number; y: number }> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.evaluate(([a, b]) => (window as any).__osc.pageCoords(a, b), [u, w]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const osc = (page: Page): Promise<any> => page.evaluate(() => (window as any).__osc.debug());

test.beforeEach(async ({ page }) => {
  await page.goto('/#/sho');
  await page.waitForFunction(() => 'debug' in ((window as { __osc?: object }).__osc ?? {}));
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__osc.setPausedState(0.5, 1.5);
  });
});

/** A point inside each object (horizontal view, defaults: wall face at u = −1.35). */
async function objectPoints(page: Page) {
  const d = await osc(page);
  const side = 0.34;
  return {
    block: d.block,
    spring: await pageCoords(page, (-1.35 + d.x - side / 2) / 2, d.bodyW),
    wall: await pageCoords(page, -1.35 - 0.085, 0.3 - 0.4),
    velocity: await pageCoords(page, d.x + side / 2 + 0.1, d.bodyW),
  };
}

test('hovering every object shows its popover and highlights it', async ({ page }) => {
  const pts = await objectPoints(page);
  for (const [id, p] of Object.entries(pts)) {
    await page.mouse.move(p.x, p.y);
    const pop = page.getByTestId(`popover-${id}`);
    await expect(pop).toBeVisible();
    await expect(pop.locator('h2')).not.toBeEmpty();
    await expect(pop.locator('p').first()).not.toBeEmpty();
    expect((await osc(page)).highlightId).toBe(id);
    await page.mouse.move(5, 5); // leave
    await expect(pop).toHaveCount(0);
  }
});

test('no slider exists outside a popover', async ({ page }) => {
  expect(await page.locator('input[type=range]').count()).toBe(0);
  const pts = await objectPoints(page);
  await page.mouse.move(pts.spring.x, pts.spring.y);
  await expect(page.getByTestId('popover-spring')).toBeVisible();
  expect(await page.locator('input[type=range]').count()).toBe(1);
  expect(await page.locator('.popover input[type=range]').count()).toBe(1);
});

test('the block slider changes m and the ODE shows the new value', async ({ page }) => {
  const ode = page.getByTestId('ode');
  await expect(ode).toContainText('2.0');
  const pts = await objectPoints(page);
  await page.mouse.move(pts.block.x, pts.block.y);
  const pop = page.getByTestId('popover-block');
  await expect(pop).toBeVisible();
  // Move into the popover (it stays open) and use the slider.
  const box = (await pop.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 10, { steps: 4 });
  await page.getByTestId('param-m').fill('3.5');
  expect((await osc(page)).params.m).toBeCloseTo(3.5, 9);
  await expect(ode).toContainText('3.5');
  await expect(pop).toContainText('3.5 kg');
});

test('hovering an ODE term highlights its object, and vice versa', async ({ page }) => {
  const term = page.locator('[data-testid=ode] .term--spring');
  await term.hover();
  expect((await osc(page)).highlightId).toBe('spring');
  await page.mouse.move(5, 5);
  expect((await osc(page)).highlightId).toBe(null);

  const pts = await objectPoints(page);
  await page.mouse.move(pts.block.x, pts.block.y);
  await expect(page.locator('[data-testid=ode] .term--mass')).toHaveClass(/term-lit/);
  await expect(term).not.toHaveClass(/term-lit/);
});
