import type { OdeEquation, OdeTerm } from './types';

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
