import { LEVELS } from '../../models/quantum-ho/hermite';
import {
  QHO_DEFAULTS,
  catInit,
  coherentInit,
  eigenInit,
  energy,
  qhoModel,
  setCoefficient,
  superposeInit,
  type QhoInit,
  type QhoParams,
} from '../../models/quantum-ho/model';
import type { Observables } from '../../models/types';
import { TimePlot } from '../../render/plots/TimePlot';
import { colors, phaseColor, series as S } from '../../render/theme';
import type { MechanicalSimSpec, ObjectDef, OscillatorPlugin, ParamDef, PresetDef } from '../types';
import es from './i18n/es.json';
import en from './i18n/en.json';
import { MAX_SPEED, SHOWN_LEVELS, createQuantumScene, sub } from './scene';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** |cₙ| and arg cₙ as sliders on the state (shown by level n and by its wheel). */
const coefficientSliders = (n: number): ParamDef[] => [
  {
    key: `amp${n}`,
    symbol: `|c${sub(n)}|`,
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    digits: 2,
    state: {
      get: (s) => Math.hypot(s[n]!, s[LEVELS + n]!),
      set: (s, r) => setCoefficient(s, n, r, Math.atan2(s[LEVELS + n]!, s[n]!)),
    },
  },
  {
    key: `phase${n}`,
    symbol: `φ${sub(n)}`,
    unit: 'rad',
    min: -Math.PI,
    max: Math.PI,
    step: 0.01,
    digits: 2,
    state: {
      get: (s) => Math.atan2(s[LEVELS + n]!, s[n]!),
      set: (s, phi) => setCoefficient(s, n, Math.hypot(s[n]!, s[LEVELS + n]!), phi),
    },
  },
];

const levelInfo = (n: number) => ({
  key: 'osc.quantum-ho.levelInfo' as const,
  vars: () => ({ E: String(energy(n)), nodes: String(n) }),
});

const objects: ObjectDef[] = [
  { id: 'potential', terms: ['potential'], params: [] },
  // Dragging the packet reshapes ψ: its curvature is the kinetic term.
  { id: 'packet', terms: ['kinetic'], params: [] },
  { id: 'velocity', terms: [], params: [] },
  ...range(SHOWN_LEVELS).map((n) => ({
    id: `level${n}`,
    terms: [],
    params: coefficientSliders(n),
    info: levelInfo(n),
  })),
  // The wheel's turning is the time derivative: i ∂ψ/∂t gives each cₙ its phase speed Eₙ.
  ...range(SHOWN_LEVELS).map((n) => ({
    id: `wheel${n}`,
    terms: ['time'],
    params: coefficientSliders(n),
    info: levelInfo(n),
  })),
];

/** Each preset says which view it is best seen in. */
const view = { density: false, classical: false };

const presets: PresetDef[] = [
  { id: 'ground', init: () => eigenInit(0), chips: view },
  { id: 'first', init: () => eigenInit(1), chips: view },
  {
    id: 'slosh',
    init: () =>
      superposeInit([
        { n: 0, amp: 1 },
        { n: 1, amp: 1 },
      ]),
    chips: view,
  },
  {
    id: 'correspondence',
    init: () => eigenInit(10),
    chips: { density: true, classical: true },
  },
  { id: 'coherent', init: () => coherentInit(2.5), chips: view },
  { id: 'cat', init: () => catInit(2.5), chips: view },
  {
    id: 'revival',
    init: () =>
      superposeInit([
        { n: 0, amp: 1 },
        { n: 2, amp: 0.8, phase: 1.2 },
        { n: 5, amp: 0.7, phase: -2 },
      ]),
    chips: { ...view, carpet: true },
  },
].map((p) => ({
  ...p,
  labelKey: `osc.quantum-ho.presets.${p.id}` as const,
  descKey: `osc.quantum-ho.presetInfo.${p.id}` as const,
  params: {},
}));

const obs: Observables = {};

const sim: MechanicalSimSpec<QhoParams, QhoInit> = {
  kind: 'mechanical1d',
  model: qhoModel,
  defaultParams: QHO_DEFAULTS,
  defaultInit: coherentInit(2.5),
  maxSpeed: MAX_SPEED,
  createScene: createQuantumScene,
  objects,
  presets,
  badge: (p: QhoParams, state: Float64Array) => {
    qhoModel.observables(state, p, 0, obs);
    let maxP = 0;
    for (let n = 0; n < LEVELS; n++) maxP = Math.max(maxP, obs[`P${n}`]!);
    if (maxP > 1 - 1e-9) return { key: 'osc.quantum-ho.badge.stationary', tone: 'good' };
    if (Math.abs(obs.dx! - Math.SQRT1_2) < 1e-6 && Math.abs(obs.dp! - Math.SQRT1_2) < 1e-6) {
      return { key: 'osc.quantum-ho.badge.coherent', tone: 'info' };
    }
    return { key: 'osc.quantum-ho.badge.superposition', tone: 'neutral' };
  },
  historyKeys: ['x', 'v', 'dx', 'dp', 'dxdp', 'E', 'K', 'U'],
  chips: [
    { id: 'x', labelKey: 'osc.quantum-ho.chips.expect', defaultOn: true, color: S.x },
    {
      id: 'density',
      labelKey: 'osc.quantum-ho.chips.density',
      defaultOn: false,
      color: colors.accent,
      group: 'scene',
    },
    {
      id: 'reim',
      labelKey: 'osc.quantum-ho.chips.reim',
      defaultOn: false,
      color: colors.warning,
      group: 'scene',
    },
    {
      id: 'classical',
      labelKey: 'osc.quantum-ho.chips.classical',
      defaultOn: false,
      color: colors.textMuted,
      group: 'scene',
    },
    {
      id: 'carpet',
      labelKey: 'osc.quantum-ho.chips.carpet',
      defaultOn: true,
      color: phaseColor(Math.PI / 2),
      group: 'scene',
    },
  ],
  panels: [
    {
      id: 'expect',
      titleKey: 'osc.quantum-ho.panels.expect',
      chips: ['x'],
      create: () =>
        new TimePlot(
          [
            { key: 'x', label: '⟨x⟩', unit: 'ℓ', color: S.x },
            { key: 'v', label: '⟨p⟩', unit: 'ħ/ℓ', color: S.v },
          ],
          'lanes',
        ),
    },
  ],
};

export const quantumHoPlugin: OscillatorPlugin = {
  id: 'quantum-ho',
  icon: 'ψ',
  i18n: { es, en },
  sim,
};
