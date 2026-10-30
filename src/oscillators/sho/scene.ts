import { formatNumber } from '../../core/units';
import { SHO_RANGES, shoEquilibrium, type ShoParams } from '../../models/sho/model';
import { nearestIndex } from '../../render/plots/draw';
import {
  drawPaper,
  drawPen,
  PAPER_LENGTH,
  paperPoint,
  paperSpeed,
  paperTime,
  timeStep,
} from '../../render/plots/PaperTrace';
import { drawArrow, drawHandle } from '../../render/scene/Arrow';
import { MetalBlock, drawExclamation } from '../../render/scene/Block';
import { alpha, approach, clamp, drawCallout, roundRectPath } from '../../render/scene/draw';
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
/** The pen touches the paper this far below the floor. */
export const PAPER_W = FLOOR_W + 0.08;
/** Arrow length per unit velocity (m per m/s). */
export const ARROW_SCALE = 0.22;
export const MAX_SPEED = 4;

/** Block side: area ∝ m, 0.34 m at m = 2 kg. */
export const blockSide = (m: number): number => 0.34 * Math.sqrt(m / 2);
/** Height (w) of the block center, which is also the spring's axis. */
export const blockCenterW = (side: number): number => FLOOR_W - side / 2;

/**
 * The whole fixed scenery (wall, floor, paper) is drawn shifted by the equilibrium x_eq = −mg/k,
 * so with gravity the spring at rest looks just like the horizontal one. x keeps its physical
 * meaning (displacement from the spring's natural length) and the trace stays under the body.
 */
const offsetOf = (p: ShoParams): number => shoEquilibrium(p);

type F = FrameInfo<Float64Array, ShoParams>;

export function createShoScene(): MechanicalScene<ShoParams> {
  const block = new MetalBlock();
  const particles = new Particles();
  // Smoothed side so changing m animates the block size.
  let side = blockSide(2);
  /** Scale of the energy bar (J at full height); grows fast, shrinks slowly. */
  let eScale = 0;
  /** Trace sample under the pointer on the paper. */
  let paperHover: { t: number; x: number; manual: boolean } | null = null;

  const paperU = (o: number) => ({ from: o + WALL_U, to: o + MAX_X + 0.3 });

  const arrowGeom = (x: number, v: number, s: number) => {
    const dir = v < 0 ? -1 : 1;
    const start = x + dir * (s / 2);
    return { start, tip: start + v * ARROW_SCALE };
  };

  /** Unit screen vector of a scene direction (labels sit beside things in either perspective). */
  const screenDir = (f: F, du: number, dw: number) => {
    const a = f.view.toScreen(0, 0);
    const b = f.view.toScreen(du, dw);
    const n = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / n, y: (b.y - a.y) / n };
  };

  const label = (
    g: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
  ) => {
    g.lineWidth = 4;
    g.strokeStyle = colors.surface;
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
  };

  /** Time labels on the paper's time lines, position labels along its far edge. */
  const drawPaperLabels = (g: CanvasRenderingContext2D, f: F) => {
    const o = offsetOf(f.params);
    const { from, to } = paperU(o);
    const speed = paperSpeed(f.window);
    const wEnd = PAPER_W + PAPER_LENGTH;
    g.font = `500 11px ${fonts.mono}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const inward = screenDir(f, 1, 0);
    const step = timeStep(f.window);
    for (let tk = Math.ceil((f.t - f.window) / step) * step; tk <= f.t; tk += step) {
      if (tk < 0) continue;
      const w = paperPoint(0, tk, f.t, PAPER_W, speed).w;
      if (w > wEnd - 0.04 || w < PAPER_W + 0.04) continue;
      const p = f.view.toScreen(from, w);
      label(g, `${tk} s`, p.x + inward.x * 20, p.y + inward.y * 20, colors.textMuted);
    }
    const up = screenDir(f, 0, -1);
    for (let u = Math.ceil(from / 0.5) * 0.5; u <= to; u += 0.5) {
      const p = f.view.toScreen(u, wEnd);
      label(g, formatNumber(u, 1), p.x + up.x * 12, p.y + up.y * 12, colors.textMuted);
    }
    const end = f.view.toScreen(to, wEnd);
    label(g, 'x (m)', end.x + up.x * 30, end.y + up.y * 30, colors.textMuted);

    if (f.params.g > 0) {
      const p = f.view.toScreen(o, PAPER_W + 0.18);
      g.font = `600 12px ${fonts.ui}`;
      g.textAlign = 'left';
      label(g, f.tr('scene.equilibrium'), p.x + 8, p.y, colors.textMuted);
    }
  };

  /** Stacked K + U bar beside the block; its total height is E, so it stays still. */
  const drawEnergyBar = (g: CanvasRenderingContext2D, f: F, x: number, cw: number) => {
    const K = f.obs.K ?? 0;
    const U = f.obs.Ueq ?? 0;
    if (eScale <= 0) return;
    const corner = f.view.toScreen(x - side / 2, cw - side / 2);
    const H = 84;
    const W = 14;
    const left = corner.x - 58;
    const bottom = Math.max(corner.y, H + 24);
    const hk = (K / eScale) * H;
    const hu = (U / eScale) * H;
    roundRectPath(g, left, bottom - H, W, H, 4);
    g.fillStyle = alpha(colors.ink, 0.06);
    g.fill();
    g.fillStyle = colors.primary;
    g.fillRect(left, bottom - hk, W, hk);
    g.fillStyle = colors.warning;
    g.fillRect(left, bottom - hk - hu, W, hu);
    g.fillStyle = colors.ink;
    g.fillRect(left - 3, bottom - hk - hu - 1, W + 6, 2);
    roundRectPath(g, left, bottom - H, W, H, 4);
    g.strokeStyle = colors.ink;
    g.lineWidth = 2;
    g.stroke();
    g.font = `600 11px ${fonts.mono}`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    if (hk > 12) label(g, 'K', left - 5, bottom - hk / 2, colors.primary);
    if (hu > 12) label(g, 'U', left - 5, bottom - hk - hu / 2, colors.warning);
    g.textAlign = 'center';
    label(g, 'E', left + W / 2, bottom - H - 10, colors.ink);
  };

  const scene: MechanicalScene<ShoParams> = {
    bounds: (f) => {
      const o = offsetOf(f.params);
      return {
        uMin: o + WALL_U - 0.25,
        uMax: o + MAX_X + 0.35,
        wMin: FLOOR_W - WALL_HEIGHT - 0.2,
        wMax: PAPER_W + PAPER_LENGTH + 0.1,
      };
    },

    bodyW: (p) => blockCenterW(blockSide(p.m)),

    clampX: (x, p) => {
      const o = offsetOf(p);
      return clamp(x, o + WALL_U + MIN_SPRING + blockSide(p.m) / 2, o + MAX_X);
    },

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

      const E = f.obs.Eeq ?? 0;
      if (E * 1.1 > eScale) eScale = E * 1.25;
      else eScale = approach(eScale, Math.max(E * 1.25, 1e-3), 0.8, f.realDt);

      paperHover = null;
      const pt = f.pointer;
      const h = f.history;
      const { from, to } = paperU(offsetOf(f.params));
      if (pt && f.chips.x && h.length > 1 && pt.x >= from && pt.x <= to) {
        const ti = paperTime(pt.y, f.t, PAPER_W, paperSpeed(f.window));
        if (pt.y >= PAPER_W && ti >= Math.max(0, f.t - f.window) && ti <= f.t) {
          const i = nearestIndex(h, ti);
          const xi = h.get('x').get(i);
          // Only when the pointer is near the trace itself.
          if (Math.abs(xi - pt.x) < 14 * f.px) {
            paperHover = { t: h.t.get(i), x: xi, manual: h.manual.get(i) > 0 };
          }
        }
      }
    },

    draw(g, f: F) {
      const x = f.state[0]!;
      const v = f.state[1]!;
      const px = f.px;
      const ppx = f.ppx;
      const cw = blockCenterW(side);
      const style = springStyleFromK(f.params.k, SHO_RANGES.k.min, SHO_RANGES.k.max);
      const o = offsetOf(f.params);
      const wallU = o + WALL_U;
      const paper = paperU(o);

      drawPaper(g, {
        uMin: paper.from,
        uMax: paper.to,
        wTop: PAPER_W,
        window: f.window,
        t: f.t,
        history: f.history,
        xKey: 'x',
        ppx,
        showTrace: f.chips.x ?? true,
      });
      // Equilibrium line along the paper: the trace oscillates around it.
      g.strokeStyle = alpha(colors.textMuted, 0.55);
      g.lineWidth = 1.5 * ppx;
      g.setLineDash([6 * ppx, 6 * ppx]);
      g.beginPath();
      g.moveTo(o, PAPER_W);
      g.lineTo(o, PAPER_W + PAPER_LENGTH);
      g.stroke();
      g.setLineDash([]);

      drawTrack(g, wallU - 0.2, o + MAX_X + 0.45, FLOOR_W, o, ppx);
      drawWall(g, wallU, FLOOR_W, WALL_HEIGHT, ppx, f.hoverId === 'wall');
      // Attach to the drawn (squashed) face so the spring never cuts into the block; never let
      // it turn inside out if the body goes through the wall.
      const face = Math.max(x - (side / 2) * block.scaleX(f.serious), wallU + 0.05);
      drawSpring(g, wallU, face, cw, { ...style, glow: f.hoverId === 'spring' }, ppx);

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
      drawPen(g, x, PAPER_W, ppx);

      if (paperHover) {
        const p = paperPoint(paperHover.x, paperHover.t, f.t, PAPER_W, paperSpeed(f.window));
        g.beginPath();
        g.arc(p.u, p.w, 6 * f.px, 0, Math.PI * 2);
        g.fillStyle = colors.surface;
        g.fill();
        g.lineWidth = 3 * f.px;
        g.strokeStyle = paperHover.manual ? colors.highlight : colors.primary;
        g.stroke();
      }

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

      drawPaperLabels(g, f);
      if (f.chips.energy) drawEnergyBar(g, f, x, cw);
      if (paperHover) {
        const p = paperPoint(paperHover.x, paperHover.t, f.t, PAPER_W, paperSpeed(f.window));
        const sp = view.toScreen(p.u, p.w);
        drawCallout(
          g,
          sp.x,
          sp.y - 30,
          [
            { text: `t = ${formatNumber(paperHover.t)} s   `, color: colors.textOnDark },
            { text: `x = ${formatNumber(paperHover.x)} m`, color: colors.accent },
          ],
          { ...callout, anchor: { x: sp.x, y: sp.y - 6 } },
        );
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
      const wallU = offsetOf(f.params) + WALL_U;
      if (Math.abs(dw) < 0.09 && pt.x > wallU && pt.x < x - side / 2) {
        return { objectId: 'spring', role: 'object' };
      }
      if (
        pt.x <= wallU &&
        pt.x >= wallU - 0.17 &&
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
