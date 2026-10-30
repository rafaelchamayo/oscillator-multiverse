import type { TKey } from '../i18n/dict';
import type { OdeEquation } from '../models/types';
import type { PanelDef } from '../oscillators/types';
import type { Plot, PlotCtx } from '../render/plots/types';
import { roundRectPath } from '../render/scene/draw';
import { colors, fonts, inkWidth, series as S } from '../render/theme';
import type { PresentOptions } from '../state/simStore';
import { drawEquation, measureEquation } from './drawMath';

/**
 * Presentation stage: a 1920×1080 canvas laid out in a 1280×720 logical space (scale 1.5), so
 * the scene, labels and plots keep the proportions of the interactive view at video size.
 */
export const PRESENT = { width: 1280, height: 720, scale: 1.5 } as const;

const MARGIN = 24;
const COLUMN_W = 420;
const ODE_INSET = 100;
/** Left edge the ODE pill keeps free for the scene's clock ("t = 12.34 s"). */
const CLOCK_CLEAR = 150;

export interface PresentLayout {
  /** Scene region: [0, sceneW] × [0, height]. */
  sceneW: number;
  insetTop: number;
  insetBottom: number;
  /** Dark column with the plots (null when no plot is visible). */
  column: { x: number; y: number; w: number; h: number } | null;
  cards: { panel: PanelDef; x: number; y: number; w: number; h: number }[];
}

export function presentLayout(panels: PanelDef[], opts: PresentOptions): PresentLayout {
  const insetTop = opts.ode ? ODE_INSET : MARGIN;
  if (panels.length === 0) {
    return { sceneW: PRESENT.width, insetTop, insetBottom: MARGIN, column: null, cards: [] };
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
  return { sceneW: column.x - 8, insetTop, insetBottom: MARGIN, column, cards };
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

/** The ODE pill centered at the top of the scene region, like the interactive one. */
export function drawOdeCard(g: CanvasRenderingContext2D, card: OdeCard, centerX: number): void {
  const size = 27;
  const eqW = measureEquation(g, card.eq, size);
  g.font = `600 14px ${fonts.ui}`;
  const badgeW = card.badge ? g.measureText(card.badge.text).width + 24 : 0;
  const padX = 30;
  const w = eqW + (card.badge ? badgeW + 18 : 0) + 2 * padX;
  const h = 62;
  // Centered, but clear of the clock in the top-left corner.
  const x = Math.max(centerX - w / 2, CLOCK_CLEAR);
  const y = MARGIN;

  // Pill with ink outline and the hard drop shadow of the sketchbook look.
  roundRectPath(g, x, y + 4, w, h, h / 2);
  g.fillStyle = 'rgba(22,24,29,0.10)';
  g.fill();
  roundRectPath(g, x, y, w, h, h / 2);
  g.fillStyle = colors.surface;
  g.fill();
  g.lineWidth = inkWidth;
  g.strokeStyle = colors.border;
  g.stroke();

  drawEquation(g, card.eq, x + padX, y + h / 2 + size * 0.34, size, colors.text, {
    terms: card.lit,
    color: colors.highlight,
  });

  if (card.badge) {
    const bx = x + padX + eqW + 18;
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
