import { expect, test, type Page } from '@playwright/test';

const run = <T>(page: Page, body: string): Promise<T> =>
  page.evaluate(`(() => { const s = window.__osc; ${body} })()`) as Promise<T>;

interface Debug {
  presenting: boolean;
  recording: boolean;
  frames: number;
  canvas: { width: number; height: number } | null;
  ic: { x0: number; v0: number };
  block: { x: number; y: number };
  t: number;
  running: boolean;
  perf: { renderMs: number; renderMax: number; frames: number; longFrames: number };
}
const debug = (page: Page) => run<Debug>(page, 'return s.debug();');

/** Stops the recording and loads it into a <video> to read its size. */
const probe = (page: Page) =>
  page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__osc;
    const blob: Blob = await s.stopRecording();
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(blob);
    await new Promise((r) => (v.onloadedmetadata = r));
    return { size: blob.size, type: blob.type, w: v.videoWidth, h: v.videoHeight };
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/#/sho');
  await page.waitForFunction(() => 'debug' in ((window as { __osc?: object }).__osc ?? {}));
});

test('P opens a 1920×1080 canvas that covers the UI; Esc goes back', async ({ page }) => {
  await page.keyboard.press('p');
  await expect(page.getByTestId('presentation')).toBeVisible();
  const d = await debug(page);
  expect(d.presenting).toBe(true);
  expect(d.canvas).toEqual({ width: 1920, height: 1080 });
  // Letterboxed 16:9 and on top of the toolbar and the plots panel.
  const box = (await page.getByTestId('present-canvas').boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(16 / 9, 2);
  for (const id of ['play', 'chip-x', 'ode']) {
    const b = (await page.getByTestId(id).boundingBox())!;
    const covered = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('[data-testid=presentation]'),
      [b.x + b.width / 2, b.y + b.height / 2],
    );
    expect(covered).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('presentation')).toHaveCount(0);
  expect((await debug(page)).presenting).toBe(false);
  // The stage canvas is driven again.
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  expect((await debug(page)).t).toBeGreaterThan(0.1);
});

test('dragging the block works on the scaled presentation canvas', async ({ page }) => {
  await page.getByTestId('present').click();
  await expect(page.getByTestId('presentation')).toBeVisible();
  await page.waitForTimeout(200);
  const d0 = await debug(page);
  await page.mouse.move(d0.block.x, d0.block.y);
  await page.mouse.down();
  await page.mouse.move(d0.block.x + 120, d0.block.y, { steps: 8 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  const d1 = await debug(page);
  expect(d1.ic.x0).toBeGreaterThan(d0.ic.x0 + 0.2);
  expect(d1.running).toBe(false);
});

test('options hide the ODE and the axes from the canvas', async ({ page }) => {
  await page.keyboard.press('p');
  await page.getByTestId('present-ode').click();
  await page.getByTestId('present-axes').click();
  await page.getByTestId('present-background').click();
  const opts = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (window as any).__osc && document.querySelector('[data-testid=present-ode]')?.ariaPressed,
  );
  expect(opts).toBe('false');
  await expect(page.getByTestId('present-axes')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('present-background')).toHaveText(/(liso|solid)/);
});

test('G records the canvas and downloads a WebM', async ({ page }) => {
  await run(page, 's.setPausedState(0.8, 0);');
  const download = page.waitForEvent('download');
  await page.keyboard.press('g');
  await expect(page.getByTestId('rec-indicator')).toBeVisible();
  expect((await debug(page)).recording).toBe(true);
  // Played from t = 0 while recording, so time stays on the 1/60 s grid.
  await run(page, 's.play();');
  await page.waitForTimeout(1500);
  const d = await debug(page);
  expect(d.frames).toBeGreaterThan(60);
  // Frame-locked: simulated time moves in whole 1/60 s ticks.
  const ticks = d.t * 60;
  expect(Math.abs(ticks - Math.round(ticks))).toBeLessThan(1e-6);
  await page.keyboard.press('g');
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^oscillator-sho-.*\.webm$/);
  await expect(page.getByTestId('rec-indicator')).toHaveCount(0);
});

test('a 30 s recording: 1920×1080 WebM, real-time pace, cheap frames', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/#/damped-driven');
  await page.waitForFunction(() => 'debug' in ((window as { __osc?: object }).__osc ?? {}));
  for (const id of ['chip-phase', 'chip-vec.net']) await page.getByTestId(id).click();
  await page.getByTestId('preset-resonance').click();
  await page.keyboard.press('p');
  await page.waitForTimeout(300);
  const t0 = await run<number>(page, 's.startRecording(); return s.loop.t;');
  await page.waitForTimeout(30_000);
  const d = await debug(page);
  const video = await probe(page);
  console.log('30 s recording:', JSON.stringify({ perf: d.perf, sim: d.t - t0, video }));
  expect(video.w).toBe(1920);
  expect(video.h).toBe(1080);
  expect(video.size).toBeGreaterThan(1e6);
  // Simulated time keeps pace with real time (whole 1/60 s ticks, late frames catch up), and
  // drawing a frame costs a fraction of the 16.7 ms budget. Headless Chromium encodes 1080p in
  // software, so its own frame rate under recording is not asserted here (see DECISIONS.md).
  expect(Math.abs(d.t - t0 - 30)).toBeLessThan(0.5);
  expect(d.perf.renderMs).toBeLessThan(6);
});

test('? opens the shortcuts help, focused, and Esc closes it', async ({ page }) => {
  await page.keyboard.press('?');
  const help = page.getByTestId('help');
  await expect(help).toBeVisible();
  await expect(page.getByTestId('help-close')).toBeFocused();
  await expect(help.locator('kbd')).toHaveCount(12);
  // Shortcuts are off while the dialog is open.
  await page.keyboard.press('p');
  await expect(page.getByTestId('presentation')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
});

test('keyboard focus is visible on toolbar buttons', async ({ page }) => {
  await page.getByTestId('reset').focus();
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return {
      matches: el.matches(':focus-visible'),
      style: cs.outlineStyle,
      width: cs.outlineWidth,
    };
  });
  expect(outline.matches).toBe(true);
  expect(outline.style).toBe('solid');
  expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
});
