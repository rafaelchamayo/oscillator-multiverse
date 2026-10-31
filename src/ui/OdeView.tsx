import katex from 'katex';
import { useEffect, useLayoutEffect, useMemo, useRef, type PointerEvent } from 'react';
import { equationToLatex, matrixToLatex } from '../models/latex';
import { useT } from '../i18n/useT';
import type { SimController } from '../runtime/SimController';
import { useSimStore } from '../state/simStore';
import { ChevronDownIcon, ChevronUpIcon } from './icons';

/** Natural font size of the equation (px); it shrinks to fit narrow stages. */
const ODE_FONT = 19;
const MIN_FONT = 10;
/** Tallest the pill may get (px): a 5 × 5 matrix form shrinks to fit. */
const MAX_HEIGHT = 150;

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sim: SimController<any>;
}

/**
 * The equation of motion with the current values, rendered by KaTeX. Every term is tagged with
 * `term--<id>` so hovering it highlights its object and hovering the object highlights it.
 * It scales down with the stage so it never covers the clock, and can be collapsed (E).
 */
export function OdeView({ sim }: Props) {
  const t = useT();
  const params = useSimStore((s) => s.params);
  const highlightId = useSimStore((s) => s.highlightId);
  const hidden = useSimStore((s) => s.odeHidden);
  const setHidden = useSimStore((s) => s.setOdeHidden);

  const termToObject = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of sim.spec.objects) for (const term of o.terms) m.set(term, o.id);
    return m;
  }, [sim]);

  const html = useMemo(() => {
    // Before the store has the params (a model without any, like the quantum one, needs none).
    const ready = Object.keys(sim.spec.defaultParams as object).every((k) => k in params);
    if (!ready) return '';
    const eq = sim.spec.model.latexODE(params);
    const tex = eq.matrix
      ? matrixToLatex(eq.matrix, (ids, l) =>
          ids.length
            ? `\\htmlClass{term ${ids.map((id) => `term--${id}`).join(' ')}}{${l}}`
            : `\\htmlClass{term-zero}{${l}}`,
        )
      : equationToLatex(eq, (term, l) => `\\htmlClass{term term--${term.id}}{${l}}`);
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode: true,
      strict: false,
      trust: (ctx) => ctx.command === '\\htmlClass',
    });
  }, [sim, params]);

  const badge = useSimStore((s) => s.badge);
  const lit = sim.spec.objects.find((o) => o.id === highlightId)?.terms ?? [];
  const litKey = lit.join(' ');
  const ref = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);

  // Fit the pill to its row (.stage-top keeps clear of the clock and the energy bar) and to
  // MAX_HEIGHT. Everything inside is sized in em, so its size is proportional to the font size.
  useLayoutEffect(() => {
    const el = pill.current;
    const row = el?.parentElement;
    if (!el || !row) return;
    const fit = () => {
      el.style.fontSize = `${ODE_FONT}px`;
      const avail = row.clientWidth;
      const k = Math.min(1, avail / el.offsetWidth, MAX_HEIGHT / el.offsetHeight);
      el.style.fontSize = `${Math.max(MIN_FONT, ODE_FONT * k)}px`;
    };
    fit();
    // Only width changes matter; refitting changes the row's height, which must not loop.
    let lastWidth = row.clientWidth;
    const ro = new ResizeObserver(() => {
      if (row.clientWidth === lastWidth) return;
      lastWidth = row.clientWidth;
      fit();
    });
    ro.observe(row);
    return () => ro.disconnect();
  }, [html, badge?.key, hidden]);

  // Tag the highlighted terms (KaTeX output is plain HTML, so classes are toggled directly).
  useEffect(() => {
    const ids = new Set(litKey.split(' '));
    ref.current?.querySelectorAll<HTMLElement>('.term').forEach((el) => {
      // A matrix entry belongs to every object that contributes to it.
      const lit = [...el.classList].some((c) => c.startsWith('term--') && ids.has(c.slice(6)));
      el.classList.toggle('term-lit', lit);
    });
  }, [litKey, html]);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest('.term');
    const term = el ? [...el.classList].find((c) => c.startsWith('term--'))?.slice(6) : undefined;
    sim.setTermHover((term && termToObject.get(term)) ?? null);
  };

  if (hidden) {
    return (
      <button
        type="button"
        className="ode-show"
        data-testid="ode-show"
        aria-label={t('ode.show')}
        title={t('ode.show')}
        onClick={() => setHidden(false)}
      >
        {t('present.ode')}
        <ChevronDownIcon />
      </button>
    );
  }

  return (
    <div className="ode" ref={pill} role="figure" aria-label={t('ode.label')} title={t('ode.hint')}>
      <div
        className="ode__math"
        data-testid="ode"
        ref={ref}
        data-lit={litKey}
        onPointerMove={onMove}
        onPointerLeave={() => sim.setTermHover(null)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {badge && (
        <span className={`ode__badge ode__badge--${badge.tone}`} data-testid="regime">
          {t(badge.key)}
        </span>
      )}
      <button
        type="button"
        className="ode__hide"
        data-testid="ode-hide"
        aria-label={t('ode.hide')}
        title={t('ode.hide')}
        onClick={() => setHidden(true)}
      >
        <ChevronUpIcon />
      </button>
    </div>
  );
}
