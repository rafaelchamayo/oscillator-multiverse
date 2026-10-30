/** Default scene scale: pixels per meter at zoom 1. */
export const PX_PER_METER = 220;

export const metersToPx = (m: number, scale = PX_PER_METER): number => m * scale;
export const pxToMeters = (px: number, scale = PX_PER_METER): number => px / scale;

const MINUS = '−';

/** Fixed-decimal number with a typographic minus, e.g. −0.42. Avoids "−0.00". */
export function formatNumber(v: number, digits = 2): string {
  const s = v.toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return s.startsWith('-') ? MINUS + s.slice(1) : s;
}

/** Number with unit separated by a thin space, e.g. "0.42 m". */
export function formatQuantity(v: number, unit: string, digits = 2): string {
  return `${formatNumber(v, digits)}\u2009${unit}`;
}
