import { colors, fonts } from '../theme';
import { alpha, approach, clamp, roundRectPath } from './draw';

/** Inputs that drive the block's mood each frame. */
export interface BlockMoodInput {
  /** Velocity along the axis (m/s) — eyes look this way. */
  v: number;
  /** Acceleration along the axis (m/s²) — squash at turning points. */
  a: number;
  /** Spring deformation: −1 fully compressed … +1 strongly stretched. */
  strain: number;
  held: boolean;
  dt: number;
}

export interface BlockDrawInput {
  u: number;
  w: number;
  side: number;
  px: number;
  serious: boolean;
  glow: boolean;
  /** View rotation, so the face can stay upright. */
  viewAngle: number;
  label: string;
}

/**
 * The block as a character. All of this is cosmetic: squash & stretch preserves the
 * area and is centered on the physical position, and hit-testing uses the undeformed box.
 */
export class BlockCharacter {
  private look = 0;
  private squash = 0;
  private fear = 0;
  private dizzy = 0;
  private grab = 0;
  private blinkClock = 0;
  private nextBlink = 3;
  private wobble = 0;

  update(m: BlockMoodInput): void {
    const dt = m.dt;
    this.look = approach(this.look, clamp(m.v / 1.2, -1, 1), 10, dt);
    // Stretch along the motion when fast, squash when acceleration peaks (turning points).
    const target = 0.09 * Math.tanh(Math.abs(m.v) / 2) - 0.09 * Math.tanh(Math.abs(m.a) / 25);
    this.squash = approach(this.squash, target, 14, dt);
    const fearTarget = clamp((Math.abs(m.strain) - 0.55) / 0.3, 0, 1);
    this.fear = approach(this.fear, fearTarget, 8, dt);
    const dizzyTarget = Math.abs(m.v) > 3 ? 1 : 0;
    // Gets dizzy fast, recovers slowly.
    this.dizzy = approach(this.dizzy, dizzyTarget, dizzyTarget > this.dizzy ? 6 : 1.2, dt);
    this.grab = approach(this.grab, m.held ? 1 : 0, 12, dt);
    this.wobble += dt;
    this.blinkClock += dt;
    if (this.blinkClock > this.nextBlink + 0.15) {
      this.blinkClock = 0;
      // Deterministic pseudo-random spacing between blinks.
      this.nextBlink = 2.5 + ((this.nextBlink * 7.31) % 2.5);
    }
  }

  /** Compressed-vs-stretched sign of the current fear (for the face). */
  private strainSign = 0;
  setStrainSign(s: number): void {
    this.strainSign = s;
  }

  draw(g: CanvasRenderingContext2D, d: BlockDrawInput): void {
    const sx = d.serious ? 1 : 1 + this.squash;
    const sy = 1 / sx;
    const half = d.side / 2;
    const r = d.side * 0.22;

    g.save();
    g.translate(d.u, d.w);

    if (d.glow) {
      g.save();
      g.shadowColor = colors.magenta;
      g.shadowBlur = 30;
      roundRectPath(g, -half * sx, -half * sy, d.side * sx, d.side * sy, r);
      g.fillStyle = alpha(colors.magenta, 0.4);
      g.fill();
      g.restore();
    }

    // Body.
    roundRectPath(g, -half * sx, -half * sy, d.side * sx, d.side * sy, r);
    const grad = g.createLinearGradient(0, -half, 0, half);
    grad.addColorStop(0, '#8E7BFF');
    grad.addColorStop(1, '#4C5BEF');
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 2.5 * d.px;
    g.strokeStyle = d.glow ? colors.magenta : alpha(colors.lilac, 0.9);
    g.stroke();

    // Top highlight.
    g.save();
    roundRectPath(g, -half * sx, -half * sy, d.side * sx, d.side * sy, r);
    g.clip();
    g.fillStyle = alpha('#FFFFFF', 0.12);
    g.beginPath();
    g.ellipse(-half * 0.25, -half * 0.95, half * 1.1, half * 0.45, -0.2, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // Face (or a plain label in serious mode), kept upright when the view rotates.
    g.rotate(-d.viewAngle);
    g.scale(d.side, d.side);
    if (d.serious) this.drawLabel(g, d);
    else this.drawFace(g, d.px / d.side);
    g.restore();
  }

  private drawLabel(g: CanvasRenderingContext2D, d: BlockDrawInput): void {
    g.fillStyle = colors.text;
    g.font = `600 0.32px ${fonts.mono}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(d.label, 0, 0.02);
  }

  /** Face in units of the block side (−0.5…0.5). `p` is one pixel in those units. */
  private drawFace(g: CanvasRenderingContext2D, p: number): void {
    const look = this.look * 0.045;
    const eyeY = -0.08;
    const eyeDX = 0.19;
    const lw = Math.max(2.2 * p, 0.03);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Cheeks.
    g.fillStyle = alpha(colors.magenta, 0.35 + 0.2 * this.grab);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 0.3 + look * 0.5, 0.1, 0.075, 0.045, 0, 0, Math.PI * 2);
      g.fill();
    }

    const blinking = this.blinkClock > this.nextBlink;
    g.strokeStyle = '#1B1440';
    g.fillStyle = '#1B1440';
    g.lineWidth = lw;

    if (this.grab > 0.5) {
      // Happy closed eyes ^ ^.
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * eyeDX - 0.07, eyeY + 0.03);
        g.lineTo(s * eyeDX, eyeY - 0.04);
        g.lineTo(s * eyeDX + 0.07, eyeY + 0.03);
        g.stroke();
      }
    } else if (this.dizzy > 0.5) {
      // Spiral eyes.
      for (const s of [-1, 1]) {
        g.beginPath();
        for (let i = 0; i <= 40; i++) {
          const th = (i / 40) * Math.PI * 4 + this.wobble * 8 * s;
          const rr = 0.008 + (i / 40) * 0.075;
          const x = s * eyeDX + Math.cos(th) * rr;
          const y = eyeY + Math.sin(th) * rr;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    } else if (this.fear > 0.5 && this.strainSign < 0) {
      // Squeezed: > <
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * eyeDX - s * 0.06, eyeY - 0.05);
        g.lineTo(s * eyeDX + s * 0.05, eyeY);
        g.lineTo(s * eyeDX - s * 0.06, eyeY + 0.05);
        g.stroke();
      }
    } else if (blinking) {
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * eyeDX - 0.07, eyeY);
        g.lineTo(s * eyeDX + 0.07, eyeY);
        g.stroke();
      }
    } else {
      // Open eyes; wider when scared.
      const er = 0.1 + 0.035 * this.fear;
      for (const s of [-1, 1]) {
        g.fillStyle = '#FFFFFF';
        g.beginPath();
        g.ellipse(s * eyeDX, eyeY, er * 0.9, er, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1B1440';
        g.beginPath();
        const pr = 0.05 - 0.015 * this.fear;
        g.arc(s * eyeDX + look, eyeY + 0.01, pr, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#FFFFFF';
        g.beginPath();
        g.arc(s * eyeDX + look - pr * 0.4, eyeY - pr * 0.4, pr * 0.35, 0, Math.PI * 2);
        g.fill();
      }
      if (this.fear > 0.3) {
        // Worried eyebrows.
        g.strokeStyle = '#1B1440';
        for (const s of [-1, 1]) {
          g.beginPath();
          // Inner ends raised: worried, not angry.
          g.moveTo(s * eyeDX - s * 0.08, eyeY - 0.2);
          g.lineTo(s * eyeDX + s * 0.06, eyeY - 0.155);
          g.stroke();
        }
      }
    }

    // Mouth.
    g.strokeStyle = '#1B1440';
    g.fillStyle = '#1B1440';
    const my = 0.17;
    if (this.grab > 0.5) {
      g.beginPath();
      g.arc(0, my - 0.02, 0.09, 0.1, Math.PI - 0.1);
      g.closePath();
      g.fill();
      g.fillStyle = colors.magenta;
      g.beginPath();
      g.ellipse(0, my + 0.045, 0.04, 0.022, 0, 0, Math.PI * 2);
      g.fill();
    } else if (this.dizzy > 0.5) {
      g.beginPath();
      for (let i = 0; i <= 20; i++) {
        const x = -0.1 + (i / 20) * 0.2;
        const y = my + Math.sin(i * 1.2 + this.wobble * 10) * 0.018;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    } else if (this.fear > 0.5) {
      if (this.strainSign < 0) {
        // Gritted teeth.
        roundRectPath(g, -0.1, my - 0.035, 0.2, 0.07, 0.025);
        g.fillStyle = '#FFFFFF';
        g.fill();
        g.stroke();
        g.beginPath();
        g.moveTo(-0.1, my);
        g.lineTo(0.1, my);
        g.stroke();
      } else {
        g.beginPath();
        g.ellipse(0, my, 0.045, 0.06, 0, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      g.beginPath();
      g.arc(0, my - 0.06, 0.08, 0.35, Math.PI - 0.35);
      g.stroke();
    }
  }
}
