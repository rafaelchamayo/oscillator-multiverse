import { formatNumber } from '../../core/units';
import {
  equilibrium,
  gammaOf,
  omega0,
  regime,
  resonanceOmega,
  steadyAmplitude,
} from '../../models/damped-driven/analytic';
import {
  dampedDrivenModel,
  DD_DEFAULTS,
  DD_RANGES,
  type DampedDrivenParams,
} from '../../models/damped-driven/model';
import { PhasePlot } from '../../render/plots/PhasePlot';
import { TimePlot } from '../../render/plots/TimePlot';
import { forces as FC, series as S } from '../../render/theme';
import type { OscillatorPlugin, SimApi } from '../types';
import es from './i18n/es.json';
import en from './i18n/en.json';
import { ResonancePlot } from './ResonancePlot';
import { createDampedDrivenScene, MAX_SPEED } from './scene';
import { ResonanceSweep } from './sweep';

type P = DampedDrivenParams;

export interface DdExtras {
  sweep: ResonanceSweep;
  onSample(
    t: number,
    obs: Record<string, number>,
    params: Record<string, number>,
    m: boolean,
  ): void;
  onReset(): void;
}

const f2 = (v: number) => formatNumber(v);
const base = { m: 1, k: 4 };

export const dampedDrivenPlugin: OscillatorPlugin = {
  id: 'damped-driven',
  icon: '⚙',
  i18n: { es, en },
  sim: {
    kind: 'mechanical1d',
    model: dampedDrivenModel,
    defaultParams: DD_DEFAULTS,
    defaultInit: { x0: 0.5, v0: 0 },
    maxSpeed: MAX_SPEED,
    createScene: createDampedDrivenScene,
    setGravity: (p: P, g: number) => {
      p.g = g;
    },
    equilibrium: (p: P) => equilibrium(p),
    badge: (p: P) => {
      const r = regime(p, 0.02);
      const tone = (
        { undamped: 'neutral', underdamped: 'info', critical: 'good', overdamped: 'warn' } as const
      )[r];
      return { key: `osc.damped-driven.regime.${r}`, tone };
    },
    createExtras: (api: SimApi): DdExtras => {
      const sweep = new ResonanceSweep(api);
      return {
        sweep,
        onSample: (t, obs, params, manual) =>
          sweep.onSample(t, obs.x ?? 0, params as unknown as P, manual),
        onReset: () => sweep.reset(),
      };
    },
    objects: [
      {
        id: 'block',
        terms: ['mass', 'gravity'],
        params: [{ key: 'm', symbol: 'm', unit: 'kg', ...DD_RANGES.m, digits: 1 }],
        info: {
          key: 'osc.damped-driven.info.natural',
          vars: (p: P) => ({ w: f2(omega0(p)), g: f2(gammaOf(p)) }),
        },
      },
      {
        id: 'spring',
        terms: ['spring'],
        params: [{ key: 'k', symbol: 'k', unit: 'N/m', ...DD_RANGES.k, digits: 1 }],
        info: {
          key: 'osc.damped-driven.info.natural',
          vars: (p: P) => ({ w: f2(omega0(p)), g: f2(gammaOf(p)) }),
        },
      },
      {
        id: 'damper',
        terms: ['damper'],
        params: [{ key: 'b', symbol: 'b', unit: 'N·s/m', ...DD_RANGES.b, digits: 2 }],
        info: {
          key: 'osc.damped-driven.info.damping',
          vars: (p: P) => ({ g: f2(gammaOf(p)), w: f2(omega0(p)) }),
        },
      },
      {
        id: 'motor',
        terms: ['drive'],
        params: [
          { key: 'F0', symbol: 'F₀', unit: 'N', ...DD_RANGES.F0, digits: 1 },
          { key: 'omega', symbol: 'ω', unit: 'rad/s', ...DD_RANGES.omega, digits: 2 },
        ],
        info: {
          key: 'osc.damped-driven.info.drive',
          vars: (p: P) => ({ A: formatNumber(steadyAmplitude(p), 3), wr: f2(resonanceOmega(p)) }),
        },
      },
      { id: 'wall', terms: [], params: [] },
      { id: 'velocity', terms: [], params: [] },
    ],
    historyKeys: [
      'x',
      'v',
      'a',
      'K',
      'Ueq',
      'Eeq',
      'xss',
      'xtr',
      'Fspring',
      'Fdamp',
      'Fdrive',
      'Fnet',
      'Pin',
      'Pdiss',
    ],
    chips: [
      { id: 'x', labelKey: 'plots.chips.x', defaultOn: true, color: S.x },
      { id: 'ss', labelKey: 'plots.chips.ss', defaultOn: false, color: S.E },
      { id: 'v', labelKey: 'plots.chips.v', defaultOn: false, color: S.v },
      { id: 'a', labelKey: 'plots.chips.a', defaultOn: false, color: S.a },
      { id: 'forces', labelKey: 'plots.chips.forces', defaultOn: false, color: FC.net },
      { id: 'energy', labelKey: 'plots.chips.energy', defaultOn: false, color: S.U },
      { id: 'phase', labelKey: 'plots.chips.phase', defaultOn: true, color: '#9B7BFF' },
      { id: 'resonance', labelKey: 'plots.chips.resonance', defaultOn: true, color: '#3DDC97' },
      {
        id: 'vec.spring',
        labelKey: 'plots.vec.spring',
        defaultOn: false,
        color: FC.spring,
        group: 'vectors',
      },
      {
        id: 'vec.damper',
        labelKey: 'plots.vec.damper',
        defaultOn: false,
        color: FC.damper,
        group: 'vectors',
      },
      {
        id: 'vec.drive',
        labelKey: 'plots.vec.drive',
        defaultOn: false,
        color: FC.drive,
        group: 'vectors',
      },
      {
        id: 'vec.gravity',
        labelKey: 'plots.vec.gravity',
        defaultOn: false,
        color: FC.gravity,
        group: 'vectors',
      },
      {
        id: 'vec.net',
        labelKey: 'plots.vec.net',
        defaultOn: false,
        color: FC.net,
        group: 'vectors',
      },
    ],
    panels: [
      {
        id: 'motion',
        titleKey: 'plots.panels.motion',
        chips: ['x', 'ss', 'v', 'a'],
        weight: 1.3,
        create: () =>
          new TimePlot(
            [
              { key: 'x', chip: 'x', label: 'x', unit: 'm', color: S.x, lane: 'x' },
              {
                key: 'xss',
                chip: 'ss',
                label: 'x_ss',
                unit: 'm',
                color: S.E,
                lane: 'x',
                dash: true,
              },
              { key: 'xtr', chip: 'ss', label: 'x_tr', unit: 'm', color: '#C9A7FF' },
              { key: 'v', chip: 'v', label: 'v', unit: 'm/s', color: S.v },
              { key: 'a', chip: 'a', label: 'a', unit: 'm/s²', color: S.a },
            ],
            'lanes',
          ),
      },
      {
        id: 'forces',
        titleKey: 'plots.panels.forces',
        chips: ['forces'],
        create: () =>
          new TimePlot(
            [
              { key: 'Fspring', label: '−kx', unit: 'N', color: FC.spring },
              { key: 'Fdamp', label: '−bẋ', unit: 'N', color: FC.damper },
              { key: 'Fdrive', label: 'F(t)', unit: 'N', color: FC.drive },
              { key: 'Fnet', label: 'ΣF', unit: 'N', color: FC.net },
            ],
            'overlay',
          ),
      },
      {
        id: 'energy',
        titleKey: 'plots.panels.energy',
        chips: ['energy'],
        create: () =>
          new TimePlot(
            [
              { key: 'K', label: 'K', unit: 'J', color: S.K, lane: 'E' },
              { key: 'Ueq', label: 'U', unit: 'J', color: S.U, lane: 'E' },
              { key: 'Eeq', label: 'E', unit: 'J', color: S.E, lane: 'E' },
              { key: 'Pin', label: 'P_motor', unit: 'W', color: FC.drive, lane: 'P' },
              { key: 'Pdiss', label: 'P_diss', unit: 'W', color: FC.damper, lane: 'P' },
            ],
            'lanes',
            { includeZero: true },
          ),
      },
      {
        id: 'phase',
        titleKey: 'plots.panels.phase',
        chips: ['phase'],
        weight: 1.2,
        create: () =>
          new PhasePlot(
            'x',
            'v',
            { x: 'x', v: 'v', xUnit: 'm', vUnit: 'm/s' },
            {
              span: 40,
              limit: (params) => {
                const p = params as unknown as P;
                if (!(p.F0 > 0 && p.b > 0)) return null;
                const A = steadyAmplitude(p);
                return { cx: equilibrium(p), a: A, b: p.omega * A };
              },
            },
          ),
      },
      {
        id: 'resonance',
        titleKey: 'plots.panels.resonance',
        chips: ['resonance'],
        weight: 1.3,
        create: (extras: DdExtras) => new ResonancePlot(extras.sweep),
        actions: [
          {
            id: 'sweep',
            labelKey: 'plots.resonance.auto',
            run: (extras: DdExtras, params: P) =>
              extras.sweep.auto ? extras.sweep.stopAuto() : extras.sweep.startAuto(params),
            active: (extras: DdExtras) => extras.sweep.auto,
          },
          {
            id: 'clear',
            labelKey: 'plots.resonance.clear',
            run: (extras: DdExtras) => extras.sweep.clear(),
          },
        ],
      },
    ],
    presets: [
      {
        id: 'undamped',
        labelKey: 'osc.damped-driven.presets.undamped',
        params: { ...base, b: 0, F0: 0, omega: 1.5 },
        init: { x0: 0.5, v0: 0 },
      },
      {
        id: 'underdamped',
        labelKey: 'osc.damped-driven.presets.underdamped',
        params: { ...base, b: 0.4, F0: 0, omega: 1.5 },
        init: { x0: 0.5, v0: 0 },
      },
      {
        id: 'critical',
        labelKey: 'osc.damped-driven.presets.critical',
        params: { ...base, b: 4, F0: 0, omega: 1.5 },
        init: { x0: 0.5, v0: 0 },
      },
      {
        id: 'overdamped',
        labelKey: 'osc.damped-driven.presets.overdamped',
        params: { ...base, b: 10, F0: 0, omega: 1.5 },
        init: { x0: 0.5, v0: 0 },
      },
      {
        id: 'resonance',
        labelKey: 'osc.damped-driven.presets.resonance',
        // ω = ω_res = √(ω₀² − 2γ²) with γ = 0.1: the steady amplitude is the peak, ≈ 0.75 m.
        params: { ...base, b: 0.2, F0: 0.3, omega: 1.995 },
        init: { x0: 0, v0: 0 },
        chips: { ss: true, resonance: true },
      },
      {
        id: 'beats',
        labelKey: 'osc.damped-driven.presets.beats',
        // Envelope 2F₀/(m|ω₀² − ω²|) ≈ 0.79 m, beat period 2π/|ω₀ − ω| ≈ 31 s.
        params: { ...base, b: 0, F0: 0.3, omega: 1.8 },
        init: { x0: 0, v0: 0 },
      },
    ],
  },
};
