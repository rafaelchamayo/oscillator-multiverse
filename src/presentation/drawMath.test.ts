import { describe, expect, it } from 'vitest';
import { dampedDrivenModel, DD_DEFAULTS } from '../models/damped-driven/model';
import { shoModel, SHO_DEFAULTS } from '../models/sho/model';
import { drawEquation } from './drawMath';

/** Records fillText calls (text only) from a fake 2D context. */
function fakeCtx() {
  const texts: string[] = [];
  const g = {
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    measureText: (t: string) => ({ width: t.length * 10 }),
    fillText: (t: string) => texts.push(t),
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
  };
  return { g: g as unknown as CanvasRenderingContext2D, texts };
}

describe('canvas ODE renderer', () => {
  it('writes the SHO with its values', () => {
    const { g, texts } = fakeCtx();
    drawEquation(g, shoModel.latexODE(SHO_DEFAULTS), 0, 0, 20, '#000');
    expect(texts.join(' ')).toBe('2.0 x + 8.0 x = 0');
  });

  it('writes the driven ODE including cos(ωt) and gravity', () => {
    const { g, texts } = fakeCtx();
    drawEquation(g, dampedDrivenModel.latexODE({ ...DD_DEFAULTS, g: 9.81 }), 0, 0, 20, '#000');
    expect(texts.join(' ')).toBe('1.0 x + 0.4 x + 4.0 x = 1.0 cos ( 1.5 t ) − 1.0 · 9.81');
  });
});
