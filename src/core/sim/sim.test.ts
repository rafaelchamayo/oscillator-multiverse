import { describe, expect, it } from 'vitest';
import { shoModel, type ShoParams } from '../../models/sho/model';
import { createRk4 } from '../integrators/rk4';
import { RingBuffer } from './RingBuffer';
import { DEFAULT_DT, SimulationLoop } from './SimulationLoop';

const p: ShoParams = { m: 2, k: 8, g: 0 };
const makeLoop = () =>
  new SimulationLoop({
    model: shoModel,
    params: p,
    state: shoModel.createState(p, { x0: 0.5, v0: 0 }),
  });

describe('RK4', () => {
  it('is exact for a linear ODE y′ = 1 (single step)', () => {
    const rk = createRk4(1);
    const y = Float64Array.of(2);
    rk.step((_t, _y, _p, out) => (out[0] = 1), 0, y, 0.5, null);
    expect(y[0]).toBe(2.5);
  });

  it('has 4th-order global error on y′ = y', () => {
    const err = (h: number) => {
      const rk = createRk4(1);
      const y = Float64Array.of(1);
      for (let i = 0; i < Math.round(1 / h); i++)
        rk.step((_t, s, _p, o) => (o[0] = s[0]!), 0, y, h, null);
      return Math.abs(y[0]! - Math.E);
    };
    const order = Math.log2(err(0.02) / err(0.01));
    expect(order).toBeGreaterThan(3.8);
    expect(order).toBeLessThan(4.2);
  });
});

describe('RingBuffer', () => {
  it('keeps the newest `capacity` samples in order', () => {
    const rb = new RingBuffer(3);
    [1, 2, 3, 4, 5].forEach((v) => rb.push(v));
    expect(rb.length).toBe(3);
    expect([rb.get(0), rb.get(1), rb.get(2)]).toEqual([3, 4, 5]);
    expect(rb.last()).toBe(5);
    rb.clear();
    expect(rb.length).toBe(0);
  });
});

describe('SimulationLoop', () => {
  it('uses a fixed dt and does nothing while paused', () => {
    const loop = makeLoop();
    expect(loop.advance(1 / 60)).toBe(0);
    loop.running = true;
    expect(loop.dt).toBe(DEFAULT_DT);
    expect(loop.advance(1 / 60)).toBe(10);
  });

  it('speed scales simulated time, not dt', () => {
    for (const speed of [0.25, 0.5, 1, 2, 4]) {
      const loop = makeLoop();
      loop.running = true;
      loop.speed = speed;
      for (let i = 0; i < 60; i++) loop.advanceFrame();
      expect(loop.dt).toBe(DEFAULT_DT);
      expect(loop.t).toBeCloseTo(speed, 12);
    }
  });

  it('is deterministic regardless of frame timing', () => {
    const record = (frames: number[]) => {
      const loop = makeLoop();
      const xs: number[] = [];
      loop.onStep = ({ state }) => xs.push(state[0]!);
      loop.running = true;
      frames.forEach((f) => loop.advance(f));
      return xs;
    };
    const steady = record(Array.from({ length: 120 }, () => 1 / 60));
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 0.03;
    const jittery = record(Array.from({ length: 200 }, rand));
    const n = Math.min(steady.length, jittery.length);
    expect(n).toBeGreaterThan(1000);
    expect(jittery.slice(0, n)).toEqual(steady.slice(0, n));
  });

  it('clamps very long frames', () => {
    const loop = makeLoop();
    loop.running = true;
    expect(loop.advance(5)).toBe(Math.round(0.1 / DEFAULT_DT));
  });

  it('holding suspends integration but time and samples keep flowing', () => {
    const loop = makeLoop();
    const manual: boolean[] = [];
    loop.onStep = ({ manual: m }) => manual.push(m);
    loop.running = true;
    loop.advanceFrame();
    loop.hold(0.2, 0);
    loop.advanceFrame();
    expect(loop.state[0]).toBeCloseTo(0.2, 12);
    loop.hold(0.1, -1.5);
    const t0 = loop.t;
    loop.advanceFrame();
    expect(loop.t).toBeGreaterThan(t0);
    expect(loop.state[0]).toBeCloseTo(0.1, 12);
    expect(manual.slice(0, 10).every((m) => !m)).toBe(true);
    expect(manual.slice(10).every((m) => m)).toBe(true);

    loop.release(0.1, -1.5);
    expect(loop.isHeld).toBe(false);
    loop.stepOnce();
    // Integration resumed from the release point with the fling velocity.
    expect(loop.state[0]).toBeCloseTo(0.1 - 1.5 * DEFAULT_DT, 4);
    expect(manual.at(-1)).toBe(false);
  });
});
