import { formatQuantity } from '../../core/units';
import { SHO_RANGES, type ShoParams } from '../../models/sho/model';
import { drawArrow, drawHandle } from '../../render/scene/Arrow';
import { BlockCharacter } from '../../render/scene/Block';
import { alpha, approach, clamp, drawPillLabel } from '../../render/scene/draw';
import { Particles } from '../../render/scene/Particles';
import { drawSpring, springStyleFromK } from '../../render/scene/Spring';
import { drawTrack } from '../../render/scene/Track';
import type { FrameInfo, Hit, MechanicalScene } from '../../render/scene/types';
import { drawWall } from '../../render/scene/Wall';
import { colors, fonts } from '../../render/theme';
import type { Vec2 } from '../../render/view';

/** Scene layout in meters. x is the block's displacement; the block center sits at u = x. */
export const WALL_U = -1.35;
const MIN_SPRING = 0.16;
const MAX_X = 1.5;
/** Arrow length per unit velocity (m per m/s). */
export const ARROW_SCALE = 0.22;
export const MAX_SPEED = 4;

/** Block side: area ∝ m, 0.34 m at m = 2 kg. */
export const blockSide = (m: number): number => 0.34 * Math.sqrt(m / 2);

type F = FrameInfo<Float64Array, ShoParams>;

export function createShoScene(): MechanicalScene<ShoParams> {
  const block = new BlockCharacter();
  const particles = new Particles();
  // Smoothed side so changing m animates the block size.
  let side = blockSide(2);

  const arrowGeom = (x: number, v: number, s: number) => {
    const dir = v < 0 ? -1 : 1;
    const start = x + dir * (s / 2);
    return { start, tip: start + v * ARROW_SCALE };
  };

  const scene: MechanicalScene<ShoParams> = {
    bounds: () => ({ uMin: WALL_U - 0.25, uMax: MAX_X + 0.25, wMin: -0.65, wMax: 0.65 }),

    clampX: (x, p) => clamp(x, WALL_U + MIN_SPRING + blockSide(p.m) / 2, MAX_X),

    velocityFromHandle: (u, x, p) => {
      const s = blockSide(p.m) / 2;
      const v =
        u >= x
          ? Math.max(0, (u - (x + s)) / ARROW_SCALE)
          : Math.min(0, (u - (x - s)) / ARROW_SCALE);
      return clamp(v, -MAX_SPEED, MAX_SPEED);
    },

    update(f: F) {
      const x = f.state[0]!;
      side = approach(side, blockSide(f.params.m), 12, f.realDt || 1);
      const rest = -side / 2 - WALL_U;
      const len = x - side / 2 - WALL_U;
      const strain = (len - rest) / rest;
      block.setStrainSign(Math.sign(strain));
      block.update({ v: f.obs.v ?? 0, a: f.obs.a ?? 0, strain, held: f.held, dt: f.realDt });
      particles.update(f.realDt);
    },

    draw(g, f: F) {
      const x = f.state[0]!;
      const v = f.state[1]!;
      const px = f.px;
      const ppx = f.ppx;
      const style = springStyleFromK(f.params.k, SHO_RANGES.k.min, SHO_RANGES.k.max);

      drawTrack(g, WALL_U, MAX_X + 0.4, side / 2 + 0.012, 0, ppx);
      drawWall(g, WALL_U, 0, 1.0, ppx, f.hoverId === 'wall');
      drawSpring(g, WALL_U, x - side / 2, 0, { ...style, glow: f.hoverId === 'spring' }, ppx);

      block.draw(g, {
        u: x,
        w: 0,
        side,
        px: ppx,
        serious: f.serious,
        glow: f.hoverId === 'block',
        viewAngle: f.view.angle,
        label: 'm',
      });

      // Velocity arrow: editable v₀ while paused, live v (dimmed) while running.
      const { start, tip } = arrowGeom(x, v, side);
      drawArrow(
        g,
        start,
        0,
        tip,
        0,
        { color: colors.warning, widthPx: 4, glow: f.hoverId === 'velocity', dimmed: f.running },
        px,
      );
      if (!f.running) drawHandle(g, tip, 0, 7, px, f.hoverId === 'velocity');

      particles.draw(g, px);
    },

    drawOverlay(g, f: F) {
      const x = f.state[0]!;
      const v = f.state[1]!;
      const view = f.view;
      const label = {
        color: colors.text,
        bg: alpha(colors.surface, 0.9),
        border: colors.border,
        font: `500 12px ${fonts.mono}`,
      };

      // x₀ under the rail, v₀ above the block at the arrow tip, "wii!" at the top-left corner.
      if (f.held && !f.running) {
        const p = view.toScreen(x, side / 2);
        drawPillLabel(g, p.x, p.y + 26, `x₀ = ${formatQuantity(x, 'm')}`, {
          ...label,
          border: colors.primary,
        });
      }
      if (!f.running) {
        const { tip } = arrowGeom(x, v, side);
        const p = view.toScreen(tip, -side / 2);
        drawPillLabel(g, p.x, p.y - 20, `v₀ = ${formatQuantity(v, 'm/s')}`, {
          ...label,
          color: colors.warning,
        });
      }
      if (f.held && !f.serious) {
        const p = view.toScreen(x - side / 2, -side / 2);
        g.font = `600 18px ${fonts.display}`;
        g.fillStyle = colors.magenta;
        g.textAlign = 'right';
        g.textBaseline = 'bottom';
        g.fillText(f.tr('scene.wii'), p.x - 2, p.y - 4);
      }

      // Clock.
      g.font = `500 13px ${fonts.mono}`;
      g.fillStyle = colors.textMuted;
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(`t = ${formatQuantity(f.t, 's')}`, 16, 14);
    },

    hit(pt: Vec2, f: F): Hit | null {
      const x = f.state[0]!;
      const v = f.state[1]!;
      const tol = 4 * f.px;
      if (!f.running) {
        const { tip } = arrowGeom(x, v, side);
        if (Math.hypot(pt.x - tip, pt.y) < 12 * f.px)
          return { objectId: 'velocity', role: 'velocityHandle' };
      }
      if (Math.abs(pt.x - x) <= side / 2 + tol && Math.abs(pt.y) <= side / 2 + tol) {
        return { objectId: 'block', role: 'body' };
      }
      const { start, tip } = arrowGeom(x, v, side);
      if (
        Math.abs(pt.y) < 6 * f.px &&
        pt.x >= Math.min(start, tip) &&
        pt.x <= Math.max(start, tip)
      ) {
        return { objectId: 'velocity', role: 'object' };
      }
      if (Math.abs(pt.y) < 0.09 && pt.x > WALL_U && pt.x < x - side / 2)
        return { objectId: 'spring', role: 'object' };
      if (pt.x <= WALL_U && pt.x >= WALL_U - 0.12 && Math.abs(pt.y) <= 0.5)
        return { objectId: 'wall', role: 'object' };
      return null;
    },

    onFling(v, f: F) {
      particles.burst(f.state[0]! - Math.sign(v) * side * 0.5, 0, v);
    },
  };
  return scene;
}
