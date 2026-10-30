import { useEffect, useRef, useState } from 'react';
import { PointerController } from '../interaction/PointerController';
import type { OscillatorPlugin } from '../oscillators/types';
import { useT } from '../i18n/useT';
import { SimController } from '../runtime/SimController';
import { ObjectPopover } from './ObjectPopover';
import { OdeView } from './OdeView';
import { PlotPanel } from './PlotPanel';
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
  const [sim] = useState(() => new SimController(plugin.sim));
  useShortcuts(sim);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    sim.attach(canvas);
    const pointer = new PointerController(sim, canvas);
    if (import.meta.env.DEV) window.__osc = sim;
    return () => {
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
        <OdeView sim={sim} />
        <ObjectPopover sim={sim} pluginId={plugin.id} />
        <Toolbar sim={sim} />
      </section>
      <PlotPanel sim={sim} />
    </>
  );
}
