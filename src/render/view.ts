export interface Vec2 {
  x: number;
  y: number;
}

/** Axis-aligned box in scene coordinates (meters): u along the oscillation, w across it. */
export interface SceneBounds {
  uMin: number;
  uMax: number;
  wMin: number;
  wMax: number;
}

/**
 * Maps scene coordinates (u, w) in meters to CSS pixels:
 *   screen = center + pan + zoom · fitScale · R(angle) · ((u, w) − focus)
 * With angle = 0, +u is right and +w is down. `angle` is used by the perspective switch.
 */
export class ViewTransform {
  width = 1;
  height = 1;
  fitScale = 200;
  zoom = 1;
  panX = 0;
  panY = 0;
  angle = 0;
  /** Screen pixels at the bottom covered by floating UI (toolbar): fit and center above them. */
  insetBottom = 0;
  focus: Vec2 = { x: 0, y: 0 };
  private bounds: SceneBounds = { uMin: -1, uMax: 1, wMin: -1, wMax: 1 };

  static readonly MIN_ZOOM = 0.25;
  static readonly MAX_ZOOM = 6;

  get scale(): number {
    return this.fitScale * this.zoom;
  }

  /** Pixels per meter at the current zoom. */
  get pxPerMeter(): number {
    return this.scale;
  }

  setViewport(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.fit(this.bounds);
  }

  /** Chooses fitScale and focus so `b` fills the viewport (rotation-aware). */
  fit(b: SceneBounds, margin = 0.08): void {
    this.bounds = b;
    const c = Math.abs(Math.cos(this.angle));
    const s = Math.abs(Math.sin(this.angle));
    const bw = b.uMax - b.uMin;
    const bh = b.wMax - b.wMin;
    const sw = bw * c + bh * s;
    const sh = bw * s + bh * c;
    const avail = 1 - 2 * margin;
    this.fitScale = Math.min(
      (this.width * avail) / sw,
      ((this.height - this.insetBottom) * avail) / sh,
    );
    this.focus = { x: (b.uMin + b.uMax) / 2, y: (b.wMin + b.wMax) / 2 };
  }

  /**
   * Moves fitScale and focus towards the fit of `b` (rate in 1/s), so bound changes and the
   * perspective rotation re-frame the scene smoothly. `snap` jumps straight there.
   */
  fitSmooth(b: SceneBounds, dt: number, snap = false, rate = 8): void {
    const prevScale = this.fitScale;
    const prevFocus = this.focus;
    this.fit(b);
    if (snap) return;
    const k = 1 - Math.exp(-rate * dt);
    this.fitScale = prevScale + (this.fitScale - prevScale) * k;
    this.focus = {
      x: prevFocus.x + (this.focus.x - prevFocus.x) * k,
      y: prevFocus.y + (this.focus.y - prevFocus.y) * k,
    };
  }

  resetView(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  private get centerY(): number {
    return (this.height - this.insetBottom) / 2;
  }

  toScreen(u: number, w: number): Vec2 {
    const du = u - this.focus.x;
    const dw = w - this.focus.y;
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    return {
      x: this.width / 2 + this.panX + this.scale * (c * du - s * dw),
      y: this.centerY + this.panY + this.scale * (s * du + c * dw),
    };
  }

  toScene(x: number, y: number): Vec2 {
    const dx = (x - this.width / 2 - this.panX) / this.scale;
    const dy = (y - this.centerY - this.panY) / this.scale;
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    return { x: this.focus.x + c * dx + s * dy, y: this.focus.y - s * dx + c * dy };
  }

  /** Zoom by `factor` keeping the scene point under (x, y) fixed. */
  zoomAt(x: number, y: number, factor: number): void {
    const before = this.toScene(x, y);
    this.zoom = Math.min(
      ViewTransform.MAX_ZOOM,
      Math.max(ViewTransform.MIN_ZOOM, this.zoom * factor),
    );
    const after = this.toScreen(before.x, before.y);
    this.panX += x - after.x;
    this.panY += y - after.y;
  }

  panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
  }

  /** Sets the 2D context so drawing happens in scene meters. */
  apply(g: CanvasRenderingContext2D, dpr: number): void {
    const c = Math.cos(this.angle) * this.scale;
    const s = Math.sin(this.angle) * this.scale;
    const o = this.toScreen(0, 0);
    g.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * o.x, dpr * o.y);
  }
}
