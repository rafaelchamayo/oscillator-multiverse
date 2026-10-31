import { useEffect, useRef, useState } from 'react';
import { PointerController } from '../interaction/PointerController';
import type { OscillatorPlugin } from '../oscillators/types';
import { useT } from '../i18n/useT';
import { SimController } from '../runtime/SimController';
import { useSimStore } from '../state/simStore';
import { CountStepper } from './CountStepper';
import { ObjectPopover } from './ObjectPopover';
import { OdeView } from './OdeView';
import { PlotPanel } from './PlotPanel';
import { PresentationStage } from './PresentationStage';
import { Presets } from './Presets';
import { ShortcutsHelp } from './ShortcutsHelp';
import { Toolbar } from './Toolbar';
import { useShortcuts } from './useShortcuts';

declare global {
  interface Window {
    /** Dev/test-only debug handle used by Playwright. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __osc?: SimController<any>;
  }
}

interface Props {
  plugin: OscillatorPlugin & { sim: NonNullable<OscillatorPlugin['sim']> };
}

export function SimStage({ plugin }: Props) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [sim] = useState(() => new SimController(plugin.sim, plugin.id));
  const presenting = useSimStore((s) => s.presenting);
  useShortcuts(sim);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Presentation never survives a tab switch: the stage canvas must attach first.
    useSimStore.getState().setPresenting(false);
    sim.attach(canvas);
    const pointer = new PointerController(sim, canvas);
    if (import.meta.env.DEV) window.__osc = sim;
    // The scene is framed below the ODE and the rows under it, whatever their height.
    const top = topRef.current;
    const ro = top
      ? new ResizeObserver(() => sim.setTopInset(top.offsetTop + top.offsetHeight + 8))
      : null;
    if (top) ro?.observe(top);
    return () => {
      ro?.disconnect();
      pointer.dispose();
      sim.detach();
      if (window.__osc === sim) delete window.__osc;
    };
  }, [sim]);

  return (
    <>
      <section className="stage stage--sim">
        <h1 className="sr-only">{t(`osc.${plugin.id}.title`)}</h1>
        <canvas ref={canvasRef} className="stage__canvas" data-testid="stage-canvas" />
        <div className="stage-top" ref={topRef}>
          <OdeView sim={sim} />
          <CountStepper sim={sim} />
          <Presets sim={sim} />
        </div>
        <ObjectPopover sim={sim} pluginId={plugin.id} />
        <Toolbar sim={sim} />
      </section>
      <PlotPanel sim={sim} />
      {presenting && <PresentationStage sim={sim} />}
      <ShortcutsHelp />
    </>
  );
}
