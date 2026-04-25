# `src/sim/` — Headless Simulation Layer

Pure game-logic modules. **Must import and execute under Node with zero browser/Phaser dependency.**

## Contract (enforced by lint + smoke test)

1. No `import` of Phaser, no reference to `window`, `document`, `requestAnimationFrame`, or DOM APIs.
2. No `Date.now()`, no `Math.random()`. Inject a clock and an RNG via function parameters or constructor options.
3. Inputs and outputs are plain serialisable data: numbers, strings, arrays, objects. No class instances of entities, no Phaser objects.
4. No side effects on globals. Modules export pure functions or classes whose state lives entirely on `this`.
5. Named exports only. No default exports.

## Why

- **Determinism.** Same inputs → same outputs. Required for replays, fuzz tests, and reasoning about bugs.
- **Headless tests.** `npm test` runs sim modules under Node; CI does not need a browser.
- **Renderer independence.** When we swap or refactor rendering (Phaser scene reorganisation, debug overlays, future engine changes), logic does not move.

## What lives here

- `coverage.js` — pure stack/coverage computation for the block board.
- `conveyorTrack.js` — geometric path along the conveyor loop.
- `editorState.js` — level-editor state container with injected `idGen`.
- `levelLoader.js` — pure level validation.
- `index.js` — re-exports.

## What does **not** live here (yet)

- Marble motion, conveyor advancement, gravity-flip animation. These are still scene-coupled.
  Migrate them into `src/sim/` once their physics is frozen — see `00_MASTER_SPEC.md`.

## Adding a new module

1. Write the module as pure functions (preferred) or a class with no I/O.
2. Add a named export.
3. Re-export from `src/sim/index.js`.
4. Add a smoke call in `scripts/sim-smoke.mjs` so CI catches accidental Phaser/DOM imports.
