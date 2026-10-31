import { colors } from '../theme';
import { alpha, clamp } from './draw';

export interface BlockMotionInput {
  /** Velocity along the axis (m/s): the block stretches along its motion. */
  v: number;
  /** Acceleration along the axis (m/s²): it squashes at turning points. */
  a: number;
  dt: number;
}

export interface BlockDrawInput {
  /** Center of the undeformed block (scene meters). */
  u: number;
  w: number;
  side: number;
  /** Meters per pixel for outlines (scales with zoom). */
  px: number;
  /** Serious mode: no squash & stretch. */
  serious: boolean;
  glow: boolean;
  /** Tints the face (tells bodies apart in multi-body tabs). */
  tint?: string;
}

/**
 * Brushed-metal block with chamfered corners. Squash & stretch is purely cosmetic: it is
 * area-preserving, anchored on the floor contact, and centered on the physical position —
 * hit-testing and physics always use the undeformed square.
 */
export class MetalBlock {
  private squash = 0;
  private squashVel = 0;

  /** Current horizontal scale of the drawn block (1 in serious mode). */
  scaleX(serious: boolean): number {
    return serious ? 1 : 1 + this.squash;
  }

  update(m: BlockMotionInput): void {
    const dt = Math.min(m.dt, 1 / 30);
    const target = 0.26 * Math.tanh(Math.abs(m.v) / 1.8) - 0.24 * Math.tanh(Math.abs(m.a) / 18);
    // Under-damped spring towards the target: a jelly-like wobble after impacts.
    const k = 260;
    const c = 12;
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const h = dt / steps;
      this.squashVel += (-k * (this.squash - target) - c * this.squashVel) * h;
      this.squash += this.squashVel * h;
    }
    this.squash = clamp(this.squash, -0.32, 0.36);
  }

  draw(g: CanvasRenderingContext2D, d: BlockDrawInput): void {
    const sx = this.scaleX(d.serious);
    const sy = 1 / sx;
    const s = d.side;
    const half = s / 2;
    const wBottom = d.w + half;

    // Contact shadow on the floor, widening with the squash.
    g.fillStyle = alpha(colors.primary, 0.14);
    g.beginPath();
    g.ellipse(d.u, wBottom + 0.012, half * sx * 1.15, 0.022, 0, 0, Math.PI * 2);
    g.fill();

    g.save();
    // Scale about the floor contact point so the block stays on the floor.
    g.translate(d.u, wBottom);
    g.scale(sx, sy);
    g.translate(0, -half);

    const ch = s * 0.16; // chamfer
    const outline = () => {
      g.beginPath();
      g.moveTo(-half + ch, -half);
      g.lineTo(half - ch, -half);
      g.lineTo(half, -half + ch);
      g.lineTo(half, half - ch);
      g.lineTo(half - ch, half);
      g.lineTo(-half + ch, half);
      g.lineTo(-half, half - ch);
      g.lineTo(-half, -half + ch);
      g.closePath();
    };
    // Undo the non-uniform scale for stroke widths.
    const lw = (n: number) => (n * d.px) / Math.sqrt(sx * sy);

    outline();
    const grad = g.createLinearGradient(-half, -half, half, half);
    grad.addColorStop(0, colors.metalLight);
    grad.addColorStop(1, colors.metal);
    g.fillStyle = grad;
    g.fill();

    // Inner face (the "top" of the bevel).
    const inset = s * 0.15;
    const ih = half - inset;
    const faceGrad = g.createLinearGradient(-ih, -ih, ih, ih);
    faceGrad.addColorStop(0, '#E4E6EA');
    faceGrad.addColorStop(1, '#C3C7CE');
    g.fillStyle = faceGrad;
    g.fillRect(-ih, -ih, 2 * ih, 2 * ih);
    if (d.tint) {
      g.fillStyle = alpha(d.tint, 0.42);
      g.fillRect(-ih, -ih, 2 * ih, 2 * ih);
    }

    // Brushed hatching on the lower-right of the face.
    g.save();
    g.beginPath();
    g.rect(-ih, -ih, 2 * ih, 2 * ih);
    g.clip();
    g.strokeStyle = alpha(colors.metalDark, 0.45);
    g.lineWidth = lw(1.2);
    g.beginPath();
    for (let k = -2 * ih; k < 2 * ih; k += s * 0.09) {
      g.moveTo(k, ih);
      g.lineTo(k + ih * 0.7, ih * 0.3);
    }
    g.stroke();
    g.restore();

    // Bevel edges.
    g.strokeStyle = alpha(colors.ink, 0.55);
    g.lineWidth = lw(1.4);
    g.strokeRect(-ih, -ih, 2 * ih, 2 * ih);
    g.beginPath();
    g.moveTo(-half + ch * 0.5, -half + ch * 0.5);
    g.lineTo(-ih, -ih);
    g.moveTo(half - ch * 0.5, -half + ch * 0.5);
    g.lineTo(ih, -ih);
    g.moveTo(half - ch * 0.5, half - ch * 0.5);
    g.lineTo(ih, ih);
    g.moveTo(-half + ch * 0.5, half - ch * 0.5);
    g.lineTo(-ih, ih);
    g.stroke();
    // Highlight on the top-left bevel.
    g.strokeStyle = alpha('#FFFFFF', 0.8);
    g.lineWidth = lw(2);
    g.beginPath();
    g.moveTo(-half + ch, -half + lw(2.5));
    g.lineTo(half - ch, -half + lw(2.5));
    g.stroke();

    outline();
    g.strokeStyle = d.glow ? colors.highlight : colors.ink;
    g.lineWidth = lw(d.glow ? 4 : 3);
    g.lineJoin = 'round';
    g.stroke();
    g.restore();
  }
}
