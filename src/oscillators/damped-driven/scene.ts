import { DD_RANGES, type DampedDrivenParams } from '../../models/damped-driven/model';
import { equilibrium } from '../../models/damped-driven/analytic';
import { alpha, clamp, roundRectPath } from '../../render/scene/draw';
import type { FrameInfo, MechanicalScene } from '../../render/scene/types';
import { colors, fluids, forces } from '../../render/theme';
import {
  createSpringBlockScene,
  FLOOR_W,
  type SceneGeo,
  type ScenePart,
} from '../shared/springBlockScene';

export { MAX_SPEED } from '../shared/springBlockScene';

type P = DampedDrivenParams;
type F = FrameInfo<Float64Array, P>;

/** Block side: area ∝ m, 0.3 m at m = 1 kg. */
export const blockSide = (m: number): number => 0.3 * Math.sqrt(m);
const MAX_X = 1.4;
/** Dashpot tube axis: above the largest block, so the piston arm fits every mass. */
const TUBE_W = FLOOR_W - blockSide(DD_RANGES.m.max) - 0.16;
const TUBE_R = 0.065;
const WALL_HEIGHT = FLOOR_W - TUBE_W + 0.13;

/** Motor wheel radius, crank-to-slider rod length and the gap to the wall face. */
const WHEEL_R = 0.15;
const ROD_L = 0.3;
const WHEEL_GAP = 0.04;
/** The crank radius is the anchor amplitude F₀/k (exact picture of the drive), capped to fit. */
const MAX_CRANK = 0.12;
export const crankRadius = (p: P): number => Math.min(p.F0 / p.k, MAX_CRANK);

/** Fluid color for a damping b: water (b ≈ 0) → oil → honey (b = max), on a log scale. */
export function fluidColor(b: number): { rgb: number[]; a: number } {
  const f = clamp(Math.log1p(b) / Math.log1p(DD_RANGES.b.max), 0, 1);
  const [s0, s1, k] =
    f < 0.5 ? [fluids.water, fluids.oil, f * 2] : [fluids.oil, fluids.honey, f * 2 - 1];
  return {
    rgb: s0.rgb.map((c, i) => Math.round(c + (s1.rgb[i]! - c) * k)),
    a: s0.a + (s1.a - s0.a) * k,
  };
}

const rgba = (rgb: number[], a: number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

/** Hydraulic dashpot: a tube of fluid above the track; an arm from the block drags a piston. */
function dashpot(): ScenePart<P> {
  const bubbles = Array.from({ length: 18 }, (_, i) => ({
    s: ((i * 0.618) % 1) as number, // position along the tube, 0..1
    w: (((i * 0.37) % 1) - 0.5) * 1.3 * TUBE_R,
    r: 0.006 + ((i * 0.29) % 1) * 0.008,
  }));
  const tube = (geo: SceneGeo) => ({ from: geo.wallU, to: geo.o + MAX_X + 0.25 });

  return {
    update(f, geo) {
      if (!f.realDt) return;
      const { from, to } = tube(geo);
      const len = to - from;
      // Fluid squeezes past the piston: bubbles near it move against its velocity, slower in
      // thicker fluid.
      const v = f.running ? geo.v : 0;
      for (const b of bubbles) {
        const u = from + b.s * len;
        const near = Math.exp(-Math.abs(u - geo.x) / 0.35);
        const du = (-v * 0.9 * near * f.realDt) / (1 + f.params.b * 0.25);
        b.s = (((b.s + du / len) % 1) + 1) % 1;
      }
    },

    drawBack(g, f, geo) {
      const { from, to } = tube(geo);
      const ppx = f.ppx;
      const glow = f.hoverId === 'damper';
      const fl = fluidColor(f.params.b);
      const top = TUBE_W - TUBE_R;

      // Arm from the block's top to the piston.
      const armTop = TUBE_W;
      const armBottom = geo.cw - geo.side / 2;
      g.strokeStyle = colors.ink;
      g.lineWidth = 7 * ppx;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(geo.x, armBottom);
      g.lineTo(geo.x, armTop);
      g.stroke();
      g.strokeStyle = colors.metal;
      g.lineWidth = 3.5 * ppx;
      g.stroke();

      // Bracket holding the tube's far end.
      g.strokeStyle = colors.ink;
      g.lineWidth = 2.5 * ppx;
      g.beginPath();
      g.moveTo(to - 0.03, TUBE_W + TUBE_R);
      g.lineTo(to - 0.03, TUBE_W + TUBE_R + 0.08);
      g.lineTo(to + 0.05, TUBE_W + TUBE_R + 0.08);
      g.stroke();

      // Fluid, with a lighter band on top (meniscus-like shine).
      roundRectPath(g, from, top, to - from, 2 * TUBE_R, TUBE_R * 0.5);
      g.fillStyle = rgba(fl.rgb, fl.a);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(from + 0.02, top + TUBE_R * 0.25, to - from - 0.04, TUBE_R * 0.22);

      for (const b of bubbles) {
        const u = from + 0.02 + b.s * (to - from - 0.04);
        g.beginPath();
        g.arc(u, TUBE_W + b.w, b.r, 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.fill();
        g.lineWidth = 1 * ppx;
        g.strokeStyle = rgba(fl.rgb, Math.min(1, fl.a + 0.3));
        g.stroke();
      }

      // Piston plate.
      roundRectPath(g, geo.x - 0.018, top + 0.008, 0.036, 2 * TUBE_R - 0.016, 0.01);
      g.fillStyle = colors.metalDark;
      g.fill();
      g.strokeStyle = colors.ink;
      g.lineWidth = 2 * ppx;
      g.stroke();

      roundRectPath(g, from, top, to - from, 2 * TUBE_R, TUBE_R * 0.5);
      g.strokeStyle = glow ? colors.highlight : colors.ink;
      g.lineWidth = (glow ? 3.5 : 2.5) * ppx;
      g.stroke();
    },

    hit(pt, f, geo) {
      const { from, to } = tube(geo);
      const inTube = pt.x >= from && pt.x <= to && Math.abs(pt.y - TUBE_W) <= TUBE_R + 4 * f.px;
      const onArm =
        Math.abs(pt.x - geo.x) < 6 * f.px && pt.y > TUBE_W && pt.y < geo.cw - geo.side / 2;
      return inTube || onArm ? { objectId: 'damper', role: 'object' } : null;
    },

    box(id, _f, geo) {
      if (id !== 'damper') return null;
      const { from, to } = tube(geo);
      return { uMin: from, uMax: to, wMin: TUBE_W - TUBE_R, wMax: TUBE_W + TUBE_R };
    },
  };
}

/** Wheel center and the slider the spring hangs from, for this frame. */
function crank(f: F, geo: SceneGeo) {
  const c = { u: geo.wallU + WHEEL_GAP + WHEEL_R, w: geo.cw };
  const A = crankRadius(f.params);
  const th = f.params.omega * f.t;
  const pin = { u: c.u + A * Math.cos(th), w: c.w - A * Math.sin(th) };
  // The slider follows A cos ωt exactly: the spring's end moves like the anchor of option (b),
  // whose force kA cos ωt is the F₀ cos ωt of the model.
  const slider = c.u + ROD_L + A * Math.cos(th);
  return { c, A, pin, slider };
}

/** Motor wheel with a crank and connecting rod that drives the spring's end. */
function motor(): ScenePart<P> {
  return {
    drawBack(g, f, geo) {
      const ppx = f.ppx;
      const { c, pin, slider } = crank(f, geo);
      const glow = f.hoverId === 'motor';
      const effort = clamp(f.params.F0 / DD_RANGES.F0.max, 0, 1);

      // Slider guide on the spring axis.
      g.fillStyle = alpha(colors.ink, 0.12);
      g.fillRect(c.u + ROD_L - MAX_CRANK - 0.03, c.w - 0.012, 2 * MAX_CRANK + 0.06, 0.024);

      // Wheel: a warm glow that grows with F₀ shows how hard the motor pushes.
      if (effort > 0.02 && !f.serious) {
        const halo = g.createRadialGradient(c.u, c.w, WHEEL_R * 0.8, c.u, c.w, WHEEL_R * 1.6);
        halo.addColorStop(0, alpha(colors.warning, 0.35 * effort));
        halo.addColorStop(1, alpha(colors.warning, 0));
        g.fillStyle = halo;
        g.beginPath();
        g.arc(c.u, c.w, WHEEL_R * 1.6, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.arc(c.u, c.w, WHEEL_R, 0, Math.PI * 2);
      g.fillStyle = colors.surface;
      g.fill();
      g.strokeStyle = glow ? colors.highlight : colors.ink;
      g.lineWidth = (glow ? 3.5 : 2.5) * ppx;
      g.stroke();
      // Spokes turning at ω.
      const th = f.params.omega * f.t;
      g.strokeStyle = alpha(colors.ink, 0.35);
      g.lineWidth = 2 * ppx;
      g.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = th + (k * 2 * Math.PI) / 3;
        g.moveTo(c.u, c.w);
        g.lineTo(c.u + WHEEL_R * 0.85 * Math.cos(a), c.w - WHEEL_R * 0.85 * Math.sin(a));
      }
      g.stroke();
      // Crank arm (radius A) and pin.
      g.strokeStyle = colors.warning;
      g.lineWidth = 5 * ppx;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(c.u, c.w);
      g.lineTo(pin.u, pin.w);
      g.stroke();
      g.beginPath();
      g.arc(c.u, c.w, 0.022, 0, Math.PI * 2);
      g.fillStyle = colors.ink;
      g.fill();

      // Connecting rod to the slider.
      g.strokeStyle = colors.ink;
      g.lineWidth = 6 * ppx;
      g.beginPath();
      g.moveTo(pin.u, pin.w);
      g.lineTo(slider, c.w);
      g.stroke();
      g.strokeStyle = colors.metal;
      g.lineWidth = 3 * ppx;
      g.stroke();
      g.beginPath();
      g.arc(pin.u, pin.w, 0.016, 0, Math.PI * 2);
      g.fillStyle = colors.surface;
      g.fill();
      g.lineWidth = 2 * ppx;
      g.strokeStyle = colors.ink;
      g.stroke();

      // Slider block.
      roundRectPath(g, slider - 0.025, c.w - 0.04, 0.05, 0.08, 0.012);
      g.fillStyle = colors.metal;
      g.fill();
      g.strokeStyle = glow ? colors.highlight : colors.ink;
      g.lineWidth = 2.5 * ppx;
      g.stroke();
    },

    hit(pt, f, geo) {
      const { c, slider } = crank(f, geo);
      const onWheel = Math.hypot(pt.x - c.u, pt.y - c.w) <= WHEEL_R + 4 * f.px;
      const onRod = pt.x >= c.u && pt.x <= slider + 0.03 && Math.abs(pt.y - c.w) < 0.05;
      return onWheel || onRod ? { objectId: 'motor', role: 'object' } : null;
    },

    box(id, f, geo) {
      if (id !== 'motor') return null;
      const { c, slider } = crank(f, geo);
      return {
        uMin: c.u - WHEEL_R,
        uMax: slider + 0.03,
        wMin: c.w - WHEEL_R,
        wMax: c.w + WHEEL_R,
      };
    },
  };
}

export function createDampedDrivenScene(): MechanicalScene<P> {
  return createSpringBlockScene<P>({
    kRange: DD_RANGES.k,
    // The motor takes room at the wall: move the wall left so the block travels as far.
    wallU: -1.85,
    blockSide,
    wallHeight: WALL_HEIGHT,
    maxX: MAX_X,
    equilibrium,
    springStart: (f, geo) => crank(f, geo).slider + 0.025 - geo.wallU,
    springStartMax: () => WHEEL_GAP + WHEEL_R + ROD_L + MAX_CRANK + 0.025,
    parts: [dashpot(), motor()],
    forces: [
      { obsKey: 'Fspring', chip: 'vec.spring', color: forces.spring, label: '−kx' },
      { obsKey: 'Fdamp', chip: 'vec.damper', color: forces.damper, label: '−bẋ' },
      { obsKey: 'Fdrive', chip: 'vec.drive', color: forces.drive, label: 'F(t)' },
      { obsKey: 'Fgravity', chip: 'vec.gravity', color: forces.gravity, label: '−mg' },
      { obsKey: 'Fnet', chip: 'vec.net', color: forces.net, label: 'ΣF' },
    ],
    paperOverlay: { key: 'xss', chip: 'ss' },
  });
}
