import { colors } from '../theme';
import { alpha } from './draw';

interface Particle {
  u: number;
  w: number;
  vu: number;
  vw: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

const PALETTE = [colors.accent, colors.magenta, colors.lilac, colors.warning];

/**
 * Tiny sparkle bursts (purely decorative). Uses its own seeded generator so a
 * recording stays reproducible.
 */
export class Particles {
  private items: Particle[] = [];
  private seed = 12345;

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  burst(u: number, w: number, dirU: number, count = 16): void {
    for (let i = 0; i < count; i++) {
      const ang = (this.rand() - 0.5) * Math.PI * 1.2 + (dirU >= 0 ? Math.PI : 0);
      const speed = 0.4 + this.rand() * 1.1;
      this.items.push({
        u,
        w,
        vu: Math.cos(ang) * speed,
        vw: Math.sin(ang) * speed,
        life: 0,
        maxLife: 0.45 + this.rand() * 0.4,
        size: 2 + this.rand() * 3,
        color: PALETTE[i % PALETTE.length]!,
      });
    }
  }

  update(dt: number): void {
    for (const p of this.items) {
      p.life += dt;
      p.u += p.vu * dt;
      p.w += p.vw * dt;
      p.vu *= Math.exp(-3 * dt);
      p.vw *= Math.exp(-3 * dt);
    }
    this.items = this.items.filter((p) => p.life < p.maxLife);
  }

  draw(g: CanvasRenderingContext2D, px: number): void {
    for (const p of this.items) {
      const k = 1 - p.life / p.maxLife;
      g.fillStyle = alpha(p.color, k);
      const s = p.size * px * (0.5 + k * 0.5);
      g.beginPath();
      // Four-point star.
      g.moveTo(p.u, p.w - 2 * s);
      g.lineTo(p.u + s * 0.5, p.w - s * 0.5);
      g.lineTo(p.u + 2 * s, p.w);
      g.lineTo(p.u + s * 0.5, p.w + s * 0.5);
      g.lineTo(p.u, p.w + 2 * s);
      g.lineTo(p.u - s * 0.5, p.w + s * 0.5);
      g.lineTo(p.u - 2 * s, p.w);
      g.lineTo(p.u - s * 0.5, p.w - s * 0.5);
      g.closePath();
      g.fill();
    }
  }
}
