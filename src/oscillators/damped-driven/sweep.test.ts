import { describe, expect, it } from 'vitest';
import { steadyAmplitude } from '../../models/damped-driven/analytic';
import { dampedDrivenModel, type DampedDrivenParams } from '../../models/damped-driven/model';
import { simulate } from '../../test/sim';
import { ResonanceSweep } from './sweep';

describe('resonance sweep', () => {
  it('records points that fall on the theoretical curve A(ω) (< 1%)', () => {
    const p: DampedDrivenParams = { m: 1, k: 4, b: 1.2, F0: 1, omega: 1, g: 0 };
    const sweep = new ResonanceSweep({
      setParam: (key, v) => ((p as unknown as Record<string, number>)[key] = v),
    });
    const y = dampedDrivenModel.createState(p, { x0: 0, v0: 0 });
    sweep.startAuto(p);
    let n = 0;
    simulate(dampedDrivenModel, p, y, 600, (t, s) => {
      if (++n % 5 === 0) sweep.onSample(t, s[0]!, p, false);
    });
    expect(sweep.auto).toBe(false); // finished
    expect(sweep.points.length).toBe(25);
    for (const q of sweep.points) {
      const A = steadyAmplitude(p, q.omega);
      expect(Math.abs(q.A - A) / A).toBeLessThan(0.01);
    }
  });

  it('never records with no damping (the transient never dies) and clears on b change', () => {
    const p: DampedDrivenParams = { m: 1, k: 4, b: 0, F0: 1, omega: 1.8, g: 0 };
    const sweep = new ResonanceSweep({ setParam: () => {} });
    const y = dampedDrivenModel.createState(p, { x0: 0, v0: 0 });
    let n = 0;
    simulate(dampedDrivenModel, p, y, 120, (t, s) => {
      if (++n % 5 === 0) sweep.onSample(t, s[0]!, p, false);
    });
    expect(sweep.points).toEqual([]);
    sweep.points.push({ omega: 1, A: 1 });
    p.b = 0.5;
    sweep.onSample(121, y[0]!, p, false);
    expect(sweep.points).toEqual([]);
  });
});
