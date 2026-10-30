import { describe, expect, it } from 'vitest';
import { History } from './History';

describe('History', () => {
  it('decimates, keeps a window and finds samples by time', () => {
    const h = new History(['x'], 5, 2);
    for (let i = 1; i <= 20; i++) h.offer(i * 0.1, { x: i }, i > 16);
    expect(h.length).toBe(5);
    // Every 2nd step is stored: 0.2, 0.4, ..., 2.0 → the last five.
    expect(h.t.get(0)).toBeCloseTo(1.2);
    expect(h.get('x').last()).toBe(20);
    expect(h.manual.last()).toBe(1);
    expect(h.manual.get(0)).toBe(0);
    expect(h.indexAt(1.5)).toBe(2);
    expect(h.indexAt(0)).toBe(0);
    expect(h.indexAt(99)).toBe(5);
    h.clear();
    expect(h.length).toBe(0);
  });
});

describe('History.shift', () => {
  it('moves every stored value of one series', () => {
    const h = new History(['x', 'v'], 3, 1);
    for (let i = 0; i < 5; i++) h.offer(i, { x: i, v: 10 * i }, false);
    h.shift('x', -2);
    expect([0, 1, 2].map((i) => h.get('x').get(i))).toEqual([0, 1, 2]);
    expect(h.get('v').get(0)).toBe(20);
  });
});
