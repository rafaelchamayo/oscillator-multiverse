import type { TKey } from '../i18n/dict';
import type { OdeEquation } from '../models/types';
import type { PanelDef } from '../oscillators/types';
import type { Plot, PlotCtx } from '../render/plots/types';
import { roundRectPath } from '../render/scene/draw';
import { colors, fonts, inkWidth, series as S } from '../render/theme';
import type { PresentOptions } from '../state/simStore';
import { drawEquation, equationHeight, measureEquation } from './drawMath';

/**
 * Presentation stage: a 1920×1080 canvas laid out in a 1280×720 logical space (scale 1.5), so
 * the scene, labels and plots keep the proportions of the interactive view at video size.
 */
export const PRESENT = { width: 1280, height: 720, scale: 1.5 } as const;

const MARGIN = 24;
const COLUMN_W = 420;
/** Gap between the ODE pill and the scene below it. */
const ODE_GAP = 14;
/** Left edge the ODE pill keeps free for the scene's clock ("t = 12.34 s"). */
const CLOCK_CLEAR = 150;
/** Right edge the ODE pill keeps free for the scene's energy bar. */
const BAR_CLEAR = 80;

export interface PresentLayout {
  /** Scene region: [0, sceneW] × [0, height]. */
  sceneW: number;
  insetTop: number;
  insetBottom: number;
  /** Dark column with the plots (null when no plot is visible). */
  column: { x: number; y: number; w: number; h: number } | null;
  cards: { panel: PanelDef; x: number; y: number; w: number; h: number }[];
}

/**
 * `odeHeight(sceneW)` is the ODE pill's height for that scene width (a matrix ODE is taller);
 * the scene starts below it.
 */
export function presentLayout(
  panels: PanelDef[],
  opts: PresentOptions,
  odeHeight: (sceneW: number) => number = () => ODE_MIN_H,
): PresentLayout {
  const inset = (sceneW: number) => (opts.ode ? MARGIN + odeHeight(sceneW) + ODE_GAP : MARGIN);
  if (panels.length === 0) {
    const sceneW = PRESENT.width;
    return { sceneW, insetTop: inset(sceneW), insetBottom: MARGIN, column: null, cards: [] };
  }
  const column = {
    x: PRESENT.width - MARGIN - COLUMN_W,
    y: MARGIN,
    w: COLUMN_W,
    h: PRESENT.height - 2 * MARGIN,
  };
  const pad = 14;
  const gap = 12;
  const total = panels.reduce((s, p) => s + (p.weight ?? 1), 0);
  const free = column.h - 2 * pad - gap * (panels.length - 1);
  let y = column.y + pad;
  const cards = panels.map((panel) => {
    const h = (free * (panel.weight ?? 1)) / total;
    const card = { panel, x: column.x + pad, y, w: column.w - 2 * pad, h };
    y += h + gap;
    return card;
  });
  const sceneW = column.x - 8;
  return { sceneW, insetTop: inset(sceneW), insetBottom: MARGIN, column, cards };
}

/** Paper background over the whole canvas (device pixels already scaled by PRESENT.scale). */
export function drawBackground(g: CanvasRenderingContext2D, kind: PresentOptions['background']) {
  const { width: W, height: H } = PRESENT;
  if (kind === 'solid') {
    g.fillStyle = colors.bg;
  } else {
    const grad = g.createRadialGradient(W * 0.38, H * 0.42, 60, W * 0.38, H * 0.42, W * 0.8);
    grad.addColorStop(0, colors.surface);
    grad.addColorStop(1, colors.bgDeep);
    g.fillStyle = grad;
  }
  g.fillRect(0, 0, W, H);
}

const BADGE_COLOR = {
  neutral: colors.textMuted,
  info: colors.primary,
  warn: colors.warning,
  good: colors.success,
} as const;

export interface OdeCard {
  eq: OdeEquation;
  badge: { text: string; tone: keyof typeof BADGE_COLOR } | null;
  /** ODE term ids to highlight. */
  lit: string[];
}

const ODE_SIZE = 27;
/** Matrix entries start smaller: an N × N matrix is wide and tall. */
const MATRIX_SIZE = 20;
const ODE_PAD_X = 30;
const ODE_PAD_Y = 12;
const ODE_MIN_H = 62;
const BADGE_GAP = 18;

/**
 * Size and place of the ODE pill: centered over the scene but clear of the clock (left) and the
 * energy bar (right); the equation shrinks when it would not fit between them.
 */
export function odeCardGeometry(
  g: CanvasRenderingContext2D,
  card: OdeCard,
  centerX: number,
  sceneW: number,
): { x: number; y: number; w: number; h: number; size: number; badgeW: number } {
  const base = card.eq.matrix ? MATRIX_SIZE : ODE_SIZE;
  g.font = `600 14px ${fonts.ui}`;
  const badgeW = card.badge ? g.measureText(card.badge.text).width + 24 : 0;
  const fixed = 2 * ODE_PAD_X + (card.badge ? badgeW + BADGE_GAP : 0);
  const avail = sceneW - CLOCK_CLEAR - BAR_CLEAR;
  const natural = measureEquation(g, card.eq, base);
  const size = natural + fixed > avail ? (base * Math.max(avail - fixed, 0)) / natural : base;
  const w = measureEquation(g, card.eq, size) + fixed;
  const h = Math.max(ODE_MIN_H, equationHeight(card.eq, size) + 2 * ODE_PAD_Y);
  const x = Math.max(CLOCK_CLEAR, Math.min(centerX - w / 2, sceneW - BAR_CLEAR - w));
  return { x, y: MARGIN, w, h, size, badgeW };
}

/** The ODE pill at the top of the scene region, like the interactive one. */
export function drawOdeCard(
  g: CanvasRenderingContext2D,
  card: OdeCard,
  centerX: number,
  sceneW: number,
): void {
  const { x, y, w, h, size, badgeW } = odeCardGeometry(g, card, centerX, sceneW);
  const eqW = w - 2 * ODE_PAD_X - (card.badge ? badgeW + BADGE_GAP : 0);
  const radius = Math.min(h / 2, 40);

  // Pill with ink outline and the hard drop shadow of the sketchbook look.
  roundRectPath(g, x, y + 4, w, h, radius);
  g.fillStyle = 'rgba(22,24,29,0.10)';
  g.fill();
  roundRectPath(g, x, y, w, h, radius);
  g.fillStyle = colors.surface;
  g.fill();
  g.lineWidth = inkWidth;
  g.strokeStyle = colors.border;
  g.stroke();

  drawEquation(g, card.eq, x + ODE_PAD_X, y + h / 2 + size * 0.34, size, colors.text, {
    terms: card.lit,
    color: colors.highlight,
  });

  if (card.badge) {
    const bx = x + ODE_PAD_X + eqW + BADGE_GAP;
    const bh = 26;
    const by = y + (h - bh) / 2;
    const c = BADGE_COLOR[card.badge.tone];
    roundRectPath(g, bx, by, badgeW, bh, bh / 2);
    g.globalAlpha = 0.12;
    g.fillStyle = c;
    g.fill();
    g.globalAlpha = 1;
    g.lineWidth = 1.5;
    g.strokeStyle = c;
    g.stroke();
    g.fillStyle = card.badge.tone === 'neutral' ? colors.textMuted : colors.text;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `600 14px ${fonts.ui}`;
    g.fillText(card.badge.text, bx + badgeW / 2, by + bh / 2 + 0.5);
  }
}

/** Dark plot column with one titled card per visible panel. */
export function drawPlotColumn(
  g: CanvasRenderingContext2D,
  layout: PresentLayout,
  plotFor: (panel: PanelDef) => Plot,
  ctx: Omit<PlotCtx, 'hover'>,
  tr: (key: TKey) => string,
): void {
  const col = layout.column;
  if (!col) return;
  const k = PRESENT.scale;
  g.setTransform(k, 0, 0, k, 0, 0);
  roundRectPath(g, col.x, col.y, col.w, col.h, 18);
  g.fillStyle = colors.panelDark;
  g.fill();

  for (const c of layout.cards) {
    roundRectPath(g, c.x, c.y, c.w, c.h, 12);
    g.fillStyle = colors.panelDarkRaised;
    g.fill();
    g.fillStyle = S.label;
    g.font = `600 11px ${fonts.ui}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(tr(c.panel.titleKey).toUpperCase(), c.x + 12, c.y + 15);

    const top = 28;
    g.save();
    g.beginPath();
    g.rect(c.x, c.y + top, c.w, c.h - top);
    g.clip();
    g.setTransform(k, 0, 0, k, c.x * k, (c.y + top) * k);
    plotFor(c.panel).draw(g, c.w, c.h - top - 4, { ...ctx, hover: null });
    g.restore();
  }
}
