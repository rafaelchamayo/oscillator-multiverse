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
