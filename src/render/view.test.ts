import { describe, expect, it } from 'vitest';
import { ViewTransform } from './view';

const make = (angle = 0) => {
  const v = new ViewTransform();
  v.angle = angle;
  v.setViewport(1000, 600);
  v.fit({ uMin: -1.5, uMax: 1.7, wMin: -0.6, wMax: 0.6 });
  return v;
};

describe('ViewTransform', () => {
  it.each([0, -Math.PI / 2, 0.7])('toScene inverts toScreen (angle %f)', (angle) => {
    const v = make(angle);
    v.zoomAt(300, 200, 1.7);
    v.panBy(40, -25);
    const s = v.toScreen(0.42, -0.13);
    const back = v.toScene(s.x, s.y);
    expect(back.x).toBeCloseTo(0.42, 12);
    expect(back.y).toBeCloseTo(-0.13, 12);
  });

  it('zoomAt keeps the point under the cursor fixed and clamps the zoom', () => {
    const v = make();
    const before = v.toScene(320, 180);
    v.zoomAt(320, 180, 2);
    const after = v.toScene(320, 180);
    expect(after.x).toBeCloseTo(before.x, 12);
    expect(after.y).toBeCloseTo(before.y, 12);
    v.zoomAt(0, 0, 1000);
    expect(v.zoom).toBe(ViewTransform.MAX_ZOOM);
  });

  it('fit puts the bounds inside the viewport; resetView restores zoom and pan', () => {
    const v = make();
    const a = v.toScreen(-1.5, -0.6);
    const b = v.toScreen(1.7, 0.6);
    for (const p of [a, b]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1000);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(600);
    }
    v.zoomAt(10, 10, 3);
    v.resetView();
    expect(v.toScreen(-1.5, -0.6)).toEqual(a);
  });
});
