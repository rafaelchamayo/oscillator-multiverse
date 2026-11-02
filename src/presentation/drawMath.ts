import type { MatrixEntry, MatrixOde, OdeEquation, OdeTerm } from '../models/types';

/**
 * Minimal canvas renderer for our ODEs, so presentation mode can draw (and record) them:
 * `captureStream()` only sees the canvas, not KaTeX's DOM. It understands the subset our
 * models emit: numbers, letters, `\dot x`, `\ddot x`, `\,`, `\cdot`, `\cos`, parentheses,
 * `\psi`, `\partial`, superscripts, `\frac`/`\tfrac` (stacked), and matrix forms (`OdeEquation.matrix`), and uses KaTeX's own fonts so it looks like the
 * interactive view.
 */
interface Glyph {
  text: string;
  font: 'math' | 'main' | 'bold';
  /** Subscript (matrix vectors: x₁…xₙ). */
  sub?: string;
  /** Superscript (x², ∂²). */
  sup?: string;
  /** A stacked fraction: the glyph's own text is empty. `scale` is relative to the size. */
  frac?: { num: Glyph[]; den: Glyph[]; scale: number };
  /** Dots above (time derivatives). */
  dots: number;
  /** Extra space before, in em. */
  space: number;
}

/** Index just past the brace group that opens at `i` (latex[i] === '{'). */
function closeBrace(latex: string, i: number): number {
  let depth = 0;
  for (let k = i; k < latex.length; k++) {
    if (latex[k] === '{') depth++;
    else if (latex[k] === '}' && --depth === 0) return k + 1;
  }
  return latex.length;
}

function tokenize(latex: string): Glyph[] {
  const out: Glyph[] = [];
  let pending = 0;
  const push = (text: string, font: Glyph['font'], dots = 0) => {
    out.push({ text, font, dots, space: pending });
    pending = 0;
  };
  let i = 0;
  while (i < latex.length) {
    const rest = latex.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\\t?frac\s*(?=\{)/))) {
      const a = i + m[0].length;
      const b = closeBrace(latex, a);
      const c = closeBrace(latex, b);
      out.push({
        text: '',
        font: 'main',
        dots: 0,
        space: pending,
        frac: {
          num: tokenize(latex.slice(a + 1, b - 1)),
          den: tokenize(latex.slice(b + 1, c - 1)),
          scale: m[0].startsWith('\\t') ? 0.62 : 0.85,
        },
      });
      pending = 0;
      i = c;
      continue;
    } else if ((m = rest.match(/^\^(\{[^}]*\}|.)/))) {
      const prev = out[out.length - 1];
      const text = m[1]!.replace(/[{}]/g, '');
      if (prev) prev.sup = text;
    } else if ((m = rest.match(/^\\partial/))) {
      push('∂', 'main');
    } else if ((m = rest.match(/^\\psi/))) {
      push('ψ', 'math');
    } else if ((m = rest.match(/^\\(d+)ot\s*\{?\s*([a-zA-Z])\}?/))) {
      push(m[2]!, 'math', m[1]!.length);
    } else if ((m = rest.match(/^\\,/))) {
      pending += 0.17;
    } else if ((m = rest.match(/^\\cdot/))) {
      pending += 0.22;
      push('·', 'main');
      pending += 0.22;
    } else if ((m = rest.match(/^\\cos/))) {
      pending += 0.17;
      push('cos', 'main');
    } else if ((m = rest.match(/^-/))) {
      push('−', 'main');
    } else if ((m = rest.match(/^[0-9.]+/))) {
      push(m[0], 'main');
    } else if ((m = rest.match(/^[a-zA-Z]/))) {
      push(m[0], 'math');
    } else if ((m = rest.match(/^\s+/))) {
      // LaTeX ignores spaces in math mode.
    } else {
      m = [rest[0]!];
      push(rest[0]!, 'main');
    }
    i += m[0].length;
  }
  return out;
}

interface Piece extends Glyph {
  /** Term the glyph belongs to (for highlighting), if any. */
  term?: string;
}

function pieces(eq: OdeEquation): Piece[] {
  const out: Piece[] = [];
  const op = (text: string) => out.push({ text, font: 'main', dots: 0, space: 0.24 });
  const side = (terms: OdeTerm[]) => {
    if (terms.length === 0) {
      out.push({ text: '0', font: 'main', dots: 0, space: 0.24 });
      return;
    }
    terms.forEach((t, k) => {
      if (k > 0) op(t.sign < 0 ? '−' : '+');
      else if (t.sign < 0) out.push({ text: '−', font: 'main', dots: 0, space: 0.24 });
      const gl = tokenize(t.latex);
      gl.forEach((g, j) =>
        out.push({
          ...g,
          term: t.id,
          space: j === 0 ? (k > 0 || t.sign < 0 ? 0.24 : g.space) : g.space,
        }),
      );
    });
  };
  side(eq.lhs);
  op('=');
  side(eq.rhs);
  // Space after binary operators.
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]!;
    if (['+', '−', '=', '·'].includes(prev.text) && out[i]!.space === 0) out[i]!.space = 0.24;
  }
  return out;
}

const fontOf = (p: Glyph, size: number) =>
  p.font === 'math'
    ? `italic ${size}px KaTeX_Math, serif`
    : `${p.font === 'bold' ? 'bold ' : ''}${size}px KaTeX_Main, serif`;

const SUB_SCALE = 0.7;

/** Width of a run of glyphs, including spaces and subscripts. */
function runWidth(g: CanvasRenderingContext2D, run: Glyph[], size: number): number {
  let w = 0;
  for (const p of run) {
    w += p.space * size;
    if (p.frac) {
      w += fracWidth(g, p.frac, size);
      continue;
    }
    g.font = fontOf(p, size);
    w += g.measureText(p.text).width;
    const script = Math.max(scriptWidth(g, p.sub, size), scriptWidth(g, p.sup, size));
    w += script;
  }
  return w;
}

function scriptWidth(g: CanvasRenderingContext2D, text: string | undefined, size: number): number {
  if (!text) return 0;
  g.font = `${size * SUB_SCALE}px KaTeX_Main, serif`;
  return g.measureText(text).width;
}

/** Side bearing of a fraction bar, in em. */
const FRAC_PAD = 0.12;

function fracWidth(g: CanvasRenderingContext2D, f: NonNullable<Glyph['frac']>, size: number) {
  const s = size * f.scale;
  return Math.max(runWidth(g, f.num, s), runWidth(g, f.den, s)) + 2 * FRAC_PAD * size;
}

/** Height of a run above (`up`) and below (`down`) its baseline, in px: fractions are taller. */
function runExtent(run: Glyph[], size: number): { up: number; down: number } {
  let up = 0.75 * size;
  let down = 0.25 * size;
  for (const p of run) {
    if (!p.frac) continue;
    const s = size * p.frac.scale;
    up = Math.max(up, AXIS * size + FRAC_GAP * size + runExtent(p.frac.num, s).down + 0.75 * s);
    down = Math.max(down, -AXIS * size + FRAC_GAP * size + 0.75 * s + 0.25 * s);
  }
  return { up, down };
}

/** Height of the fraction bar above the baseline, and the gap from bar to num/den, in em. */
const AXIS = 0.27;
const FRAC_GAP = 0.2;

/** Draws a run of glyphs from x on baseline y; `colorOf` picks each glyph's color. */
function drawRun(
  g: CanvasRenderingContext2D,
  run: Glyph[],
  x: number,
  y: number,
  size: number,
  colorOf: (p: Glyph) => string,
): void {
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  let cx = x;
  for (const p of run) {
    cx += p.space * size;
    if (p.frac) {
      const f = p.frac;
      const s = size * f.scale;
      const fw = fracWidth(g, f, size);
      const color = colorOf(p);
      const bar = y - AXIS * size;
      g.fillStyle = color;
      g.fillRect(cx, bar - size * 0.025, fw, size * 0.05);
      const nw = runWidth(g, f.num, s);
      const dw = runWidth(g, f.den, s);
      drawRun(g, f.num, cx + (fw - nw) / 2, bar - FRAC_GAP * size - 0.22 * s, s, () => color);
      drawRun(g, f.den, cx + (fw - dw) / 2, bar + FRAC_GAP * size + 0.72 * s, s, () => color);
      cx += fw;
      continue;
    }
    g.font = fontOf(p, size);
    const w = g.measureText(p.text).width;
    g.fillStyle = colorOf(p);
    g.fillText(p.text, cx, y);
    // Dots centered over the (italic, so slightly right-shifted) letter.
    for (let d = 0; d < p.dots; d++) {
      const r = size * 0.05;
      const sep = size * 0.2;
      const dx = cx + w * 0.62 + (d - (p.dots - 1) / 2) * sep;
      g.beginPath();
      g.arc(dx, y - size * 0.62, r, 0, Math.PI * 2);
      g.fill();
    }
    cx += w;
    if (p.sub || p.sup) {
      g.font = `${size * SUB_SCALE}px KaTeX_Main, serif`;
      if (p.sub) g.fillText(p.sub, cx, y + size * 0.22);
      if (p.sup) g.fillText(p.sup, cx, y - size * 0.4);
      cx += Math.max(scriptWidth(g, p.sub, size), scriptWidth(g, p.sup, size));
      g.font = fontOf(p, size);
    }
  }
}

// ---- Matrix form: M ẍ + K x = 0 ----

/** Row pitch, column gap and parenthesis width of a matrix, in em. */
const ROW = 1.3;
const COL_GAP = 0.8;
const PAREN = 0.5;
/** Space between a parenthesis and the entries, in em. */
const PAREN_PAD = 0.18;
/** Gap between a matrix and its vector, and around operators, in em. */
const TIGHT = 0.12;
const LOOSE = 0.45;

interface Cell {
  run: Glyph[];
  ids: string[];
  /** Structural zero: drawn faint, as in the interactive view. */
  zero: boolean;
}
type Item = { kind: 'matrix'; cells: Cell[][] } | { kind: 'text'; run: Glyph[] };

const glyph = (text: string, font: Glyph['font'] = 'main', extra: Partial<Glyph> = {}): Glyph => ({
  text,
  font,
  dots: 0,
  space: 0,
  ...extra,
});

function matrixItems(m: MatrixOde): Item[] {
  const cell = (e: MatrixEntry): Cell => ({
    run: tokenize(e.latex),
    ids: e.ids,
    zero: e.ids.length === 0,
  });
  const vector = (dots: number): Item => ({
    kind: 'matrix',
    cells: m.M.map((_, i) => [
      { run: [glyph('x', 'math', { dots, sub: `${i + 1}` })], ids: [`x${i + 1}`], zero: false },
    ]),
  });
  return [
    { kind: 'matrix', cells: m.M.map((row) => row.map(cell)) },
    vector(2),
    { kind: 'text', run: [glyph('+')] },
    { kind: 'matrix', cells: m.K.map((row) => row.map(cell)) },
    vector(0),
    { kind: 'text', run: [glyph('=')] },
    { kind: 'text', run: [glyph('0', 'bold')] },
  ];
}

const gapBefore = (prev: Item | undefined, cur: Item) =>
  !prev ? 0 : prev.kind === 'text' || cur.kind === 'text' ? LOOSE : TIGHT;

function columnWidths(g: CanvasRenderingContext2D, cells: Cell[][], size: number): number[] {
  const cols = cells[0]?.length ?? 0;
  return Array.from({ length: cols }, (_, j) =>
    Math.max(...cells.map((row) => runWidth(g, row[j]!.run, size))),
  );
}

function itemWidth(g: CanvasRenderingContext2D, it: Item, size: number): number {
  if (it.kind === 'text') return runWidth(g, it.run, size);
  const cw = columnWidths(g, it.cells, size);
  return (
    cw.reduce((a, b) => a + b, 0) +
    COL_GAP * size * (cw.length - 1) +
    2 * (PAREN + PAREN_PAD) * size
  );
}

function measureMatrix(g: CanvasRenderingContext2D, m: MatrixOde, size: number): number {
  const items = matrixItems(m);
  return items.reduce(
    (w, it, k) => w + gapBefore(items[k - 1], it) * size + itemWidth(g, it, size),
    0,
  );
}

/** A drawn parenthesis spanning [top, bottom] in a box of width w at x; `dir` −1 is "(", +1 is ")". */
function paren(
  g: CanvasRenderingContext2D,
  x: number,
  top: number,
  bottom: number,
  w: number,
  dir: number,
) {
  // Ends on the inner side, the control point beyond the outer side: the curve bulges to
  // x + w/4 (or x + 3w/4) at mid-height.
  const inner = dir < 0 ? x + w : x;
  const control = dir < 0 ? x - w / 2 : x + (3 * w) / 2;
  g.beginPath();
  g.moveTo(inner, top);
  g.quadraticCurveTo(control, (top + bottom) / 2, inner, bottom);
  g.stroke();
}

function drawMatrix(
  g: CanvasRenderingContext2D,
  m: MatrixOde,
  x: number,
  baseline: number,
  size: number,
  color: string,
  highlight: { terms: string[]; color: string } | null,
): void {
  const center = baseline - size * 0.34;
  const items = matrixItems(m);
  let cx = x;
  items.forEach((it, k) => {
    cx += gapBefore(items[k - 1], it) * size;
    if (it.kind === 'text') {
      drawRun(g, it.run, cx, baseline, size, () => color);
      cx += runWidth(g, it.run, size);
      return;
    }
    const rows = it.cells.length;
    const cw = columnWidths(g, it.cells, size);
    const half = (rows * ROW * size) / 2;
    g.strokeStyle = color;
    g.lineWidth = size * 0.055;
    g.lineCap = 'round';
    paren(g, cx, center - half, center + half, PAREN * size, -1);
    let colX = cx + (PAREN + PAREN_PAD) * size;
    cw.forEach((w, j) => {
      it.cells.forEach((row, r) => {
        const c = row[j]!;
        const lit = highlight !== null && c.ids.some((id) => highlight.terms.includes(id));
        const y = center + (r - (rows - 1) / 2) * ROW * size + size * 0.34;
        g.globalAlpha = c.zero ? 0.35 : 1;
        const cellW = runWidth(g, c.run, size);
        drawRun(g, c.run, colX + (w - cellW) / 2, y, size, () => (lit ? highlight.color : color));
        g.globalAlpha = 1;
      });
      colX += w + COL_GAP * size;
    });
    const right = colX - COL_GAP * size + PAREN_PAD * size;
    paren(g, right, center - half, center + half, PAREN * size, 1);
    cx = right + PAREN * size;
  });
}

// ---- Public API ----

/** Width in pixels of the equation at `size`. */
export function measureEquation(
  g: CanvasRenderingContext2D,
  eq: OdeEquation,
  size: number,
): number {
  if (eq.matrix) return measureMatrix(g, eq.matrix, size);
  return runWidth(g, pieces(eq), size);
}

/** Height in pixels of the equation at `size` (taller than one line for matrix forms). */
export function equationHeight(eq: OdeEquation, size: number): number {
  if (eq.matrix) return (eq.matrix.M.length * ROW + 0.2) * size;
  const { up, down } = runExtent(pieces(eq), size);
  // One line of text is `size`; fractions add what sticks out beyond it.
  return Math.max(size, up + down);
}

/** Draws the equation with its left end at x and baseline (of its middle row) at y. */
export function drawEquation(
  g: CanvasRenderingContext2D,
  eq: OdeEquation,
  x: number,
  y: number,
  size: number,
  color: string,
  highlight: { terms: string[]; color: string } | null = null,
): void {
  if (eq.matrix) {
    drawMatrix(g, eq.matrix, x, y, size, color, highlight);
    return;
  }
  drawRun(g, pieces(eq), x, y, size, (p) =>
    (p as Piece).term && highlight?.terms.includes((p as Piece).term!) ? highlight.color : color,
  );
}
