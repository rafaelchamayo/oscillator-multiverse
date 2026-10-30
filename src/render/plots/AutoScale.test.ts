import { describe, expect, it } from 'vitest';
import { AutoScale, niceStep } from './AutoScale';

describe('AutoScale', () => {
  it('grows fast, shrinks slowly and never jumps', () => {
    const s = new AutoScale({ minSpan: 0.1, symmetric: true, padding: 0 });
    s.update(-1, 1, 1 / 60);
    expect(s.max).toBeCloseTo(1);
    s.update(-2, 2, 1 / 60);
    const afterGrowStep = s.max;
    expect(afterGrowStep).toBeGreaterThan(1);
    expect(afterGrowStep).toBeLessThan(2); // animated, not instantaneous
    for (let i = 0; i < 60; i++) s.update(-2, 2, 1 / 60);
    expect(s.max).toBeCloseTo(2, 3);
    s.update(-0.5, 0.5, 1 / 60);
    expect(2 - s.max).toBeLessThan(0.05); // shrinking is slow
  });

  it('keeps a minimum span and includes zero when asked', () => {
    const s = new AutoScale({ minSpan: 1, includeZero: true, padding: 0 });
    expect(s.target(5, 6)).toEqual([0, 6]);
    expect(s.target(0, 0.1)).toEqual([-0.95, 1.05]);
  });

  it('niceStep picks 1-2-5 steps', () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(0.9, 4)).toBe(0.2);
    expect(niceStep(37, 4)).toBe(10);
  });
});
