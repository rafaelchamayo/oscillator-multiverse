import { expect, test, type Page } from '@playwright/test';

type Debug = {
  x: number;
  v: number;
  t: number;
  running: boolean;
  held: boolean;
  loopHeld: boolean;
  speed: number;
  ic: { x0: number; v0: number };
  zoom: number;
  pxPerMeter: number;
  bodyW: number;
  block: { x: number; y: number };
};

const osc = (page: Page): Promise<Debug> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.evaluate(() => (window as any).__osc.debug());

const pageCoords = (page: Page, u: number, w: number): Promise<{ x: number; y: number }> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.evaluate(([a, b]) => (window as any).__osc.pageCoords(a, b), [u, w]);

test.beforeEach(async ({ page }) => {
  await page.goto('/#/sho');
  await page.waitForFunction(() => 'debug' in ((window as { __osc?: object }).__osc ?? {}));
});

test('dragging the block while paused sets x₀ (released still → not running)', async ({ page }) => {
  const d0 = await osc(page);
  expect(d0.running).toBe(false);
  await page.mouse.move(d0.block.x, d0.block.y);
  await page.mouse.down();
  await page.mouse.move(d0.block.x - 120, d0.block.y, { steps: 12 });
  const mid = await osc(page);
  expect(mid.held).toBe(true);
  await page.waitForTimeout(250); // hold still before releasing
  await page.mouse.up();

  const d1 = await osc(page);
  expect(d1.x).toBeCloseTo(d0.x - 120 / d0.pxPerMeter, 2);
  expect(d1.ic.x0).toBeCloseTo(d1.x, 6);
  expect(d1.v).toBe(0);
  expect(d1.running).toBe(false);
  expect(d1.t).toBe(0);
});

/**
 * A fling dispatched inside the page with a fixed 8 ms cadence, so the gesture timing does not
 * depend on Playwright's round-trip latency (which, under load, can look like "released still").
 */
async function flingInPage(page: Page, from: { x: number; y: number }, dx: number) {
  await page.evaluate(
    async ([x0, y0, d]) => {
      const canvas = document.querySelector('[data-testid="stage-canvas"]')!;
      const fire = (type: string, x: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            clientX: x,
            clientY: y0,
            pointerId: 7,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            bubbles: true,
          }),
        );
      const wait = () => new Promise((r) => setTimeout(r, 8));
      fire('pointerdown', x0);
      for (let i = 1; i <= 6; i++) {
        await wait();
        fire('pointermove', x0 + (d * i) / 6);
      }
      fire('pointerup', x0 + d);
    },
    [from.x, from.y, dx] as const,
  );
}

for (const dir of [1, -1]) {
  test(`flinging ${dir > 0 ? 'right' : 'left'} gives v₀ with that sign and starts running`, async ({
    page,
  }) => {
    const d0 = await osc(page);
    await flingInPage(page, d0.block, dir * 60);
    const d1 = await osc(page);
    expect(Math.sign(d1.ic.v0)).toBe(dir);
    expect(Math.abs(d1.ic.v0)).toBeGreaterThan(0.25);
    expect(d1.running).toBe(true);
  });
}

test('dragging the arrow tip sets v₀ without moving x', async ({ page }) => {
  const d0 = await osc(page);
  const side = 0.34; // blockSide(m = 2)
  const tip = await pageCoords(page, d0.x + side / 2, d0.bodyW);
  await page.mouse.move(tip.x, tip.y);
  await page.mouse.down();
  await page.mouse.move(tip.x + 0.22 * d0.pxPerMeter, tip.y, { steps: 8 }); // ARROW_SCALE per 1 m/s
  await page.mouse.up();
  const d1 = await osc(page);
  expect(d1.v).toBeCloseTo(1, 1);
  expect(d1.x).toBeCloseTo(d0.x, 6);
  expect(d1.running).toBe(false);
});

test('grabbing during the run suspends integration; releasing resumes it', async ({ page }) => {
  await page.getByTestId('play').click();
  await page.waitForTimeout(300);
  const d0 = await osc(page);
  expect(d0.running).toBe(true);
  await page.mouse.move(d0.block.x, d0.block.y);
  await page.mouse.down();
  const grabbed = await osc(page);
  expect(grabbed.held).toBe(true);
  expect(grabbed.loopHeld).toBe(true);

  const target = await pageCoords(page, 0.8, d0.bodyW);
  await page.mouse.move(target.x, grabbed.block.y, { steps: 10 });
  await page.waitForTimeout(400);
  const during = await osc(page);
  expect(during.t).toBeGreaterThan(grabbed.t); // time keeps flowing
  expect(during.running).toBe(true);
  // Block follows the hand (keeping the grab offset) instead of oscillating.
  const expected = grabbed.x + (target.x - d0.block.x) / grabbed.pxPerMeter;
  expect(Math.abs(during.x - expected)).toBeLessThan(0.01);
  await page.waitForTimeout(100);
  const still = await osc(page);
  expect(still.x).toBeCloseTo(during.x, 3);

  await page.mouse.up();
  const released = await osc(page);
  expect(released.held).toBe(false);
  expect(released.loopHeld).toBe(false);
  await page.waitForTimeout(300);
  const after = await osc(page);
  expect(after.running).toBe(true);
  expect(Math.abs(after.x - released.x)).toBeGreaterThan(0.01); // dynamics resumed
});

test('toolbar and shortcuts: play/pause, reset, speed', async ({ page }) => {
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  let d = await osc(page);
  expect(d.running).toBe(true);
  expect(d.t).toBeGreaterThan(0);
  await page.keyboard.press('Space');
  expect((await osc(page)).running).toBe(false);
  await page.keyboard.press('r');
  d = await osc(page);
  expect(d.t).toBe(0);
  expect(d.x).toBeCloseTo(0.5, 9);

  const speeds: number[] = [];
  for (let i = 0; i < 5; i++) {
    await page.getByTestId('speed').click();
    speeds.push((await osc(page)).speed);
  }
  expect(speeds).toEqual([2, 4, 0.25, 0.5, 1]);
});

test('wheel zooms at the cursor and double-click on the background resets the view', async ({
  page,
}) => {
  const canvas = page.getByTestId('stage-canvas');
  const box = (await canvas.boundingBox())!;
  const p = { x: box.x + 150, y: box.y + 120 };
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, -400);
  const zoomed = await osc(page);
  expect(zoomed.zoom).toBeGreaterThan(1.5);
  await page.mouse.dblclick(p.x, p.y);
  expect((await osc(page)).zoom).toBe(1);
});
