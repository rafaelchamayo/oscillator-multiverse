import type { OdeEquation, OdeTerm } from '../models/types';

/**
 * Minimal canvas renderer for our ODEs, so presentation mode can draw (and record) them:
 * `captureStream()` only sees the canvas, not KaTeX's DOM. It understands the subset our
 * models emit: numbers, letters, `\dot x`, `\ddot x`, `\,`, `\cdot`, `\cos`, parentheses,
 * and uses KaTeX's own fonts so it looks like the interactive view.
 */
interface Glyph {
  text: string;
  font: 'math' | 'main';
  /** Dots above (time derivatives). */
  dots: number;
  /** Extra space before, in em. */
  space: number;
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
    if ((m = rest.match(/^\\(d+)ot\s*\{?\s*([a-zA-Z])\}?/))) {
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
  p.font === 'math' ? `italic ${size}px KaTeX_Math, serif` : `${size}px KaTeX_Main, serif`;

/** Width in pixels of the equation at `size`. */
export function measureEquation(
  g: CanvasRenderingContext2D,
  eq: OdeEquation,
  size: number,
): number {
  let w = 0;
  for (const p of pieces(eq)) {
    g.font = fontOf(p, size);
    w += p.space * size + g.measureText(p.text).width;
  }
  return w;
}

/** Draws the equation with its left end at x and baseline at y. */
export function drawEquation(
  g: CanvasRenderingContext2D,
  eq: OdeEquation,
  x: number,
  y: number,
  size: number,
  color: string,
  highlight: { terms: string[]; color: string } | null = null,
): void {
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  let cx = x;
  for (const p of pieces(eq)) {
    cx += p.space * size;
    g.font = fontOf(p, size);
    const w = g.measureText(p.text).width;
    g.fillStyle = p.term && highlight?.terms.includes(p.term) ? highlight.color : color;
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
  }
}
