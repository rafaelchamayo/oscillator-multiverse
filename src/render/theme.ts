/**
 * Design tokens. Single source of truth for both the DOM (exposed as CSS custom
 * properties by `applyThemeToDocument`) and the canvas renderers (imported directly).
 *
 * Light "sketchbook" theme (replaces the spec's dark theme at the owner's request, see
 * DECISIONS.md): ivory paper, ink outlines, a single strong blue accent. The plot panel stays
 * dark, like a small display next to the drawing. All text/background pairs are ≥ 4.5:1.
 */
export const colors = {
  bg: '#F2F0EA', // paper
  bgDeep: '#E8E5DC', // paper, shaded edge of the background gradient
  surface: '#FBFAF7', // stage, toolbar, popovers
  surfaceRaised: '#E7EEFF', // hovered / active controls (blue tint)
  panelDark: '#24272E', // plots panel
  panelDarkRaised: '#30343D',
  ink: '#16181D', // outlines and primary text
  border: '#16181D',
  borderSoft: '#D6D2C7',
  primary: '#1F63F2', // accent blue: spring, velocity, active controls
  primaryDeep: '#143C9E', // spring back strands, pressed states
  primarySoft: '#CFDDFF',
  accent: '#5B9BFF', // blue that reads on the dark panel and dark callouts
  metalLight: '#F1F2F4',
  metal: '#CDD0D6',
  metalDark: '#8E939C',
  highlight: '#E8338F', // hover glow (object ↔ ODE term)
  text: '#16181D',
  textMuted: '#5A606D',
  textOnDark: '#F3F4F8',
  success: '#17A673',
  warning: '#E19A12',
  danger: '#E5484D',
} as const;

/** Series colors on the dark plots panel (and their counterparts on paper). */
export const series = {
  x: '#5B9BFF',
  v: '#3DDC97',
  a: '#FFB547',
  K: '#5B9BFF',
  U: '#FFB547',
  E: '#F3F4F8',
  manual: '#FF5FB0',
  grid: '#3A3F4B',
  axis: '#6B7280',
  label: '#AEB4C2',
} as const;

/** One color per body in multi-body tabs (blocks, paper traces, plots); readable on both themes. */
export const bodyColors = ['#3B78FF', '#F08A24', '#17A673', '#D63A9A', '#8B5CF6'] as const;

/** One color per normal mode (dark plot panel only): pastel, so they never read as a body. */
export const modeColors = ['#7DD3FC', '#FCA5A5', '#FDE68A', '#86EFAC', '#D8B4FE'] as const;

/** Force vectors (on paper and in the force plot): one hue per physical cause. */
export const forces = {
  spring: '#12A39D',
  damper: '#8B5CF6',
  drive: '#E8A317',
  gravity: '#8A909C',
  net: '#E5484D',
} as const;

/** Dashpot fluid by damping: water → oil → honey (rgb + opacity). */
export const fluids = {
  water: { rgb: [124, 200, 245], a: 0.32 },
  oil: { rgb: [139, 92, 246], a: 0.5 },
  honey: { rgb: [224, 165, 38], a: 0.82 },
} as const;

export const fonts = {
  display: "'Fredoka', 'Baloo 2', system-ui, sans-serif",
  ui: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
} as const;

export const radii = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

/** Outline width (CSS px) of "ink" strokes on panels and controls. */
export const inkWidth = 2;

export const motion = {
  fast: 120,
  normal: 220,
  perspective: 600,
  easeOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
} as const;

/** Focus/hover rings around interactive elements (CSS box-shadow syntax). */
export const glow = {
  primary: `0 0 0 3px ${colors.primarySoft}`,
  highlight: `0 0 0 3px ${colors.highlight}55`,
} as const;

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

export function applyThemeToDocument(root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(colors)) root.style.setProperty(`--c-${kebab(k)}`, v);
  for (const [k, v] of Object.entries(fonts)) root.style.setProperty(`--f-${k}`, v);
  for (const [k, v] of Object.entries(radii)) root.style.setProperty(`--r-${k}`, `${v}px`);
  root.style.setProperty('--ink-width', `${inkWidth}px`);
  root.style.setProperty('--ease-out', motion.easeOut);
  root.style.setProperty('--ease-in-out', motion.easeInOut);
  root.style.setProperty('--t-fast', `${motion.fast}ms`);
  root.style.setProperty('--t-normal', `${motion.normal}ms`);
  root.style.setProperty('--glow-primary', glow.primary);
  root.style.setProperty('--glow-highlight', glow.highlight);
}

/**
 * Domain coloring of a complex number by its phase θ = arg z: a hue wheel (saturation 0.78,
 * lightness 0.5) turned so that θ = 0 is the accent blue, and real positive amplitudes look like
 * the rest of the app. Shared by the wave, the phasor wheels and the quantum carpet.
 */
export function phaseRGB(theta: number, out: number[] = [0, 0, 0]): number[] {
  const turns = (((220 - (theta * 180) / Math.PI) % 360) + 360) % 360;
  const s = 0.78;
  const l = 0.5;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const h = turns / 60;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  out[0] = Math.round((r + m) * 255);
  out[1] = Math.round((g + m) * 255);
  out[2] = Math.round((b + m) * 255);
  return out;
}

const PHASE_BINS = 72;
const PHASE_STYLES = Array.from({ length: PHASE_BINS }, (_, k) => {
  const [r, g, b] = phaseRGB((k / PHASE_BINS) * 2 * Math.PI);
  return `rgb(${r},${g},${b})`;
});

/** CSS color of a phase (quantized to 5°, so no string is built per call). */
export function phaseColor(theta: number): string {
  const k = Math.round((theta / (2 * Math.PI)) * PHASE_BINS);
  return PHASE_STYLES[((k % PHASE_BINS) + PHASE_BINS) % PHASE_BINS]!;
}
