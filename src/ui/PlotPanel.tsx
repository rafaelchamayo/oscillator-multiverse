import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useT } from '../i18n/useT';
import type { ChipDef, PanelDef } from '../oscillators/types';
import type { SimController } from '../runtime/SimController';
import { useSimStore } from '../state/simStore';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sim: SimController<any>;
}

/** Dark side panel: plot chips on top, then the plots whose chips are on, stacked. */
export function PlotPanel({ sim }: Props) {
  const t = useT();
  const chips = useSimStore((s) => s.chips);
  const traceWindow = useSimStore((s) => s.traceWindow);
  const cycleTraceWindow = useSimStore((s) => s.cycleTraceWindow);
  const visible = sim.spec.panels.filter((p) => p.chips.some((c) => chips[c]));
  const plotChips = sim.spec.chips.filter((c) => c.group !== 'vectors');
  const vectorChips = sim.spec.chips.filter((c) => c.group === 'vectors');

  return (
    <aside className="side-panel plots" aria-label={t('plots.label')}>
      <div className="plots__bar">
        <div className="plots__chips" role="group" aria-label={t('plots.label')}>
          {plotChips.map((c) => (
            <Chip key={c.id} chip={c} on={!!chips[c.id]} />
          ))}
        </div>
        <button
          type="button"
          className="plots__window"
          data-testid="trace-window"
          aria-label={t('toolbar.window', { s: traceWindow })}
          title={t('toolbar.window', { s: traceWindow })}
          onClick={cycleTraceWindow}
        >
          {t('plots.window', { s: traceWindow })}
        </button>
      </div>
      {vectorChips.length > 0 && (
        <div className="plots__vectors" role="group" aria-label={t('plots.vectors')}>
          <span className="plots__group-label">{t('plots.vectors')}</span>
          {vectorChips.map((c) => (
            <Chip key={c.id} chip={c} on={!!chips[c.id]} />
          ))}
        </div>
      )}
      <div className="plots__stack">
        {visible.length === 0 && <p className="plots__empty">{t('plots.empty')}</p>}
        {visible.map((p) => (
          <PlotCard key={p.id} sim={sim} panel={p} />
        ))}
      </div>
    </aside>
  );
}

function Chip({ chip, on }: { chip: ChipDef; on: boolean }) {
  const t = useT();
  const setChip = useSimStore((s) => s.setChip);
  return (
    <button
      type="button"
      className="chip"
      data-testid={`chip-${chip.id}`}
      aria-pressed={on}
      onClick={() => setChip(chip.id, !on)}
      style={{ ['--chip' as string]: chip.color }}
    >
      <span className="chip__dot" aria-hidden />
      {t(chip.labelKey)}
    </button>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PlotCard({ sim, panel }: { sim: SimController<any>; panel: PanelDef }) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const plot = useMemo(() => panel.create(sim.extras), [sim, panel]);
  // Action buttons reflect state that changes on its own (an automatic sweep ends): poll it.
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!panel.actions?.some((a) => a.active)) return;
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [panel]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    return sim.registerPlot(panel.id, c, plot);
  }, [sim, panel.id, plot]);

  return (
    <section
      className="plot-card"
      data-testid={`panel-${panel.id}`}
      style={{ flexGrow: panel.weight ?? 1 }}
    >
      <div className="plot-card__head">
        <h2 className="plot-card__title">{t(panel.titleKey)}</h2>
        {panel.actions?.map((a) => (
          <button
            key={a.id}
            type="button"
            className="plot-card__action"
            data-testid={`action-${a.id}`}
            aria-pressed={a.active ? a.active(sim.extras) : undefined}
            onClick={() => {
              a.run(sim.extras, sim.params);
              tick();
            }}
          >
            {t(a.labelKey)}
          </button>
        ))}
      </div>
      <canvas ref={ref} className="plot-card__canvas" />
    </section>
  );
}
