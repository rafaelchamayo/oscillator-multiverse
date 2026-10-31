import type { MatrixEntry, MatrixOde, OdeEquation, OdeTerm } from './types';

/**
 * Formats a coefficient for the live ODE: two decimals with trailing zeros trimmed,
 * keeping at least one (2 → "2.0", 0.25 → "0.25", 12.5 → "12.5").
 */
export function fmtCoef(v: number): string {
  const s = Math.abs(v).toFixed(2).replace(/0$/, '');
  return s;
}

export type TermWrapper = (term: OdeTerm, latex: string) => string;

function side(terms: OdeTerm[], wrap: TermWrapper): string {
  if (terms.length === 0) return '0';
  return terms
    .map((term, i) => {
      const body = wrap(term, term.latex);
      if (i === 0) return term.sign < 0 ? `-${body}` : body;
      return `${term.sign < 0 ? '-' : '+'} ${body}`;
    })
    .join(' ');
}

/** Builds the LaTeX string; `wrap` lets the UI tag each term (e.g. `\htmlClass`). */
export function equationToLatex(eq: OdeEquation, wrap: TermWrapper = (_, l) => l): string {
  return `${side(eq.lhs, wrap)} = ${side(eq.rhs, wrap)}`;
}

/** Wraps an entry tagged with several term ids (the UI uses `\htmlClass`). */
export type IdsWrapper = (ids: string[], latex: string) => string;

/**
 * M ẍ + K x = 0 written out with the matrices' values and the vectors of the n bodies; every
 * entry (and xᵢ, tagged `x{i}`) goes through `wrap`.
 */
export function matrixToLatex(m: MatrixOde, wrap: IdsWrapper = (_, l) => l): string {
  const n = m.M.length;
  const matrix = (rows: MatrixEntry[][]) =>
    `\\begin{pmatrix}${rows.map((r) => r.map((e) => wrap(e.ids, e.latex)).join(' & ')).join(' \\\\ ')}\\end{pmatrix}`;
  const vector = (dots: string) =>
    `\\begin{pmatrix}${Array.from({ length: n }, (_, i) => wrap([`x${i + 1}`], `${dots}x_{${i + 1}}`)).join(' \\\\ ')}\\end{pmatrix}`;
  return `${matrix(m.M)}${vector('\\ddot ')} + ${matrix(m.K)}${vector('')} = \\mathbf{0}`;
}
