import { describe, expect, it } from 'vitest';
import { paperPoint, paperTime, PAPER_SPEED } from './PaperTrace';
import { ViewTransform } from '../view';

describe('paper trace', () => {
  it('puts the newest sample exactly under the body, older ones further along the paper', () => {
    const now = 5;
    expect(paperPoint(0.42, now, now, 0.4)).toEqual({ u: 0.42, w: 0.4 });
    const older = paperPoint(-0.3, now - 2, now, 0.4);
    expect(older.u).toBe(-0.3);
    expect(older.w).toBeCloseTo(0.4 + 2 * PAPER_SPEED, 12);
    expect(paperTime(older.w, now, 0.4)).toBeCloseTo(3, 12);
  });

  it.each([0, -Math.PI / 2])(
    'trace and body share the screen coordinate along the motion (angle %f)',
    (angle) => {
      const v = new ViewTransform();
      v.angle = angle;
      v.setViewport(1000, 700);
      v.fit({ uMin: -1.6, uMax: 1.9, wMin: -0.7, wMax: 2.5 });
      const x = 0.37;
      const body = v.toScreen(x, 0.13);
      const sample = paperPoint(x, 1, 4, 0.38);
      const s = v.toScreen(sample.u, sample.w);
      // Horizontal view: same screen x. Vertical view: same screen y.
      if (angle === 0) expect(s.x).toBeCloseTo(body.x, 9);
      else expect(s.y).toBeCloseTo(body.y, 9);
    },
  );
});
