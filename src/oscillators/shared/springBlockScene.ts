import { formatNumber } from '../../core/units';
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
import type { SceneBounds, Vec2 } from '../../render/view';

/**
 * A block on a floor tied to a wall by a spring, with the paper trace underneath: the scene of
 * every 1-DOF mechanical tab. Layout in meters: x is the block's displacement; the block center
 * sits at u = x and rests on the floor at w = FLOOR_W, so its center height depends on its size.
 * Tabs add their own parts (dashpot, motor...) and force vectors through `SpringBlockConfig`.
 */
export const WALL_U = -1.35;
export const FLOOR_W = 0.3;
const MIN_SPRING = 0.16;
/** The pen touches the paper this far below the floor. */
export const PAPER_W = FLOOR_W + 0.08;
/** Arrow length per unit velocity (m per m/s). */
export const ARROW_SCALE = 0.22;
export const MAX_SPEED = 4;
/** Longest force vector (m) for the largest recent force. */
const FORCE_LENGTH = 0.45;

/** Height (w) of the block center, which is also the spring's axis. */
export const blockCenterW = (side: number): number => FLOOR_W - side / 2;

export interface SpringBlockParams {
  m: number;
  k: number;
  g: number;
}

type F<P> = FrameInfo<Float64Array, P>;

/** Geometry of the current frame, shared with the parts. */
export interface SceneGeo {
  x: number;
  v: number;
  /** Drawn block side (smoothed when m changes). */
  side: number;
  /** w of the block center and spring axis. */
  cw: number;
  /** Scenery offset: the equilibrium x_eq (see DECISIONS.md, Phase 3). */
  o: number;
  /** u of the wall face. */
  wallU: number;
}

/** Extra scene object (dashpot, motor...). Hit ids must match the plugin's object ids. */
export interface ScenePart<P> {
  update?(f: F<P>, geo: SceneGeo): void;
  /** Drawn after the wall, before the spring and the block. */
  drawBack?(g: CanvasRenderingContext2D, f: F<P>, geo: SceneGeo): void;
  /** Drawn after the block. */
  drawFront?(g: CanvasRenderingContext2D, f: F<P>, geo: SceneGeo): void;
  drawOverlay?(g: CanvasRenderingContext2D, f: F<P>, geo: SceneGeo): void;
  /** Checked after the block and the velocity arrow, before the spring and the wall. */
  hit?(pt: Vec2, f: F<P>, geo: SceneGeo): Hit | null;
  box?(id: string, f: F<P>, geo: SceneGeo): SceneBounds | null;
}

/** A force vector drawn on the block, read from an observable and toggled by a chip. */
export interface ForceVector {
  obsKey: string;
  chip: string;
  color: string;
  label: string;
}

export interface SpringBlockConfig<P extends SpringBlockParams> {
  kRange: { min: number; max: number };
  /** Block side (m) for a mass: area ∝ m. */
  blockSide(m: number): number;
  wallHeight: number;
  maxX: number;
  /** u of the wall face at x_eq = 0 (default WALL_U). */
  wallU?: number;
  /** Equilibrium x for these params (the scenery is drawn shifted by it). */
  equilibrium(p: P): number;
  /** Where the spring's fixed end is, relative to the wall face (a moving crank slider). */
  springStart?(f: F<P>, geo: SceneGeo): number;
  /** Farthest the spring start can reach from the wall face (for clamping x). */
  springStartMax?(p: P): number;
  parts?: ScenePart<P>[];
  forces?: ForceVector[];
  /** Observable drawn dashed on the paper when its chip is on (e.g. the steady state). */
  paperOverlay?: { key: string; chip: string };
}

export function createSpringBlockScene<P extends SpringBlockParams>(
  cfg: SpringBlockConfig<P>,
): MechanicalScene<P> {
  const block = new MetalBlock();
  const particles = new Particles();
  const parts = cfg.parts ?? [];
  const WALL_HEIGHT = cfg.wallHeight;
  const MAX_X = cfg.maxX;
  const WALL = cfg.wallU ?? WALL_U;
  // Smoothed side so changing m animates the block size.
  let side = cfg.blockSide(1);
  let firstUpdate = true;
  /** Scale of the energy bar (J at full height); grows fast, shrinks slowly. */
  let eScale = 0;
  /** Largest recent force (N), for the common force-vector scale. */
  let fScale = 0;
  /** Trace sample under the pointer on the paper. */
  let paperHover: { t: number; x: number; manual: boolean } | null = null;

  const paperU = (o: number) => ({ from: o + WALL, to: o + MAX_X + 0.3 });

  const geoOf = (f: F<P>): SceneGeo => {
    const o = cfg.equilibrium(f.params);
    return {
      x: f.state[0]!,
      v: f.state[1]!,
      side,
      cw: blockCenterW(side),
      o,
      wallU: o + WALL,
    };
  };

  const arrowGeom = (x: number, v: number, s: number) => {
    const dir = v < 0 ? -1 : 1;
    const start = x + dir * (s / 2);
    return { start, tip: start + v * ARROW_SCALE };
  };

  /** Unit screen vector of a scene direction (labels sit beside things in either perspective). */
  const screenDir = (f: F<P>, du: number, dw: number) => {
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

  /** Rows (w) of the active force vectors across the block's height. */
  const forceRows = (f: F<P>, geo: SceneGeo) => {
    const active = (cfg.forces ?? []).filter((fv) => f.chips[fv.chip] && f.obs[fv.obsKey]);
    const n = active.length;
    return active.map((fv, i) => ({
      fv,
      w: geo.cw + (n === 1 ? 0 : (i / (n - 1) - 0.5) * side * 0.85),
      F: f.obs[fv.obsKey] ?? 0,
    }));
  };

  /** Time labels on the paper's time lines, position labels along its far edge. */
  const drawPaperLabels = (g: CanvasRenderingContext2D, f: F<P>, o: number) => {
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
  const drawEnergyBar = (g: CanvasRenderingContext2D, f: F<P>, x: number, cw: number) => {
    const K = f.obs.K ?? 0;
    const U = f.obs.Ueq ?? 0;
    if (eScale <= 0) return;
    const corner = f.view.toScreen(x - side / 2, cw - side / 2);
    const H = 84;
    const W = 14;
    const left = corner.x - 58;
    const bottom = Math.max(corner.y, H + 24);
    const hk = Math.min(H, (K / eScale) * H);
    const hu = Math.min(H - hk, (U / eScale) * H);
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

  const scene: MechanicalScene<P> = {
    bounds: (f) => {
      const o = cfg.equilibrium(f.params);
      return {
        uMin: o + WALL - 0.25,
        uMax: o + MAX_X + 0.35,
        wMin: FLOOR_W - WALL_HEIGHT - 0.2,
        wMax: PAPER_W + PAPER_LENGTH + 0.1,
      };
    },

    bodyW: (p) => blockCenterW(cfg.blockSide(p.m)),

    clampX: (x, p) => {
      const o = cfg.equilibrium(p);
      const start = cfg.springStartMax?.(p) ?? 0;
      return clamp(x, o + WALL + start + MIN_SPRING + cfg.blockSide(p.m) / 2, o + MAX_X);
    },

    velocityFromHandle: (u, x, p) => {
      const s = cfg.blockSide(p.m) / 2;
      const v =
        u >= x
          ? Math.max(0, (u - (x + s)) / ARROW_SCALE)
          : Math.min(0, (u - (x - s)) / ARROW_SCALE);
      return clamp(v, -MAX_SPEED, MAX_SPEED);
    },

    update(f) {
      const target = cfg.blockSide(f.params.m);
      side = firstUpdate ? target : approach(side, target, 12, f.realDt || 1);
      firstUpdate = false;
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

      let maxF = 0;
      for (const fv of cfg.forces ?? []) {
        if (f.chips[fv.chip]) maxF = Math.max(maxF, Math.abs(f.obs[fv.obsKey] ?? 0));
      }
      if (maxF > fScale) fScale = maxF;
      else fScale = approach(fScale, Math.max(maxF, 1e-3), 0.5, f.realDt);

      const geo = geoOf(f);
      for (const p of parts) p.update?.(f, geo);

      paperHover = null;
      const pt = f.pointer;
      const h = f.history;
      const { from, to } = paperU(geo.o);
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

    draw(g, f) {
      const geo = geoOf(f);
      const { x, v, cw, o, wallU } = geo;
      const px = f.px;
      const ppx = f.ppx;
      const style = springStyleFromK(f.params.k, cfg.kRange.min, cfg.kRange.max);
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
        overlayKey:
          cfg.paperOverlay && f.chips[cfg.paperOverlay.chip] ? cfg.paperOverlay.key : undefined,
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
      for (const p of parts) p.drawBack?.(g, f, geo);

      // Attach to the drawn (squashed) face so the spring never cuts into the block; never let
      // it turn inside out if the body goes through the wall.
      const start = wallU + (cfg.springStart?.(f, geo) ?? 0);
      const face = Math.max(x - (side / 2) * block.scaleX(f.serious), start + 0.05);
      drawSpring(g, start, face, cw, { ...style, glow: f.hoverId === 'spring' }, ppx);

      block.draw(g, {
        u: x,
        w: cw,
        side,
        px: ppx,
        serious: f.serious,
        glow: f.hoverId === 'block',
      });
      for (const p of parts) p.drawFront?.(g, f, geo);

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

      // Force vectors from the block's center line, one row each, common scale.
      if (fScale > 0) {
        for (const r of forceRows(f, geo)) {
          const len = (r.F / fScale) * FORCE_LENGTH;
          if (Math.abs(len) < 2 * px) continue;
          drawArrow(g, x, r.w, x + len, r.w, { color: r.fv.color, widthPx: 3.5, glow: false }, px);
        }
      }

      // Velocity arrow: editable v₀ while paused, live v (dimmed) while running.
      const { start: aStart, tip } = arrowGeom(x, v, side);
      drawArrow(
        g,
        aStart,
        cw,
        tip,
        cw,
        { color: colors.primary, widthPx: 4, glow: f.hoverId === 'velocity', dimmed: f.running },
        px,
      );
      if (!f.running) drawHandle(g, tip, cw, 8, px, f.hoverId === 'velocity');

      if (!f.serious) particles.draw(g, px);
    },

    drawOverlay(g, f) {
      const geo = geoOf(f);
      const { x, v, cw, o } = geo;
      const view = f.view;
      const callout = {
        bg: colors.ink,
        font: `500 13px ${fonts.mono}`,
        leader: colors.ink,
      };

      // v₀ tag pinned to the block's top; x₀ tag pinned to the floor mark.
      // The block's popover takes the v₀ tag's place while it is open.
      if (!f.running && !(f.hoverId === 'block' && !f.held)) {
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

      // Force labels at the arrow tips.
      if (fScale > 0) {
        g.font = `600 12px ${fonts.mono}`;
        g.textBaseline = 'middle';
        for (const r of forceRows(f, geo)) {
          const len = (r.F / fScale) * FORCE_LENGTH;
          if (Math.abs(len) * view.pxPerMeter < 2) continue;
          const tip = view.toScreen(x + len, r.w);
          const dir = screenDir(f, Math.sign(len), 0);
          g.textAlign = dir.x < -0.5 ? 'right' : dir.x > 0.5 ? 'left' : 'center';
          label(g, r.fv.label, tip.x + dir.x * 10, tip.y + dir.y * 12, r.fv.color);
        }
      }

      drawPaperLabels(g, f, o);
      if (f.chips.energy) drawEnergyBar(g, f, x, cw);
      for (const p of parts) p.drawOverlay?.(g, f, geo);
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

    hit(pt: Vec2, f): Hit | null {
      const geo = geoOf(f);
      const { x, v, cw, wallU } = geo;
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
      for (const p of parts) {
        const h = p.hit?.(pt, f, geo);
        if (h) return h;
      }
      const springU = wallU + (cfg.springStart?.(f, geo) ?? 0);
      if (Math.abs(dw) < 0.09 && pt.x > springU && pt.x < x - side / 2) {
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

    objectBox(id, f) {
      const geo = geoOf(f);
      const { x, cw, wallU } = geo;
      switch (id) {
        case 'block':
          return {
            uMin: x - side / 2,
            uMax: x + side / 2,
            wMin: cw - side / 2,
            wMax: cw + side / 2,
          };
        case 'spring':
          return {
            uMin: wallU + (cfg.springStart?.(f, geo) ?? 0),
            uMax: x - side / 2,
            wMin: cw - 0.1,
            wMax: cw + 0.1,
          };
        case 'wall':
          return { uMin: wallU - 0.17, uMax: wallU, wMin: FLOOR_W - WALL_HEIGHT, wMax: FLOOR_W };
        case 'velocity': {
          const { start, tip } = arrowGeom(x, f.state[1]!, side);
          return {
            uMin: Math.min(start, tip),
            uMax: Math.max(start, tip),
            wMin: cw - 0.05,
            wMax: cw + 0.05,
          };
        }
        default:
          for (const p of parts) {
            const b = p.box?.(id, f, geo);
            if (b) return b;
          }
          return null;
      }
    },

    onFling(v, f) {
      if (f.serious) return;
      particles.burst(f.state[0]! - Math.sign(v) * side * 0.5, blockCenterW(side), v);
    },
  };
  return scene;
}
