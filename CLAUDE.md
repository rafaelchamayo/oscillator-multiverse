# Oscillator Multiverse

Interactive, game-like simulations of oscillators for first-year university students and YouTube videos.
Spec: `prompt_claude_code_oscillator_multiverse.md`. Decisions log: `DECISIONS.md`.

## Commands

- `npm run dev` — Vite dev server (http://localhost:5173)
- `npm test` — Vitest (physics + unit tests, `src/**/*.test.ts`)
- `npm run e2e` — Playwright (starts dev server itself); `npm run screenshots` → `e2e/screenshots/*.png`
- `npm run lint` — ESLint + `tsc` type-check; `npm run format` — Prettier
- `npm run build` / `npm run preview` — static build in `dist/` (`BASE_PATH=/repo/` for GitHub Pages)

## Architecture (strict separation: physics / scene / plots / UI)

1. `src/core/` — integrators (RK4), fixed-step `SimulationLoop` with accumulator, ring buffers, units.
2. `src/models/` — pure physics, no DOM. `Model<S,P>` never assumes state is (x, v); `odeModel()` adapts ODEs to RK4.
3. `src/oscillators/<id>/` — one plugin per tab: model + scene + interactive objects + plots + presets + i18n.
4. `src/oscillators/registry.ts` — tab order; registering a plugin also merges its texts under `osc.<id>`.
5. `src/render/` — Canvas 2D primitives (`scene/`), plots (`plots/`), design tokens (`theme.ts`).
6. `src/interaction/` — drag, fling, grab, hover, zoom/pan (pointer → scene coordinates).
7. `src/ui/` — React shell: header, tabs, toolbar, popovers (the only place sliders exist).
8. `src/i18n/` — `es.json`/`en.json`, `useT()`; core keys are type-checked.
9. `src/state/uiStore.ts` — Zustand, UI state only. Per-frame sim state lives in a mutable controller.
10. `src/presentation/` — 1920×1080 presentation stage and WebM recording.

## Conventions

- Code, identifiers and comments in English; every UI string goes through i18n (es + en; a test checks parity).
- Physics is tested numerically (see spec §8). Never close a phase with red tests.
- Hash routing (`#/<plugin-id>`) for GitHub Pages.
- Colors/fonts only from `theme.ts` (CSS reads them as `--c-*`, `--f-*`, `--r-*`).
- Tests reach into canvas state via `window.__osc` (dev/test only).
- Git: local commits per phase, no AI attribution in messages; the owner pushes.

## Adding an oscillator

(Completed in Phase 4 with the SHO as the worked example.)

1. Create `src/oscillators/<id>/` with `index.ts` exporting an `OscillatorPlugin` and `i18n/{es,en}.json`
   (`title`, `short`, `tagline` at minimum).
2. Add one line `registerPlugin(<yourPlugin>)` in `src/oscillators/registry.ts`.

## Phase status

- [x] Phase 0 — Scaffolding (Vite/React/TS, lint, Vitest, Playwright, theme, tabs, i18n ES/EN)
- [ ] Phase 1 — Physics core
- [ ] Phase 2 — SHO scene
- [ ] Phase 3 — Trace and plots
- [ ] Phase 4 — Hover, popovers, ODE
- [ ] Phase 5 — Damped driven oscillator
- [ ] Phase 6 — Presentation mode and polish
