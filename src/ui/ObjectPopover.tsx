import { useEffect, useRef, useState } from 'react';
import { formatNumber } from '../core/units';
import { useT } from '../i18n/useT';
import type { ObjectDef, ParamDef } from '../oscillators/types';
import type { SimController } from '../runtime/SimController';
import { useSimStore } from '../state/simStore';

/** Time the popover waits after the pointer leaves its object, so it can be reached. */
const CLOSE_DELAY = 350;

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sim: SimController<any>;
  pluginId: string;
}

/**
 * Popover for the hovered scene object: what it is physically and, when it has parameters,
 * its sliders. The controller positions it next to the object every frame.
 */
export function ObjectPopover({ sim, pluginId }: Props) {
  const t = useT();
  const hoverId = useSimStore((s) => s.hoverId);
  const [shown, setShown] = useState<string | null>(null);
  const inside = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hoverId) {
      if (!inside.current) setShown(hoverId);
      return;
    }
    const id = window.setTimeout(() => {
      if (!inside.current) setShown(null);
    }, CLOSE_DELAY);
    return () => window.clearTimeout(id);
  }, [hoverId]);

  useEffect(() => {
    sim.setPopover(shown, ref.current);
    return () => sim.setPopover(null, null);
  }, [sim, shown]);

  const obj = sim.spec.objects.find((o) => o.id === shown);
  if (!obj) return null;
  const base = `osc.${pluginId}.objects.${obj.id}` as const;

  return (
    <div
      ref={ref}
      className="popover"
      role="dialog"
      aria-label={t(`${base}.title`)}
      data-testid={`popover-${obj.id}`}
      style={{ visibility: 'hidden' }}
      onPointerEnter={() => (inside.current = true)}
      onPointerLeave={() => {
        inside.current = false;
        if (!useSimStore.getState().hoverId) setShown(null);
      }}
    >
      <h2 className="popover__title">{t(`${base}.title`)}</h2>
      <p className="popover__desc">{t(`${base}.desc`)}</p>
      {obj.params.map((p) => (
        <ParamSlider key={p.key} sim={sim} pluginId={pluginId} def={p} />
      ))}
      <Info obj={obj} />
    </div>
  );
}

function Info({ obj }: { obj: ObjectDef }) {
  const t = useT();
  const params = useSimStore((s) => s.params);
  if (!obj.info) return null;
  return <p className="popover__info">{t(obj.info.key, obj.info.vars(params))}</p>;
}

function ParamSlider({
  sim,
  pluginId,
  def,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sim: SimController<any>;
  pluginId: string;
  def: ParamDef;
}) {
  const t = useT();
  const stored = useSimStore((s) => s.params[def.key]) ?? def.min;
  const live = useLiveState(sim, def.state?.get);
  const value = def.state ? live : stored;
  const id = `param-${def.key}`;
  const fill = ((value - def.min) / (def.max - def.min)) * 100;
  const params = useSimStore((s) => s.params);
  const equal = def.group?.every((k) => params[k] === value) ?? true;
  return (
    <div className="param">
      <label className="param__label" htmlFor={id}>
        <span className="param__symbol">{def.symbol}</span>
        <span className="param__name">{t(`osc.${pluginId}.params.${def.key}`)}</span>
        <output className="param__value" htmlFor={id}>
          {formatNumber(value, def.digits)} {def.unit}
        </output>
      </label>
      <input
        id={id}
        className="param__slider"
        data-testid={id}
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        style={{ ['--fill' as string]: `${fill}%` }}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (def.state) sim.editState((s) => def.state!.set(s, v));
          else sim.setParam(def.key, v);
        }}
      />
      {def.group && (
        <button
          type="button"
          className="param__equalize"
          data-testid={`equalize-${def.key}`}
          disabled={equal}
          onClick={() => sim.setParams(def.group!, value)}
        >
          {t('popover.equalize', { value: `${formatNumber(value, def.digits)} ${def.unit}` })}
        </button>
      )}
    </div>
  );
}

/** A value read from the simulation state on every animation frame (state-backed sliders). */
function useLiveState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sim: SimController<any>,
  get: ((state: Float64Array) => number) | undefined,
): number {
  const [value, setValue] = useState(() => (get ? get(sim.state) : 0));
  useEffect(() => {
    if (!get) return;
    let id = 0;
    const tick = () => {
      setValue(get(sim.state));
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [sim, get]);
  return value;
}
