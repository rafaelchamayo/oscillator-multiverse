import { formatNumber } from '../../core/units';
import { SHO_RANGES, type ShoParams } from '../../models/sho/model';
import { drawArrow, drawHandle } from '../../render/scene/Arrow';
import { MetalBlock, drawExclamation } from '../../render/scene/Block';
import { approach, clamp, drawCallout } from '../../render/scene/draw';
import { Particles } from '../../render/scene/Particles';
import { drawSpring, springStyleFromK } from '../../render/scene/Spring';
import { drawTrack } from '../../render/scene/Track';
import type { FrameInfo, Hit, MechanicalScene } from '../../render/scene/types';
import { drawWall } from '../../render/scene/Wall';
import { colors, fonts } from '../../render/theme';
import type { Vec2 } from '../../render/view';

/**
 * Scene layout in meters. x is the block's displacement; the block center sits at u = x and
 * rests on the floor at w = FLOOR_W, so its center height depends on its size.
 */
export const WALL_U = -1.35;
export const FLOOR_W = 0.3;
const WALL_HEIGHT = 0.78;
const MIN_SPRING = 0.16;
const MAX_X = 1.5;
/** Arrow length per unit velocity (m per m/s). */
export const ARROW_SCALE = 0.22;
export const MAX_SPEED = 4;

/** Block side: area ∝ m, 0.34 m at m = 2 kg. */
export const blockSide = (m: number): number => 0.34 * Math.sqrt(m / 2);
/** Height (w) of the block center, which is also the spring's axis. */
export const blockCenterW = (side: number): number => FLOOR_W - side / 2;

type F = FrameInfo<Float64Array, ShoParams>;

export function createShoScene(): MechanicalScene<ShoParams> {
  const block = new MetalBlock();
  const particles = new Particles();
  // Smoothed side so changing m animates the block size.
  let side = blockSide(2);

  const arrowGeom = (x: number, v: number, s: number) => {
    const dir = v < 0 ? -1 : 1;
    const start = x + dir * (s / 2);
    return { start, tip: start + v * ARROW_SCALE };
  };

  const scene: MechanicalScene<ShoParams> = {
    bounds: () => ({
      uMin: WALL_U - 0.25,
      uMax: MAX_X + 0.25,
      wMin: FLOOR_W - WALL_HEIGHT - 0.2,
      wMax: FLOOR_W + 0.25,
    }),

    bodyW: (p) => blockCenterW(blockSide(p.m)),

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
      side = approach(side, blockSide(f.params.m), 12, f.realDt || 1);
      // Deform only with real motion: a paused block with a v₀ set is still at rest.
      const moving = f.running;
      block.update({
        v: moving ? (f.obs.v ?? 0) : 0,
        a: moving ? (f.obs.a ?? 0) : 0,
        dt: f.realDt,
      });
      particles.update(f.realDt);
    },

    draw(g, f: F) {
      const x = f.state[0]!;
      const v = f.state[1]!;
      const px = f.px;
      const ppx = f.ppx;
      const cw = blockCenterW(side);
      const style = springStyleFromK(f.params.k, SHO_RANGES.k.min, SHO_RANGES.k.max);

      drawTrack(g, WALL_U - 0.2, MAX_X + 0.45, FLOOR_W, 0, ppx);
      drawWall(g, WALL_U, FLOOR_W, WALL_HEIGHT, ppx, f.hoverId === 'wall');
      // Attach to the drawn (squashed) face so the spring never cuts into the block.
      const face = x - (side / 2) * block.scaleX(f.serious);
      drawSpring(g, WALL_U, face, cw, { ...style, glow: f.hoverId === 'spring' }, ppx);

      block.draw(g, {
        u: x,
        w: cw,
        side,
        px: ppx,
        serious: f.serious,
        glow: f.hoverId === 'block',
      });

      // Position mark on the floor under the block's center.
      g.strokeStyle = colors.primary;
      g.lineWidth = 3 * ppx;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, FLOOR_W - 0.015);
      g.lineTo(x, FLOOR_W + 0.04);
      g.stroke();

      // Velocity arrow: editable v₀ while paused, live v (dimmed) while running.
      const { start, tip } = arrowGeom(x, v, side);
      drawArrow(
        g,
        start,
        cw,
        tip,
        cw,
        { color: colors.primary, widthPx: 4, glow: f.hoverId === 'velocity', dimmed: f.running },
        px,
      );
      if (!f.running) drawHandle(g, tip, cw, 8, px, f.hoverId === 'velocity');

      if (!f.serious) particles.draw(g, px);
    },

    drawOverlay(g, f: F) {
      const x = f.state[0]!;
      const v = f.state[1]!;
      const view = f.view;
      const cw = blockCenterW(side);
      const callout = {
        bg: colors.ink,
        font: `500 13px ${fonts.mono}`,
        leader: colors.ink,
      };

      // v₀ tag pinned to the block's top; x₀ tag pinned to the floor mark.
      if (!f.running) {
        const top = view.toScreen(x, cw - side / 2);
        drawCallout(
          g,
          top.x,
          top.y - 34,
          [
            { text: 'v₀ = ', color: colors.textOnDark },
            { text: `${formatNumber(v)} m/s`, color: colors.accent },
          ],
          { ...callout, anchor: top },
        );
      }
      if (f.held && !f.running) {
        const mark = view.toScreen(x, FLOOR_W + 0.04);
        drawCallout(
          g,
          mark.x,
          mark.y + 30,
          [
            { text: 'x₀ = ', color: colors.textOnDark },
            { text: `${formatNumber(x)} m`, color: colors.accent },
          ],
          { ...callout, anchor: mark },
        );
      }
      if (f.held && !f.serious) {
        const p = view.toScreen(x - side / 2, cw - side / 2);
        drawExclamation(g, p.x - 4, p.y - 4, f.tr('scene.wii'));
      }

      // Clock.
      g.font = `500 15px ${fonts.mono}`;
      g.fillStyle = colors.text;
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(`t = ${formatNumber(f.t)} s`, 22, 20);
    },

    hit(pt: Vec2, f: F): Hit | null {
      const x = f.state[0]!;
      const v = f.state[1]!;
      const cw = blockCenterW(side);
      const dw = pt.y - cw;
      const tol = 4 * f.px;
      const { start, tip } = arrowGeom(x, v, side);
      if (!f.running && Math.hypot(pt.x - tip, dw) < 13 * f.px) {
        return { objectId: 'velocity', role: 'velocityHandle' };
      }
      if (Math.abs(pt.x - x) <= side / 2 + tol && Math.abs(dw) <= side / 2 + tol) {
        return { objectId: 'block', role: 'body' };
      }
      if (Math.abs(dw) < 6 * f.px && pt.x >= Math.min(start, tip) && pt.x <= Math.max(start, tip)) {
        return { objectId: 'velocity', role: 'object' };
      }
      if (Math.abs(dw) < 0.09 && pt.x > WALL_U && pt.x < x - side / 2) {
        return { objectId: 'spring', role: 'object' };
      }
      if (
        pt.x <= WALL_U &&
        pt.x >= WALL_U - 0.17 &&
        pt.y >= FLOOR_W - WALL_HEIGHT &&
        pt.y <= FLOOR_W
      ) {
        return { objectId: 'wall', role: 'object' };
      }
      return null;
    },

    onFling(v, f: F) {
      if (f.serious) return;
      particles.burst(f.state[0]! - Math.sign(v) * side * 0.5, blockCenterW(side), v);
    },
  };
  return scene;
}
