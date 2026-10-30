/**
 * Design tokens. Single source of truth for both the DOM (exposed as CSS custom
 * properties by `applyThemeToDocument`) and the canvas renderers (imported directly).
 *
 * Palette from the spec, with two contrast adjustments:
 *  - `textMuted` lifted from #9AA3D9 to #A3ACE0 so small UI text on `surface` stays ≥ 4.5:1.
 *  - `border` is used for outlines only, never as a text color.
 */
export const colors = {
  bg: '#0B1026', // night blue, top of background gradient
  bgDeep: '#151A3D', // bottom of background gradient
  surface: '#1C2250', // panels, popovers
  surfaceRaised: '#242B63', // hovered surfaces, chips on
  border: '#2E3675',
  primary: '#4C8DFF',
  accent: '#3DE1FF', // cyan
  purple: '#9B6BFF',
  lilac: '#C9A7FF',
  magenta: '#FF6BD6', // highlight
  text: '#E8ECFF',
  textMuted: '#A3ACE0',
  success: '#5BE3A8',
  warning: '#FFC86B',
  danger: '#FF6B8A',
} as const;

export const fonts = {
  display: "'Fredoka', 'Baloo 2', system-ui, sans-serif",
  ui: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
} as const;

export const radii = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

export const motion = {
  fast: 120,
  normal: 220,
  perspective: 600,
  easeOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
} as const;

/** Soft glow used around interactive elements (CSS box-shadow syntax). */
export const glow = {
  primary: `0 0 0 1px ${colors.primary}66, 0 0 18px ${colors.primary}55`,
  magenta: `0 0 0 1px ${colors.magenta}88, 0 0 22px ${colors.magenta}66`,
} as const;

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

export function applyThemeToDocument(root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(colors)) root.style.setProperty(`--c-${kebab(k)}`, v);
  for (const [k, v] of Object.entries(fonts)) root.style.setProperty(`--f-${k}`, v);
  for (const [k, v] of Object.entries(radii)) root.style.setProperty(`--r-${k}`, `${v}px`);
  root.style.setProperty('--ease-out', motion.easeOut);
  root.style.setProperty('--ease-in-out', motion.easeInOut);
  root.style.setProperty('--t-fast', `${motion.fast}ms`);
  root.style.setProperty('--t-normal', `${motion.normal}ms`);
  root.style.setProperty('--glow-primary', glow.primary);
  root.style.setProperty('--glow-magenta', glow.magenta);
}
