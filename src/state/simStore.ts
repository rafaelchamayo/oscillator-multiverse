import { create } from 'zustand';

export type Perspective = 'horizontal' | 'vertical';
export const TRACE_WINDOWS = [4, 8, 16] as const;

/** What presentation mode draws (personality is the global `serious` toggle). */
export interface PresentOptions {
  ode: boolean;
  axes: boolean;
  background: 'solid' | 'gradient';
}

/**
 * Mirror of the active simulation's coarse state for React (toolbar, chips), plus view
 * options the controller reads every frame. Per-frame data never goes through React.
 */
interface SimUiState {
  running: boolean;
  speed: number;
  serious: boolean;
  perspective: Perspective;
  /** Gravity in the vertical view (always off in the horizontal one). */
  gravity: boolean;
  /** Visible plots, by chip id. */
  chips: Record<string, boolean>;
  /** Seconds of history shown by the trace and the time plots. */
  traceWindow: number;
  /** Scene object under the canvas pointer (drives the popover). */
  hoverId: string | null;
  /** Object highlighted everywhere (canvas glow + ODE terms), from any source. */
  highlightId: string | null;
  /** Snapshot of the model parameters, refreshed when they change (ODE, sliders). */
  params: Record<string, number>;
  /** Presentation mode (1920×1080 stage, no UI) and its options. */
  presenting: boolean;
  present: PresentOptions;
  /** A WebM recording of the presentation canvas is in progress. */
  recording: boolean;
  /** Keyboard shortcuts dialog. */
  helpOpen: boolean;
  setSerious: (v: boolean) => void;
  togglePerspective: () => void;
  setGravity: (v: boolean) => void;
  setChip: (id: string, on: boolean) => void;
  cycleTraceWindow: () => void;
  setPresenting: (v: boolean) => void;
  setPresent: (o: Partial<PresentOptions>) => void;
  setHelpOpen: (v: boolean) => void;
}

export const useSimStore = create<SimUiState>((set) => ({
  running: false,
  speed: 1,
  serious: false,
  perspective: 'horizontal',
  gravity: true,
  chips: {},
  traceWindow: 8,
  hoverId: null,
  highlightId: null,
  params: {},
  presenting: false,
  present: { ode: true, axes: true, background: 'gradient' },
  recording: false,
  helpOpen: false,
  setSerious: (serious) => set({ serious }),
  togglePerspective: () =>
    set((s) => ({
      perspective: s.perspective === 'horizontal' ? 'vertical' : 'horizontal',
      // Gravity comes back on by default every time we enter the vertical view.
      gravity: s.perspective === 'horizontal' ? true : s.gravity,
    })),
  setGravity: (gravity) => set({ gravity }),
  setChip: (id, on) => set((s) => ({ chips: { ...s.chips, [id]: on } })),
  cycleTraceWindow: () =>
    set((s) => {
      const i = TRACE_WINDOWS.indexOf(s.traceWindow as (typeof TRACE_WINDOWS)[number]);
      return { traceWindow: TRACE_WINDOWS[(i + 1) % TRACE_WINDOWS.length]! };
    }),
  setPresenting: (presenting) => set({ presenting }),
  setPresent: (o) => set((s) => ({ present: { ...s.present, ...o } })),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
}));
