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
10. `src/presentation/` — 1920×1080 presentation layout (`compose.ts`), canvas ODE renderer, WebM `Recorder`.
11. `src/runtime/SimController.ts` — binds a plugin's model + `SimulationLoop` + scene + `ViewTransform` to a canvas and runs rAF.

Multi-body tabs: `Kinematic` methods take a body index, hits carry `body`, and the scene maps a body's
displacement to scene u with `bodyU` and keeps bodies apart with `constrain` (see `src/oscillators/coupled/`).

Scene coordinates are meters: u along the oscillation, w across it (+w is down at angle 0). Physical objects
size with `f.ppx` (magnify with zoom); handles/labels with `f.px` (constant on screen). Upright text goes in
`drawOverlay` (CSS pixels).

Plots: a plugin's `sim` declares `historyKeys`, `chips` and `panels` (each panel = a `Plot` from
`src/render/plots/`, shown while any of its chips is on). `SimController` samples a `History` on every step and
draws registered plot canvases each frame. A `SeriesDef.when(params)` hides series that do
not apply (e.g. x₄ with three bodies), and `SeriesDef.ref` adds a dashed reference line.
Plots of the state itself (quantum spectrum, Wigner) read `PlotCtx.state`. Gravity changes go through `spec.setGravity` + `spec.equilibrium`.

## Conventions

- Code, identifiers and comments in English; every UI string goes through i18n (es + en; a test checks parity).
- Physics is tested numerically (see spec §8). Never close a phase with red tests.
- Hash routing (`#/<plugin-id>`) for GitHub Pages.
- Colors/fonts only from `theme.ts` (CSS reads them as `--c-*`, `--f-*`, `--r-*`). Light paper theme for the
  app and stage, dark panel for plots; no faces on objects.
- Tests reach into canvas state via `window.__osc` (dev/test only): `debug()`, `pageCoords(u, w)`, and the
  controller methods (`setPausedState`, `play`...) for screenshot setups.
- Timing-sensitive gestures (fling) are dispatched inside the page in e2e tests; Playwright's own latency can
  look like "released still". Check flakiness with `npx playwright test --repeat-each=5`.
- Models step state **in place** with preallocated buffers: no allocation in the hot loop.
- Physics tests run at the slider extremes (`SHO_RANGES`, `DD_RANGES`); widen a range → the tests cover it.
- Shared test helpers (`simulate`, `fitSinusoid`) live in `src/test/sim.ts`.
- Git: local commits per phase, no AI attribution in messages; the owner pushes.

## Adding an oscillator

The SHO (`src/oscillators/sho/`) is the worked example.

1. Write the physics in `src/models/<id>/model.ts` (an `odeModel` + `mechanicalKinematic` for a 1-DOF body)
   with numerical tests next to it.
2. Create `src/oscillators/<id>/` with `i18n/{es,en}.json` (`title`, `short`, `tagline` at minimum),
   `scene.ts` (a `MechanicalScene`: bounds, update, draw, drawOverlay, hit, clampX, velocityFromHandle) and
   `index.ts` exporting an `OscillatorPlugin` whose `sim` names the model, defaults, `createScene`, the
   hoverable `objects` (ODE terms + sliders; texts at `objects.<id>.{title,desc}` in the plugin i18n), the
   `historyKeys`, `chips` and `panels`. The scene's `hit` ids must match the object ids, and `objectBox`
   tells the popover where the object is.
   See `src/oscillators/sho/` (plain) and `src/oscillators/damped-driven/` (extra scene parts, force
   vectors, presets, badge, `createExtras` for the resonance sweep). Spring-block tabs build their scene with
   `createSpringBlockScene` (`src/oscillators/shared/`); reuse primitives from `src/render/scene/`.
3. Add one line `registerPlugin(<yourPlugin>)` in `src/oscillators/registry.ts`.

## Phase status

- [x] Phase 0 — Scaffolding (Vite/React/TS, lint, Vitest, Playwright, theme, tabs, i18n ES/EN)
- [x] Phase 1 — Physics core (Model/odeModel, RK4, SimulationLoop, SHO + damped-driven, §8 tests)
- [x] Phase 2 — SHO scene (metal block with squash & stretch, helix spring, drag/fling/grab, v₀ arrow, toolbar, zoom/pan; light sketchbook theme)
- [x] Phase 3 — Trace and plots (paper trace, side-panel plots with chips, vertical view + gravity)
- [x] Phase 4 — Hover, popovers, ODE (object popovers with the only sliders, live KaTeX ODE, term↔object highlight)
- [x] Phase 5 — Damped driven oscillator (dashpot, crank motor, force vectors, regime badge, steady/transient, resonance sweep, presets)
- [x] Phase 6 — Presentation mode and polish (P: 1920×1080 canvas with options, G: frame-locked WebM recording, `?` shortcuts help)

Coupled oscillators tab (N = 2…5 masses between two walls; plan in DECISIONS.md):

- [x] C1 — Physics (chain model, Jacobi normal modes, modal coordinates, matrix ODE, numerical tests)
- [x] C2 — Multi-body runtime (body index in Kinematic/hold/hit, initial state snapshot, collisions)
- [x] C3 — Scene and UI (N selector, popovers, matrix ODE, mode presets, N traces, energy bar)
- [x] C4 — Plots and presentation (energy per mass, normal coordinates, mode shapes, configuration space)

Quantum harmonic oscillator 1D tab (superpositions of eigenstates, natural units ħ = m = ω = 1; plan in DECISIONS.md):

- [x] Q1 — Physics (Hermite basis, exact evolution, coherent/cat states, ladder observables, Wigner function, tests)
- [x] Q2 — Runtime + placeholder (custom drag handles, `editState`, `PlotCtx.state`, minimal tab)
- [x] Q3 — Scene and interaction (levels, domain coloring, phasor wheels, packet fling, classical overlay, carpet, presets)
- [x] Q4 — Plots and presentation (spectrum, ⟨x⟩/⟨p⟩, uncertainty, phase plot, Wigner, canvas Schrödinger)
