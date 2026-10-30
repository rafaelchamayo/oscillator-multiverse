import { colors } from '../theme';
import { alpha } from './draw';

export interface SpringStyle {
  coils: number;
  /** Coil radius in meters. */
  radius: number;
  /** Stroke width in CSS pixels. */
  widthPx: number;
  glow: boolean;
}

/** Visual spring properties from k: stiffer → more coils and a thicker wire. */
export function springStyleFromK(k: number, kMin: number, kMax: number): Omit<SpringStyle, 'glow'> {
  const f = Math.min(1, Math.max(0, (k - kMin) / (kMax - kMin)));
  return { coils: Math.round(10 + 12 * f), radius: 0.08, widthPx: 2 + 4.5 * f };
}

/**
 * Each coil is a side-viewed circle (a prolate cycloid). The pitch follows the real length, so the spring visibly compresses and stretches.
 * Back half of each turn is drawn darker first, then the front half on top.
 */
export function drawSpring(
  g: CanvasRenderingContext2D,
  u0: number,
  u1: number,
  w: number,
  style: SpringStyle,
  px: number,
): void {
  const lead = 0.05;
  const len = u1 - u0;
  const coilLen = Math.max(len - 2 * lead, 0.01);
  const n = style.coils;
  const r = style.radius;
  // Each turn is a circle of radius r seen slightly from the side: the depth component
  // shows up as a forward/back excursion along the axis, which draws the loops.
  const rx = r * 0.62;
  const samples = n * 32;
  const pts: { u: number; w: number; front: boolean }[] = [];
  for (let i = 0; i <= samples; i++) {
    const th = (i / samples) * 2 * Math.PI * n;
    pts.push({
      u: u0 + lead + (coilLen * i) / samples + rx * (1 - Math.cos(th)),
      w: w - r * Math.sin(th),
      front: Math.sin(th + Math.PI / 2) < 0,
    });
  }
  // Keep the end on u1 − lead: the excursion vanishes at θ = 2πn.

  const lw = style.widthPx * px;
  g.lineCap = 'round';
  g.lineJoin = 'round';

  if (style.glow) {
    g.strokeStyle = alpha(colors.magenta, 0.35);
    g.lineWidth = lw + 8 * px;
    strokePath(g, pts, u0, u1, w, lead, () => true);
  }

  // Back strands.
  g.strokeStyle = alpha(colors.purple, 0.6);
  g.lineWidth = lw * 0.75;
  strokeSegments(g, pts, (p) => !p.front);

  // Leads and front strands.
  const grad = g.createLinearGradient(0, w - r, 0, w + r);
  grad.addColorStop(0, colors.lilac);
  grad.addColorStop(1, colors.accent);
  g.strokeStyle = grad;
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(u0, w);
  g.lineTo(u0 + lead, w);
  g.moveTo(u1 - lead, w);
  g.lineTo(u1, w);
  g.stroke();
  strokeSegments(g, pts, (p) => p.front);
}

function strokeSegments(
  g: CanvasRenderingContext2D,
  pts: { u: number; w: number; front: boolean }[],
  keep: (p: { front: boolean }) => boolean,
): void {
  g.beginPath();
  let drawing = false;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (keep(b)) {
      if (!drawing) g.moveTo(a.u, a.w);
      g.lineTo(b.u, b.w);
      drawing = true;
    } else drawing = false;
  }
  g.stroke();
}

function strokePath(
  g: CanvasRenderingContext2D,
  pts: { u: number; w: number; front: boolean }[],
  u0: number,
  u1: number,
  w: number,
  lead: number,
  keep: (p: { front: boolean }) => boolean,
): void {
  g.beginPath();
  g.moveTo(u0, w);
  g.lineTo(u0 + lead, w);
  for (const p of pts) if (keep(p)) g.lineTo(p.u, p.w);
  g.lineTo(u1, w);
  g.stroke();
}
