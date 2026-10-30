import katex from 'katex';
import { useEffect, useMemo, useRef, type PointerEvent } from 'react';
import { equationToLatex } from '../models/latex';
import { useT } from '../i18n/useT';
import type { SimController } from '../runtime/SimController';
import { useSimStore } from '../state/simStore';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sim: SimController<any>;
}

/**
 * The equation of motion with the current values, rendered by KaTeX. Every term is tagged with
 * `term--<id>` so hovering it highlights its object and hovering the object highlights it.
 */
export function OdeView({ sim }: Props) {
  const t = useT();
  const params = useSimStore((s) => s.params);
  const highlightId = useSimStore((s) => s.highlightId);

  const termToObject = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of sim.spec.objects) for (const term of o.terms) m.set(term, o.id);
    return m;
  }, [sim]);

  const html = useMemo(() => {
    if (Object.keys(params).length === 0) return '';
    const eq = sim.spec.model.latexODE(params);
    const tex = equationToLatex(eq, (term, l) => `\\htmlClass{term term--${term.id}}{${l}}`);
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode: true,
      strict: false,
      trust: (ctx) => ctx.command === '\\htmlClass',
    });
  }, [sim, params]);

  const badge = sim.spec.badge?.(params) ?? null;
  const lit = sim.spec.objects.find((o) => o.id === highlightId)?.terms ?? [];
  const litKey = lit.join(' ');
  const ref = useRef<HTMLDivElement>(null);

  // Tag the highlighted terms (KaTeX output is plain HTML, so classes are toggled directly).
  useEffect(() => {
    const ids = new Set(litKey.split(' '));
    ref.current?.querySelectorAll<HTMLElement>('.term').forEach((el) => {
      const id = [...el.classList].find((c) => c.startsWith('term--'))?.slice(6);
      el.classList.toggle('term-lit', !!id && ids.has(id));
    });
  }, [litKey, html]);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest('.term');
    const term = el ? [...el.classList].find((c) => c.startsWith('term--'))?.slice(6) : undefined;
    sim.setTermHover((term && termToObject.get(term)) ?? null);
  };

  return (
    <div className="ode" role="figure" aria-label={t('ode.label')} title={t('ode.hint')}>
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
    </div>
  );
}
