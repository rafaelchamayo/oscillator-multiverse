/** Fixed-capacity circular buffer of numbers. Index 0 is the oldest sample. */
export class RingBuffer {
  private readonly data: Float64Array;
  private start = 0;
  private len = 0;

  constructor(readonly capacity: number) {
    this.data = new Float64Array(capacity);
  }

  get length(): number {
    return this.len;
  }

  push(v: number): void {
    const end = (this.start + this.len) % this.capacity;
    this.data[end] = v;
    if (this.len < this.capacity) this.len++;
    else this.start = (this.start + 1) % this.capacity;
  }

  get(i: number): number {
    return this.data[(this.start + i) % this.capacity]!;
  }

  set(i: number, v: number): void {
    this.data[(this.start + i) % this.capacity] = v;
  }

  last(): number {
    return this.get(this.len - 1);
  }

  clear(): void {
    this.start = 0;
    this.len = 0;
  }
}
