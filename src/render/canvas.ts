/** Resizes a canvas backing store to its CSS size × devicePixelRatio. Returns the ratio. */
export function fitCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number): number {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.max(1, Math.round(cssWidth * dpr));
  const h = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return dpr;
}
