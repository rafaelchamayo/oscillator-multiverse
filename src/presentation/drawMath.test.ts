import { describe, expect, it } from 'vitest';
import { COUPLED_DEFAULTS, coupledModel } from '../models/coupled/model';
import { dampedDrivenModel, DD_DEFAULTS } from '../models/damped-driven/model';
import { qhoModel, QHO_DEFAULTS } from '../models/quantum-ho/model';
import { shoModel, SHO_DEFAULTS } from '../models/sho/model';
import { drawEquation, equationHeight, measureEquation } from './drawMath';

/** Records fillText calls (text and color) from a fake 2D context. */
function fakeCtx() {
  const texts: string[] = [];
  const colored: { text: string; color: string }[] = [];
  const noop = () => {};
  const g = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: '',
    globalAlpha: 1,
    textAlign: '',
    textBaseline: '',
    measureText: (t: string) => ({ width: t.length * 10 }),
    fillText(t: string) {
      texts.push(t);
      colored.push({ text: t, color: this.fillStyle });
    },
    beginPath: noop,
    fillRect: noop,
    arc: noop,
    fill: noop,
    moveTo: noop,
    quadraticCurveTo: noop,
    stroke: noop,
  };
  return { g: g as unknown as CanvasRenderingContext2D, texts, colored };
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

  it('writes the coupled ODE as matrices and highlights a spring in K', () => {
    const { g, texts, colored } = fakeCtx();
    const eq = coupledModel.latexODE({ ...COUPLED_DEFAULTS, n: 2 });
    drawEquation(g, eq, 0, 0, 20, '#000', { terms: ['k2'], color: '#f0f' });
    // M (row by row, per column), ẍ with subscripts, +, K, x, = 0.
    expect(texts.join(' ')).toBe('1.0 0 0 1.0 x 1 x 2 + 8.0 − 4.0 − 4.0 8.0 x 1 x 2 = 0');
    // k₂ couples the two masses: it is in all four entries of K, and nowhere in M.
    const lit = colored.filter((c) => c.color === '#f0f').map((c) => c.text);
    expect(lit.join('')).toBe('8.0−4.0−4.08.0');
    expect(measureEquation(g, eq, 20)).toBeGreaterThan(200);
    expect(equationHeight(eq, 20)).toBeGreaterThan(2 * 20);
  });

  it('writes the Schrödinger equation with stacked fractions and highlights the kinetic term', () => {
    const { g, texts, colored } = fakeCtx();
    const eq = qhoModel.latexODE(QHO_DEFAULTS);
    drawEquation(g, eq, 0, 0, 20, '#000', { terms: ['kinetic'], color: '#f0f' });
    // i ∂ψ/∂t = −½ ∂²ψ/∂x² + ½ x² ψ: numerators before denominators, scripts after their base.
    expect(texts.join(' ')).toBe('i ∂ ψ ∂ t = − 1 2 ∂ 2 ψ ∂ x 2 + 1 2 x 2 ψ');
    const lit = colored.filter((c) => c.color === '#f0f').map((c) => c.text);
    expect(lit.join('')).toBe('12∂2ψ∂x2');
    // Taller than one line: the fractions stick out.
    expect(equationHeight(eq, 20)).toBeGreaterThan(1.5 * 20);
  });
});
