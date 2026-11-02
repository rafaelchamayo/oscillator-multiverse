import { expect, test, type Page } from '@playwright/test';

type Body = { x: number; v: number; page: { x: number; y: number } };
type Debug = { t: number; running: boolean; pxPerMeter: number; bodies: Body[] };

const osc = (page: Page): Promise<Debug> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.evaluate(() => (window as any).__osc.debug());

const run = <T>(page: Page, body: string): Promise<T> =>
  page.evaluate(`(() => { const s = window.__osc; ${body} })()`) as Promise<T>;

/** Observables of the current state. */
const obs = (page: Page) =>
  run<Record<string, number>>(
    page,
    'return s.spec.model.observables(s.state, s.params, s.loop.t, {});',
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/#/quantum-ho');
  await page.waitForFunction(() => 'debug' in ((window as { __osc?: object }).__osc ?? {}));
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

test('the quantum tab starts with a coherent packet at ⟨x⟩ = 2.5', async ({ page }) => {
  await expect(page.getByTestId('tab-quantum-ho')).toHaveAttribute('aria-current', 'page');
  const o = await obs(page);
  expect(o.x).toBeCloseTo(2.5, 9);
  expect(o.dxdp).toBeCloseTo(0.5, 9);
});

test('dragging the packet while paused moves ⟨x⟩ with minimum uncertainty', async ({ page }) => {
  const d0 = await osc(page);
  const b = d0.bodies[0]!.page;
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  await page.mouse.move(b.x - 120, b.y, { steps: 8 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  const o = await obs(page);
  expect(o.x).toBeCloseTo(2.5 - 120 / d0.pxPerMeter, 2);
  expect(o.dxdp).toBeCloseTo(0.5, 9);
  expect((await osc(page)).running).toBe(false);
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
  test(`flinging the packet ${dir > 0 ? 'right' : 'left'} gives ⟨p⟩ with that sign`, async ({
    page,
  }) => {
    await run(page, 's.setPausedState(0, 0);');
    // The packet's grab point follows the drawn wave: let a frame draw the new state.
    await page.waitForTimeout(100);
    const d0 = await osc(page);
    await flingInPage(page, d0.bodies[0]!.page, dir * 50);
    expect((await osc(page)).running).toBe(true);
    const ic = await run<number>(page, 'return s.spec.model.getVel(s.initState);');
    expect(Math.sign(ic)).toBe(dir);
    expect(Math.abs(ic)).toBeGreaterThan(0.25);
  });
}

test('grabbing the packet while running holds ⟨x⟩', async ({ page }) => {
  const x = await run<number>(
    page,
    `const k = s.spec.model;
     s.play();
     for (let i = 0; i < 30; i++) s.loop.advanceFrame();
     s.beginHold(k.getPos(s.state), 0);
     for (let i = 0; i < 60; i++) {
       s.holdTarget = { x: -1.2, v: 0 };
       s.loop.hold(-1.2, 0, 0);
       s.loop.advanceFrame();
     }
     const x = k.getPos(s.state);
     s.endHold(x, 0);
     return x;`,
  );
  expect(x).toBeCloseTo(-1.2, 9);
});

test('a superposition evolves untouched: no bounce rewrites it', async ({ page }) => {
  const r = await run<{ P0: number; P1: number; E: number }>(
    page,
    `const k = s.spec.model;
     s.editState((st) => { st.fill(0); st[0] = Math.SQRT1_2; st[1] = Math.SQRT1_2; });
     s.play();
     for (let i = 0; i < 1500; i++) s.loop.advanceFrame();
     const o = k.observables(s.state, s.params, s.loop.t, {});
     return { P0: o.P0, P1: o.P1, E: o.E };`,
  );
  expect(r.P0).toBeCloseTo(0.5, 12);
  expect(r.P1).toBeCloseTo(0.5, 12);
  expect(r.E).toBeCloseTo(1, 12);
});

test('editState while paused becomes the initial condition', async ({ page }) => {
  const P = await run<number>(
    page,
    `s.editState((st) => { st.fill(0); st[3] = 1; });
     s.play();
     for (let i = 0; i < 60; i++) s.loop.advanceFrame();
     s.reset();
     return s.spec.model.observables(s.state, s.params, 0, {}).P3;`,
  );
  expect(P).toBeCloseTo(1, 12);
});

test('hovering the parabola shows its popover and lights the potential term', async ({ page }) => {
  // E_SCALE = 0.62 scene units per ħω; the packet starts at x = +2.5, far from x = −3.5.
  await run(page, 's.pause();');
  const p = await run<{ x: number; y: number }>(
    page,
    'return s.pageCoords(-3.5, -0.5 * 3.5 * 3.5 * 0.62);',
  );
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('popover-potential')).toBeVisible();
  await expect(page.locator('[data-testid=ode] .term--potential.term-lit')).toHaveCount(1);
});

/** Page coordinates of scene point (u, w). */
const at = (page: Page, u: number, w: number) =>
  run<{ x: number; y: number }>(page, `return s.pageCoords(${u}, ${w});`);

const WHEEL_U = 7.35;
const WHEEL_R = 0.27;
const levelW = (n: number) => -(n + 0.5) * 0.62;

test('dragging inside wheel 3 sets c₃ and keeps the total probability 1', async ({ page }) => {
  await page.getByTestId('preset-ground').click();
  await run(page, 's.pause();');
  // Half the radius, straight up: |c₃| = 0.5, arg c₃ = π/2.
  const p = await at(page, WHEEL_U, levelW(3) - 0.5 * WHEEL_R);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
  const o = await obs(page);
  expect(o.P3).toBeCloseTo(0.25, 2);
  expect(o.P0).toBeCloseTo(0.75, 2);
  let total = 0;
  for (let n = 0; n <= 40; n++) total += o[`P${n}`]!;
  expect(total).toBeCloseTo(1, 12);
  const phase = await run<number>(page, 'return Math.atan2(s.state[41 + 3], s.state[3]);');
  expect(phase).toBeCloseTo(Math.PI / 2, 1);
  // Paused: the edit is the new initial condition.
  await run(page, 's.reset();');
  expect((await obs(page)).P3).toBeCloseTo(0.25, 2);
});

test('each level popover has only its own two sliders, and they edit the state', async ({
  page,
}) => {
  await page.getByTestId('preset-slosh').click();
  await run(page, 's.pause();');
  // Near the left turning point (√5), away from the packet at ⟨x⟩ = 1/√2.
  const p = await at(page, -2.1, levelW(2));
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('popover-level2')).toBeVisible();
  await expect(page.getByRole('slider')).toHaveCount(2);
  await page.getByTestId('param-amp2').fill('0.6');
  const o = await obs(page);
  expect(o.P2).toBeCloseTo(0.36, 6);
  expect(o.P0! + o.P1!).toBeCloseTo(0.64, 6);
});

test('the badge follows the state', async ({ page }) => {
  await page.getByTestId('preset-ground').click();
  await expect(page.getByTestId('regime')).toHaveText(/estacionario|Stationary/);
  await page.getByTestId('preset-coherent').click();
  await expect(page.getByTestId('regime')).toHaveText(/coherente|Coherent/);
  await page.getByTestId('preset-slosh').click();
  await expect(page.getByTestId('regime')).toHaveText(/Superposi/);
});

test('the coherent preset follows the classical orbit: ⟨x⟩(π) = −2.5', async ({ page }) => {
  await page.getByTestId('preset-coherent').click();
  const x = await run<number>(
    page,
    `s.pause(); s.reset();
     const k = s.spec.model;
     // Exact evolution: step to t = π in one go.
     k.step(s.state, s.params, 0, Math.PI);
     return k.getPos(s.state);`,
  );
  expect(Math.abs(x + 2.5)).toBeLessThan(1e-6);
});

test('the |ψ|² chip and the n = 10 preset switch the scene view', async ({ page }) => {
  await expect(page.getByTestId('chip-density')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('preset-correspondence').click();
  await expect(page.getByTestId('chip-density')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('chip-classical')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('preset-cat').click();
  await expect(page.getByTestId('chip-density')).toHaveAttribute('aria-pressed', 'false');
});

/** The minimum of W the Wigner plot drew last (written on its canvas). */
const wignerMin = (page: Page) =>
  page
    .locator('[data-testid=panel-wigner] canvas')
    .evaluate((c) => Number((c as HTMLCanvasElement).dataset.wignerMin));

test('the Wigner panel goes negative for a cat and stays positive for a coherent state', async ({
  page,
}) => {
  await page.getByTestId('chip-wigner').click();
  await expect(page.getByTestId('panel-wigner')).toBeVisible();
  await page.getByTestId('preset-coherent').click();
  await expect.poll(() => wignerMin(page)).toBeGreaterThan(-1e-3);
  await page.getByTestId('preset-cat').click();
  await expect.poll(() => wignerMin(page)).toBeLessThan(-0.1);
});

test('the spectrum and uncertainty panels are there; Δx·Δp stays ½ for a coherent state', async ({
  page,
}) => {
  await expect(page.getByTestId('panel-spectrum')).toBeVisible();
  await page.getByTestId('chip-uncertainty').click();
  await expect(page.getByTestId('panel-uncertainty')).toBeVisible();
  const worst = await run<number>(
    page,
    `let w = 0;
     for (let i = 0; i < 120; i++) {
       s.loop.advanceFrame();
       w = Math.max(w, Math.abs(s.spec.model.observables(s.state, s.params, 0, {}).dxdp - 0.5));
     }
     return w;`,
  );
  expect(worst).toBeLessThan(1e-9);
});
