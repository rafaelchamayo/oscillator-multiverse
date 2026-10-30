import { RingBuffer } from './RingBuffer';

/**
 * Time series of selected observables, sampled every `every` simulation steps.
 * Index 0 is the oldest sample. `manual` marks samples taken while the hand held the body.
 */
export class History {
  readonly t: RingBuffer;
  readonly manual: RingBuffer;
  private readonly series = new Map<string, RingBuffer>();
  private counter = 0;

  constructor(
    readonly keys: readonly string[],
    readonly capacity: number,
    readonly every = 1,
  ) {
    this.t = new RingBuffer(capacity);
    this.manual = new RingBuffer(capacity);
    for (const k of keys) this.series.set(k, new RingBuffer(capacity));
  }

  get length(): number {
    return this.t.length;
  }

  /** Offer one simulation step; stored only every `every` steps (or when `force`). */
  offer(t: number, obs: Record<string, number>, manual: boolean, force = false): boolean {
    this.counter++;
    if (!force && this.counter < this.every) return false;
    this.counter = 0;
    this.t.push(t);
    this.manual.push(manual ? 1 : 0);
    for (const [k, rb] of this.series) rb.push(obs[k] ?? NaN);
    return true;
  }

  get(key: string): RingBuffer {
    const rb = this.series.get(key);
    if (!rb) throw new Error(`History has no series "${key}"`);
    return rb;
  }

  has(key: string): boolean {
    return this.series.has(key);
  }

  /** Index of the first sample with time ≥ t (binary search). */
  indexAt(t: number): number {
    let lo = 0;
    let hi = this.t.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.t.get(mid) < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Adds `d` to every stored value of `key` (e.g. when the origin of x moves). */
  shift(key: string, d: number): void {
    const rb = this.get(key);
    for (let i = 0; i < rb.length; i++) rb.set(i, rb.get(i) + d);
  }

  clear(): void {
    this.t.clear();
    this.manual.clear();
    for (const rb of this.series.values()) rb.clear();
    this.counter = 0;
  }
}
