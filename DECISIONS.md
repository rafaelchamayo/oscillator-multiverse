# Decisions

Minor, reversible decisions taken during implementation, and why.

## Phase 0

- **Hash routing, hand-rolled** (`useHashRoute`, ~20 lines) instead of react-router: GitHub Pages has no SPA
  fallback and two/three tabs don't justify a dependency.
- **Self-hosted fonts via `@fontsource`** (Fredoka, Inter, JetBrains Mono): works offline and lets the canvas
  wait on `document.fonts` before drawing text.
- **Theme tokens in TS** (`src/render/theme.ts`) and exposed to CSS as custom properties, so canvas and DOM
  share one palette.
- **i18n**: core keys are type-checked from `en.json`; plugin texts are merged under `osc.<id>.*` at
  registration, so adding an oscillator needs no change to the core dictionaries. Missing keys fall back
  to Spanish, then to the key itself. Default language: saved choice, else browser language, else Spanish.
- **Vite `base`** is `./` by default, overridable with `BASE_PATH` (used by the Pages workflow).

## Phase 1

- **Time as an integer step count** (t = n·dt, dt = 1/600 s) so simulated time never drifts; the accumulator
  is measured in steps. Frames longer than 0.1 s (background tab) are clamped.
- **`advanceFrame()`** advances exactly 1/60 s × speed per frame, used for deterministic recording.
- **Holding the block** (`hold`/`release`): integration is suspended and each step interpolates linearly to
  the latest pointer position, so time and traces keep a smooth, uniformly sampled flow; samples are flagged
  `manual`. W_in/W_diss are not accumulated while held (the hand's work is not part of the model).
- **Slider ranges** (kg, N/m, N·s/m, N, rad/s): m ∈ [0.2, 5], k ∈ [1, 50], b ∈ [0, 20], F₀ ∈ [0, 20],
  ω ∈ [0.1, 15]. The stiffest case (ω₀ ≈ 15.8 rad/s) still gives RK4 error ≈ 2.5e-7 < 1e-6 over 10 periods.
- **Energy drift test** measures E − E_min (the oscillation energy) so it stays meaningful with gravity,
  where E itself can be near zero.
- **Regime badge** treats |γ − ω₀| ≤ 0.1% ω₀ as critical; the analytic solution uses the exact regime.
- **ODE coefficients** are shown with two decimals, trailing zeros trimmed but at least one kept
  (2 → `2.0`, 0.25 → `0.25`). Gravity appears as `− m·g` with both values (e.g. `−2.0·9.81`).
- **Phase φ** is the lag of the response behind the drive, x_ss = x_eq + A cos(ωt − φ), φ ∈ [0, π].

## Phase 2

- **Scene layout (meters)**: wall face at u = −1.35, block center at u = x, spring from the wall to the
  block's face. The block's side is 0.34 m·√(m/2 kg) (area ∝ m), so the drawn rest length shortens slightly
  as m grows; the wall never moves. x is clamped so the spring keeps ≥ 0.16 m and x ≤ 1.5 m.
- **Spring look**: 10–22 coils and a 2–6.5 px wire, both increasing linearly with k over its slider range.
  Each coil is a side-viewed circle (prolate cycloid), back strands darker, so compression is real.
- **Zoom magnifies physical objects** (spring wire, wall, block outline); handles and labels keep their
  screen size.
- **Fling**: least-squares slope of the pointer over the last 80 ms; a release counts as a fling above
  0.25 m/s (real time). The resulting v₀ is divided by the sim speed so the block leaves the hand at the speed
  it is seen moving, and is capped at ±4 m/s. Releasing still keeps the arrow's v₀ (paused) or 0 (running).
- **Editing while paused** (drag x₀ or the arrow) also sets the initial conditions that Reset restores.
  Reset goes back to t = 0 and pauses.
- **Velocity arrow**: starts at the block face, 0.22 m per m/s, editable (with a handle) only while paused;
  while running it shows the live v, dimmed.
- **Personality** (revised after review, see below): stretch along the motion when fast and squash at
  turning points, driven by an under-damped spring so it wobbles like jelly (up to ~±30%, area-preserving,
  anchored on the floor contact — the physical position and hit box never change); star particles on
  fling; "wheee!" while held. Only real motion deforms the block (a paused block with a v₀ set is at rest).
  Particles use a seeded generator so recordings are reproducible. "Serious mode" turns all of it off.
- **Wheel = zoom** (mouse wheel and trackpad pinch, centered on the cursor); background drag pans;
  double-click on empty background resets the view (a toolbar button does too).

## Phase 2 revision (owner's sketch)

- **Light "sketchbook" theme replaces the spec's dark theme**, at the owner's request: ivory paper, 2 px ink
  outlines, one strong blue (`#1F63F2`) for the spring, velocity and active controls. The plots panel stays
  dark (a "display" next to the drawing). Hover highlight is pink (`#E8338F`). Brand title in Inter bold
  with "Multiverse" muted; Fredoka is kept only for the playful "wheee!".
- **No face and no "m" on the block**: it is a brushed-metal block with chamfered corners and a bevel.
- **The block rests on the floor** (w = 0.30 m), so its center and the spring axis sit at 0.30 − side/2;
  the wall stands on the same floor. A blue tick on the floor marks the block's position, a dashed one the
  equilibrium.
- **Callouts**: v₀ (above the block) and x₀ (below the floor mark) are dark tags with a leader line.
- **Spring** is drawn thick (5–11 px) and attaches to the drawn, squashed face so it never cuts into the
  block.
- The speed button keeps cycling (no dropdown) as the spec asks.

## Phase 3 — Trace and plots

- **Vertical perspective** (implemented as planned): a pure −90° rotation animated over 600 ms (ease-in-out);
  the view refits smoothly every frame (`ViewTransform.fitSmooth`). Gravity is on by default when entering
  the vertical view and g = 0 in the horizontal one. Shortcut: V.
- **Switching gravity keeps the motion as seen**: displacement from equilibrium, velocity, time and history
  are preserved. x keeps its physical meaning (measured from the spring's natural length), so x, x₀ and the
  stored x samples all shift by Δx_eq = −mg/k. Without this, a soft spring (m = 2 kg, k = 8 N/m sags 2.45 m)
  would start a 3 m oscillation through the wall the moment the view rotates.
- **Scenery shifted by x_eq**: wall, floor and paper are drawn at offset x_eq, so the spring at rest looks the
  same in both views (a 2.45 m sag would not fit the drawn spring). Labels on the paper show the true x.
- **Energy relative to equilibrium**: plots and the stacked bar show K, U_eq = ½k(x − x_eq)² and
  E = K + U_eq, the energy of the oscillation. With gravity U = ½kx² + mgx differs from U_eq by a constant;
  without gravity they are identical. The model still exposes U and E.
- **Paper strip of fixed length (2 m)**: the trace window (4/8/16 s) sets the paper speed instead of the strip
  length, so changing the window never rescales the scene. 8 s → 0.25 m/s.
- **History**: 120 samples per simulated second (every 5 steps), 40 s capacity; hand-held samples are drawn
  dashed in pink on the paper and in every plot.
- **Toolbar inset**: the view fits the scene above the floating toolbar (`ViewTransform.insetBottom`).

## Phase 4 — Hover, popovers and the ODE

- **Objects are declared by the plugin** (`sim.objects`): id, ODE term ids, sliders (`ParamDef`) and optional
  derived info (ω₀, T). Texts live at `osc.<id>.objects.<obj>.{title,desc}`. The scene only provides `hit` and
  `objectBox`; the popover is a React element positioned by the controller every frame.
- **One highlight for everything**: canvas hover › ODE-term hover › open popover. The same id drives the canvas
  glow and the `term-lit` class on the KaTeX terms (tagged with `\htmlClass`, KaTeX `trust` limited to it).
- **Popover placement**: above the object's screen box, else below, right or left, so it never covers the
  object in either perspective. It waits 350 ms after the pointer leaves the object so it can be reached, stays
  open while the pointer is inside, and hides while dragging.
- **Slider changes keep the motion as seen**, like gravity: when m or k move the equilibrium (vertical view
  with gravity), x, x₀ and the trace shift by Δx_eq.
- **ODE with gravity** reads `m ẍ + k x = −m g` (x points up), with values: `2.0 ẍ + 8.0 x = −2.0 · 9.81`.
  The gravity term belongs to the block (the weight acts on it).
- The block's popover replaces the v₀ tag while it is open (they would overlap).

## Phase 5 — Damped driven oscillator

- **Drive (option a, as planned) with an exact picture**: the model applies F₀ cos ωt to the block. The crank
  radius is A = F₀/k and the slider holding the spring's end moves A cos ωt, which is option (b)'s moving anchor;
  its force kA cos ωt equals F₀ cos ωt, so the ODE and the drawing agree. The radius is capped at 0.12 m to fit
  the wheel (beyond that the picture is schematic).
- **No face on the motor**: the spec asked for a straining motor face, but the owner asked for no faces on
  objects. The effort shows as a warm glow around the wheel that grows with F₀.
- **Dashpot above the track**: a fluid tube fixed to the frame; an arm from the block's top drags the piston, so
  it fits every mass. Fluid goes water → oil → honey with log(1 + b); bubbles near the piston move against its
  velocity, slower in thicker fluid. The frame moves left (−1.85 m) to make room for the motor.
- **Shared scene**: the SHO scene became `createSpringBlockScene` (`src/oscillators/shared/`); tabs add parts
  (dashpot, motor), force vectors and a dashed paper overlay through its config.
- **Force vectors**: one row each across the block, a common scale that follows the largest visible force
  (grows at once, shrinks slowly), labels at the tips. Each one has its own chip ("Vectores").
- **Transient vs steady**: x_ss is the analytic steady state for the current params; x_tr = x − x_ss. With
  b = 0 the steady state is the particular solution, and the "transient" never dies (as it should).
- **Resonance sweep, measured like in a lab**: the amplitude comes from consecutive extrema (parabolic
  refinement). A point is recorded once the time since the last change reaches the 0.5% settling time from
  the analytic decay rate, and the last four half-cycle amplitudes agree within 0.2%. The automatic sweep
  covers 0.3 ω₀ to 2.2 ω₀ in 25 points. Changing m, k, b, F₀ or g clears the points (another oscillator).
  Verified: points fall within 1% of A(ω) (unit test and e2e).
- **Presets** (m = 1 kg, k = 4 N/m, ω₀ = 2 rad/s): undamped b = 0; underdamped b = 0.4; critical b = 4;
  overdamped b = 10 (all unforced, x₀ = 0.5 m); resonance b = 0.2, F₀ = 0.3 N, ω = ω_res ≈ 1.995 rad/s from
  rest (grows to ≈ 0.75 m); beats b = 0, F₀ = 0.3 N, ω = 1.8 rad/s from rest. Presets play immediately.
- **Regime badge**: "critical" is a ±2% band around γ = ω₀, so it can be reached with the slider.
- **Energy panel**: K, U, E (from equilibrium) in one lane, motor power F·v and dissipated power b v² in another.
  The phase plot keeps 40 s of trail and draws the steady ellipse (semi-axes A and ωA) dashed.

## Phase 6 — Presentation mode and polish

- **One canvas for everything recorded.** `captureStream()` only sees a canvas, so presentation mode (P) moves
  the same `SimController` onto a 1920×1080 canvas laid out in a 1280×720 logical space (scale 1.5): scene on
  the left, the plots whose chips are on stacked in a dark column on the right (own plot instances, own
  autoscale), and the ODE pill + regime badge drawn by `presentation/drawMath.ts` (a tiny renderer for the
  subset our models emit, using KaTeX's fonts). The interactive stage keeps KaTeX.
- **Options**: personality (the global serious toggle), ODE, axes (grid/tick labels of the time and phase plots
  and of the paper; the resonance plot keeps its axes because the curve means nothing without them), solid or
  gradient background. The options bar is DOM over the canvas, auto-hides after 2.5 s still, never recorded.
- **Recording (G)**: `captureStream(0)` + `requestFrame()` after each drawn frame, `MediaRecorder` WebM.
  **VP8 before VP9**: at 1080p VP9 software encoding made the page miss ~12% of frames vs ~2% for VP8.
  G outside presentation opens it and starts recording on its first frame (deferred so a React remount does
  not stop it). The file downloads as `oscillator-<tab>-<date>.webm`.
- **Frame-locked time**: while recording, simulated time advances in whole 1/60 s ticks (× speed) through
  `advanceFrame`. A late frame catches up with extra ticks (at most 4) instead of playing in slow motion, so
  the video keeps real-time pace and the physics still runs on the fixed 1/600 s step.
- **Performance**: drawing a full presentation frame costs ~1–2 ms (moving average in `debug().perf`), 60 fps
  with no late frames when not recording. `strokeFading` no longer allocates 20 `Path2D` per series per frame:
  opacity grows with the index, so one pass strokes each run of equal (opacity, manual) as one path. Plot
  canvas sizes come from a ResizeObserver instead of a layout read per plot per frame.
- **Measuring the 30 s acceptance**: headless Chromium (software GL and a software encoder on the same
  machine) misses 7–27% of frames while recording 1080p and its WebM can come out shorter than 30 s, while a
  headed window here is capped at 30 Hz even without recording. So the e2e test checks what holds anywhere
  (1920×1080 WebM, simulated time = wall time over 30 s, frame cost) and smoothness is checked by eye on a
  real recording.
- **Accessibility**: `?` opens a modal with every keyboard/pointer shortcut (focus moves to Close and back;
  other shortcuts are off while it is open); Esc closes it or leaves presentation. Focus rings come from the
  global `:focus-visible` style (tested on the toolbar).

## Post-Phase 6 revision (owner's feedback)

- **Track stops**: the body bounces elastically (x → 2c − x, v → −v) off the ends of the track, the limits
  `clampX` already used for dragging: the wall side (spring at its minimum length) and the end of the floor.
  Before, a strong fling or a resonance could take the block through the wall and the trace off the paper.
  Within the track the motion is exactly the model's; the physics tests run on the model and are unaffected.
- **Energy bar**: pinned to the stage's top-right corner. Its full height is E when the state was last set
  (paused or held), then the largest E while running, so a conserved E fills the bar while K and U trade
  places, and damping shows as a shrinking total. In a driven steady state U_max = ½kA² and K_max = ½mω²A²
  (the motion follows the motor's ω, not ω₀), so U peaks higher when ω < ω₀, K when ω > ω₀.
- **ODE pill**: sized in em and scaled down (19 → 10 px) to fit between the clock and the energy bar; on
  narrow stages the top row drops below the clock. It can be collapsed to a small "ODE" button (E).
- **Toolbar**: container queries on the stage shrink it at 760 and 560 px of stage width.
- Presets explain their scenario on hover/focus (`descKey`). The "wheee!" exclamation is gone.

## Coupled oscillators — C1: physics

- **Chain**: wall —k₁— m₁ —k₂— … mₙ —kₙ₊₁— wall, 2 ≤ n ≤ 5, every mᵢ and kⱼ its own parameter
  (`n, m1…m5, k1…k6`). xᵢ is measured from mass i's equilibrium, so M ẍ + K x = 0 with M = diag(mᵢ) and K
  tridiagonal. The state always holds 5 bodies ([x₁…x₅, v₁…v₅]); bodies beyond n stay at rest, so changing n
  needs no reallocation.
- **Normal modes**: Jacobi eigen-decomposition (`src/core/math/eigen.ts`) of M^{-1/2} K M^{-1/2}; shapes are
  M-normalized (Φᵀ M Φ = I) with the first nonzero component positive. Cached by comparing the 12 params
  (no allocation per step). Normal coordinates qₙ = φₙᵀ M x and Eqₙ = ½(q̇ₙ² + ωₙ² qₙ²); ΣEqₙ = E.
- **Energy per mass**: Eᵢ = Kᵢ + ½ of each spring shared with a neighbour + all of a wall spring, so ΣEᵢ = E
  exactly. It is a convention (spring energy is not located at a mass), stated in the UI.
- **ODE**: `OdeEquation.matrix` holds M and K entry by entry, each tagged with the objects that contribute
  (block i → `m{i}`, spring j → `k{j}`), for the matrix display and its highlight.
- Tests: Φᵀ M Φ = I and Φᵀ K Φ = diag(ω²) < 1e-10; uniform chain ωₙ = 2ω₀ sin(nπ/2(N+1)) < 1e-9; a pure mode
  leaks < 1e-8 of E into the others and its period is within 0.1%; N = 2 matches the modal superposition to
  < 1e-6; E and every Eqₙ drift < 1e-5 over 100 slow periods; at the slider extremes.

## Coupled oscillators — C2: multi-body runtime

- **Body index**: `Kinematic` takes an optional body `i` (default 0) and `bodies(params)`; 1-DOF models ignore
  it, `chainKinematic` reads [x₁…x₅, v₁…v₅]. Hits carry `body`, and the pointer drags, flings and sets v₀ on
  that body (`SimController.activeBody`, the last one touched).
- **Initial condition = state snapshot**: `initState` replaces {x₀, v₀}. Editing any body while paused copies
  the positions and velocities of all bodies into a fresh `createState` (so non-kinematic state, like the
  driven tab's work integrals, starts at 0 again). `ic` remains as a view of body 0.
- **Holding one body of many**: the others keep integrating (pulled by the held one); the held body's x and v
  are imposed after each step. A 1-DOF model is still not integrated while held, as before.
- **Stops**: a scene may implement `constrain(state)`. The chain bounces elastically off the walls and resolves
  block–block contact as an elastic collision (exchange of momentum for unequal masses), keeping every
  spring ≥ 8 cm; dragging is limited by the neighbours the same way. Without it, body 0 bounces off `clampX`.
- The coupled tab exists as a placeholder (walls, N blocks, springs, popovers, energy plot); scene polish,
  N selector, matrix ODE and plots come in C3–C4.

## Notes

- **Energy balance (driven)**: the state is augmented with W_in = ∫F·v dt and W_diss = ∫b v² dt, integrated by
  the same RK4 step.
