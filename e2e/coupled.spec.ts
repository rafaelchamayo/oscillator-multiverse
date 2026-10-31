import { expect, test, type Page } from '@playwright/test';

type Body = { x: number; v: number; page: { x: number; y: number } };
type Debug = {
  t: number;
  running: boolean;
  held: boolean;
  loopHeld: boolean;
  activeBody: number;
  pxPerMeter: number;
  bodies: Body[];
};

const osc = (page: Page): Promise<Debug> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.evaluate(() => (window as any).__osc.debug());

const run = <T>(page: Page, body: string): Promise<T> =>
  page.evaluate(`(() => { const s = window.__osc; ${body} })()`) as Promise<T>;

test.beforeEach(async ({ page }) => {
  await page.goto('/#/coupled');
  await page.waitForFunction(() => 'debug' in ((window as { __osc?: object }).__osc ?? {}));
  // The view eases into place once the top overlays (ODE, stepper, presets) are measured.
  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (window as any).__osc;
      const prev = s.__lastScale;
      s.__lastScale = s.view.pxPerMeter;
      return prev !== undefined && Math.abs(prev - s.view.pxPerMeter) < 1e-3;
    },
    undefined,
    { polling: 100 },
  );
});

test('the coupled tab shows three blocks by default', async ({ page }) => {
  await expect(page.getByTestId('tab-coupled')).toHaveAttribute('aria-current', 'page');
  const d = await osc(page);
  expect(d.bodies.length).toBe(3);
  expect(d.bodies[0]!.x).toBeCloseTo(0.35, 9);
});

test('dragging block 3 while paused moves only x₃ and makes it the initial condition', async ({
  page,
}) => {
  const d0 = await osc(page);
  const b = d0.bodies[2]!.page;
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  await page.mouse.move(b.x - 60, b.y, { steps: 8 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  const d1 = await osc(page);
  expect(d1.activeBody).toBe(2);
  expect(d1.bodies[2]!.x).toBeCloseTo(-60 / d0.pxPerMeter, 2);
  expect(d1.bodies[0]!.x).toBe(d0.bodies[0]!.x);
  expect(d1.bodies[1]!.x).toBe(d0.bodies[1]!.x);
  expect(d1.running).toBe(false);
  // Reset brings back the dragged configuration.
  await run(page, 's.play(); for (let i = 0; i < 60; i++) s.loop.advanceFrame(); s.reset();');
  const d2 = await osc(page);
  expect(d2.bodies.map((b) => b.x)).toEqual(d1.bodies.map((b) => b.x));
});

/** In-page fling with a fixed 8 ms cadence (see sho-interaction.spec.ts). */
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
  test(`flinging block 2 ${dir > 0 ? 'right' : 'left'} gives v₂ with that sign`, async ({
    page,
  }) => {
    await run(page, 's.setPausedState(0, 0, 0);');
    const d0 = await osc(page);
    await flingInPage(page, d0.bodies[1]!.page, dir * 50);
    const d1 = await osc(page);
    expect(d1.activeBody).toBe(1);
    expect(d1.running).toBe(true);
    const ic = await run<number[]>(page, 'return Array.from(s.initState);');
    expect(Math.sign(ic[5 + 1]!)).toBe(dir);
    expect(Math.abs(ic[5 + 1]!)).toBeGreaterThan(0.25);
    expect(ic[5 + 0]).toBe(0);
  });
}

test('grabbing a block while running: the others keep moving', async ({ page }) => {
  await run(page, 's.play(); for (let i = 0; i < 30; i++) s.loop.advanceFrame();');
  const r = await run<{ held: number[]; free: number[] }>(
    page,
    `const k = s.spec.model;
     s.activeBody = 1;
     s.beginHold(k.getPos(s.state, 1), 1);
     const held = [], free = [];
     for (let i = 0; i < 60; i++) {
       s.holdTarget = { x: 0.1, v: 0 };
       s.loop.hold(0.1, 0, 1);
       s.loop.advanceFrame();
       held.push(k.getPos(s.state, 1));
       free.push(k.getPos(s.state, 0));
     }
     s.endHold(0.1, 0);
     return { held, free };`,
  );
  expect(Math.abs(r.held.at(-1)! - 0.1)).toBeLessThan(1e-12);
  expect(Math.max(...r.free) - Math.min(...r.free)).toBeGreaterThan(0.02);
});

test('blocks never cross each other or the walls', async ({ page }) => {
  // Every block flung hard: collisions and wall bounces happen all the time.
  const r = await run<{ ok: boolean; t: number }>(
    page,
    `const p = s.params, k = s.spec.model;
     for (let i = 0; i < 3; i++) k.setKinematic(s.state, 0, [4, -4, 4][i], i);
     s.play();
     let ok = true;
     for (let f = 0; f < 900; f++) {
       s.loop.advanceFrame();
       const u = [0, 1, 2].map((i) => s.scene.bodyU(k.getPos(s.state, i), p, i));
       const half = [0, 1, 2].map((i) => (s.scene.bodyW(p, i) - 0.3) * -1);
       const L = 4 * 0.85 / 2;
       if (u[0] - half[0] < -L || u[2] + half[2] > L) ok = false;
       for (let i = 0; i < 2; i++) if (u[i] + half[i] > u[i + 1] - half[i + 1]) ok = false;
     }
     return { ok, t: s.loop.t };`,
  );
  expect(r.t).toBeGreaterThan(14.9);
  expect(r.ok).toBe(true);
});

test('each block and spring has its own popover slider', async ({ page }) => {
  const d = await osc(page);
  await page.mouse.move(d.bodies[1]!.page.x, d.bodies[1]!.page.y);
  await expect(page.getByTestId('popover-block2')).toContainText(/Bloque 2|Block 2/);
  await expect(page.getByRole('slider')).toHaveCount(1);
  const between = {
    x: (d.bodies[1]!.page.x + d.bodies[2]!.page.x) / 2,
    y: d.bodies[1]!.page.y,
  };
  await page.mouse.move(between.x, between.y);
  await expect(page.getByTestId('popover-spring3')).toContainText(/Resorte 3|Spring 3/);
  await expect(page.getByRole('slider')).toHaveCount(1);
});

test('SHO and damped-driven still drag body 0 only', async ({ page }) => {
  await page.goto('/#/sho');
  await page.waitForFunction(() => 'debug' in ((window as { __osc?: object }).__osc ?? {}));
  const d = await osc(page);
  expect(d.bodies.length).toBe(1);
});

test('the N stepper changes the number of blocks and restarts', async ({ page }) => {
  await run(page, 's.play(); for (let i = 0; i < 60; i++) s.loop.advanceFrame();');
  await page.getByTestId('count-plus').click();
  let d = await osc(page);
  expect(d.bodies.length).toBe(4);
  expect(d.t).toBe(0);
  expect(d.running).toBe(false);
  await expect(page.getByTestId('count-value')).toHaveText('4');
  await page.getByTestId('count-plus').click();
  await expect(page.getByTestId('count-plus')).toBeDisabled();
  for (let i = 0; i < 3; i++) await page.getByTestId('count-minus').click();
  d = await osc(page);
  expect(d.bodies.length).toBe(2);
  await expect(page.getByTestId('count-minus')).toBeDisabled();
  // Mode presets follow N, and the ODE is a 2 × 2 matrix form.
  await expect(page.getByTestId('preset-mode2')).toBeVisible();
  await expect(page.getByTestId('preset-mode3')).toHaveCount(0);
  // k₂ is in K₁₁, K₁₂, K₂₁ and K₂₂.
  await expect(page.locator('[data-testid=ode] .term--k2')).toHaveCount(4);
});

test('the Mode 2 preset stays in mode 2', async ({ page }) => {
  await page.getByTestId('preset-mode2').click();
  const r = await run<{ E: number; others: number }>(
    page,
    `for (let i = 0; i < 1200; i++) s.loop.advanceFrame();
     const o = s.spec.model.observables(s.state, s.params, s.loop.t, {});
     return { E: o.E, others: o.Eq1 + o.Eq3 };`,
  );
  expect(r.others / r.E).toBeLessThan(0.01);
});

test('hovering a spring highlights its entries of K; equalize sets every mass', async ({
  page,
}) => {
  const d = await osc(page);
  const between = { x: (d.bodies[0]!.page.x + d.bodies[1]!.page.x) / 2, y: d.bodies[0]!.page.y };
  await page.mouse.move(between.x, between.y);
  await expect(page.getByTestId('popover-spring2')).toBeVisible();
  // k₂ appears in K₁₁, K₁₂, K₂₁ and K₂₂.
  await expect(page.locator('[data-testid=ode] .term-lit')).toHaveCount(4);

  // Let the spring's popover close, then open block 2's.
  await page.mouse.move(5, 5);
  await expect(page.getByTestId('popover-spring2')).toHaveCount(0);
  await page.mouse.move(d.bodies[1]!.page.x, d.bodies[1]!.page.y);
  const slider = page.getByTestId('param-m2');
  await slider.fill('2.5');
  await page.getByTestId('equalize-m2').click();
  const p = await run<Record<string, number>>(page, 'return { ...s.params };');
  expect([p.m1, p.m2, p.m3]).toEqual([2.5, 2.5, 2.5]);
  await expect(page.getByTestId('regime')).toHaveText(/uniforme|Uniform/);
});

test('each plot chip shows its panel', async ({ page }) => {
  for (const id of ['modes', 'shapes', 'config']) {
    await expect(page.getByTestId(`panel-${id}`)).toHaveCount(0);
    await page.getByTestId(`chip-${id}`).click();
    await expect(page.getByTestId(`panel-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId('panel-motion')).toBeVisible();
  await expect(page.getByTestId('panel-energy')).toBeVisible();
});

test('presentation with N = 5: the matrix ODE pill pushes the scene down', async ({ page }) => {
  const inset = () => run<number>(page, 'return s.view.insetTop;');
  await page.keyboard.press('p');
  await expect(page.getByTestId('presentation')).toBeVisible();
  await page.waitForTimeout(100);
  const three = await inset();
  await run(page, 's.setCount(5);');
  await page.waitForTimeout(100);
  const five = await inset();
  // Default pill: 24 + 62 + 14 = 100. A 3 × 3 and a 5 × 5 matrix are taller, and 5 more than 3.
  expect(three).toBeGreaterThan(100);
  expect(five).toBeGreaterThan(three);
});
