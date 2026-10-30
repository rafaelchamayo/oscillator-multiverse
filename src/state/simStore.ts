import { create } from 'zustand';

export type Perspective = 'horizontal' | 'vertical';
export const TRACE_WINDOWS = [4, 8, 16] as const;

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
  setSerious: (v: boolean) => void;
  togglePerspective: () => void;
  setGravity: (v: boolean) => void;
  setChip: (id: string, on: boolean) => void;
  cycleTraceWindow: () => void;
}

export const useSimStore = create<SimUiState>((set) => ({
  running: false,
  speed: 1,
  serious: false,
  perspective: 'horizontal',
  gravity: true,
  chips: {},
  traceWindow: 8,
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
}));
