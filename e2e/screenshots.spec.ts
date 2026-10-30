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

test('screenshot sho trace and plots (running)', async ({ page }) => {
  await open(page, '/#/sho', 'es');
  await sim(page, 's.loop.speed = 4; s.play();');
  await page.waitForTimeout(2600);
  await sim(page, 's.loop.speed = 1;');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'e2e/screenshots/sho-trace.png' });
});

test('screenshot sho hand-driven segment + paper hover', async ({ page }) => {
  await open(page, '/#/sho', 'en');
  await sim(page, 's.loop.speed = 2; s.play();');
  await page.waitForTimeout(1200);
  // Grab the running block in-page (Playwright's latency would miss the moving block) and
  // move it by hand for a while: those samples are drawn dashed in pink.
  await page.evaluate(
    () =>
      new Promise<void>((done) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (window as any).__osc;
        const x0 = s.state[0] as number;
        s.beginHold(x0);
        const start = performance.now();
        const id = setInterval(() => {
          const f = (performance.now() - start) / 1000;
          const x = x0 + 0.6 * Math.sin(f * 2.2);
          s.holdTarget = { x, v: 0 };
          if (f > 1.6) {
            clearInterval(id);
            s.endHold(x, 0);
            done();
          }
        }, 16);
      }),
  );
  await page.waitForTimeout(1000);
  await sim(page, 's.pause();');
  // Hover the trace one second back on the paper.
  const p = (await sim(
    page,
    `const h = s.history; const i = h.indexAt(s.loop.t - 1); const w = 0.38 + (s.loop.t - h.t.get(i)) * 0.25; return s.pageCoords(h.get('x').get(i), w);`,
  )) as { x: number; y: number };
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'e2e/screenshots/sho-manual-hover.png' });
});

test('screenshot sho phase + acceleration plots', async ({ page }) => {
  await open(page, '/#/sho', 'es');
  await page.getByTestId('chip-a').click();
  await page.getByTestId('chip-phase').click();
  await sim(page, 's.setPausedState(0.6, 1.2); s.loop.speed = 4; s.play();');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: 'e2e/screenshots/sho-phase.png' });
});

test('screenshot sho vertical with gravity', async ({ page }) => {
  await open(page, '/#/sho', 'es');
  await sim(page, 's.loop.speed = 4; s.play();');
  await page.waitForTimeout(1200);
  await page.getByTestId('perspective').click();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'e2e/screenshots/sho-vertical.png' });
});

test('screenshot sho mid-rotation', async ({ page }) => {
  await open(page, '/#/sho', 'es');
  await sim(page, 's.loop.speed = 4; s.play();');
  await page.waitForTimeout(1500);
  await page.getByTestId('perspective').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'e2e/screenshots/sho-rotating.png' });
});

test('screenshot sho block popover (es)', async ({ page }) => {
  await open(page, '/#/sho', 'es');
  const d = (await sim(page, 'return s.debug();')) as { block: { x: number; y: number } };
  await page.mouse.move(d.block.x, d.block.y);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'e2e/screenshots/sho-popover-block.png' });
});

test('screenshot sho spring popover while running (en)', async ({ page }) => {
  await open(page, '/#/sho', 'en');
  await sim(page, 's.setParam("k", 20); s.play();');
  await page.waitForTimeout(1500);
  const p = (await sim(page, 'return s.pageCoords(-0.9, s.debug().bodyW);')) as {
    x: number;
    y: number;
  };
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/screenshots/sho-popover-spring.png' });
});

test('screenshot sho ODE term hover + vertical gravity', async ({ page }) => {
  await open(page, '/#/sho', 'es');
  await page.getByTestId('perspective').click();
  await sim(page, 's.play();');
  await page.waitForTimeout(1600);
  await page.locator('[data-testid=ode] .term--gravity').hover();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'e2e/screenshots/sho-ode-gravity.png' });
});

test('screenshot damped-driven initial (es)', async ({ page }) => {
  await open(page, '/#/damped-driven', 'es');
  await page.screenshot({ path: 'e2e/screenshots/dd-es.png' });
});

test('screenshot damped-driven resonance preset growing', async ({ page }) => {
  await open(page, '/#/damped-driven', 'es');
  await page.getByTestId('preset-resonance').click();
  await sim(page, 's.loop.speed = 4;');
  await page.waitForTimeout(4500);
  await page.screenshot({ path: 'e2e/screenshots/dd-resonance.png' });
});

test('screenshot damped-driven force vectors + forces plot (en)', async ({ page }) => {
  await open(page, '/#/damped-driven', 'en');
  for (const id of ['vec.spring', 'vec.damper', 'vec.drive', 'vec.net', 'forces']) {
    await page.getByTestId(`chip-${id}`).click();
  }
  await page.getByTestId('chip-resonance').click();
  await sim(page, 's.setParam("b", 1.5); s.play();');
  await page.waitForTimeout(2300);
  await sim(page, 's.pause();');
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'e2e/screenshots/dd-forces.png' });
});

test('screenshot damped-driven sweep points on the curve', async ({ page }) => {
  await open(page, '/#/damped-driven', 'es');
  await sim(page, 's.setParam("b", 1.2);');
  await page.getByTestId('action-sweep').click();
  // Run ~500 simulated seconds frame-locked inside the page (a real sweep takes minutes).
  await sim(page, 's.play(); for (let i = 0; i < 30000; i++) s.loop.advanceFrame();');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'e2e/screenshots/dd-sweep.png' });
});

test('screenshot damped-driven honey + vertical', async ({ page }) => {
  await open(page, '/#/damped-driven', 'es');
  await page.getByTestId('perspective').click();
  await sim(page, 's.setParam("b", 14); s.setParam("F0", 6); s.setParam("omega", 3); s.play();');
  await page.waitForTimeout(2500);
  const p = (await sim(page, 'return s.pageCoords(-1.0, -0.53);')) as { x: number; y: number };
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'e2e/screenshots/dd-vertical-honey.png' });
});
