import { describe, expect, it } from 'vitest';
import { FlingEstimator } from './flingEstimator';

describe('FlingEstimator', () => {
  it('recovers a constant velocity from jittery samples', () => {
    const f = new FlingEstimator(80);
    for (let i = 0; i <= 10; i++) f.add(i * 16, 0.5 * (i * 0.016) + (i % 2 ? 0.001 : -0.001));
    expect(f.velocity(160)).toBeCloseTo(0.5, 1);
  });

  it('reports zero when the pointer stopped before release', () => {
    const f = new FlingEstimator(80);
    for (let i = 0; i <= 10; i++) f.add(i * 16, i * 0.01);
    expect(f.velocity(160 + 200)).toBe(0);
  });

  it('caps the speed and keeps the sign', () => {
    const f = new FlingEstimator(80, 3);
    for (let i = 0; i <= 5; i++) f.add(i * 10, -i * 1);
    expect(f.velocity(50)).toBe(-3);
  });
});
