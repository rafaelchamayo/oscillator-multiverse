import { useEffect, useMemo, useRef } from 'react';
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

  return (
    <aside className="side-panel plots" aria-label={t('plots.label')}>
      <div className="plots__bar">
        <div className="plots__chips" role="group" aria-label={t('plots.label')}>
          {sim.spec.chips.map((c) => (
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
  const plot = useMemo(() => panel.create(), [panel]);

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
      <h2 className="plot-card__title">{t(panel.titleKey)}</h2>
      <canvas ref={ref} className="plot-card__canvas" />
    </section>
  );
}
