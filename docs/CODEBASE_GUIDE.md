# Codebase Guide

This document explains the current implementation shape of the project and how
to think about future development when correctness, readability, maintainability,
and precise gameplay logic matter.

## Current Mental Model

The project is a browser-playable Phaser + TypeScript puzzle game.

The active core loop is no longer the old Queue + Tray loop described in the
earliest specs. The current source of truth is the Conveyor + OutputPort +
BoxColumn loop from `02c_CONVEYOR_BOX.md`.

Current loop:

```text
Player taps an uncovered block
  -> the block shatters into 9 same-color marbles
  -> marbles tween through the funnel
  -> marbles enter a looping conveyor
  -> output ports accept marbles only when their top box color matches
  -> a box fills after 3 marbles and disappears
  -> the column advances
  -> all columns empty means victory

Failure:
  -> the conveyor is full and a new marble cannot enter
```

The game uses deterministic gameplay logic with Phaser visuals. This is
intentional and important: puzzle correctness should not depend on fragile
runtime physics collisions. The "physics" that matters most here is precise,
repeatable movement and state transitions.

## Important Directories

### `docs/`

Project specs, task plans, and agent instructions.

Important distinction:

- `00_MASTER_SPEC.md` is historical context for the original game plan.
- `02_CORE_GAMEPLAY.md` and `02b_QUEUE_TRAY_LOGIC.md` describe older Queue +
  Tray work.
- `02c_CONVEYOR_BOX.md` describes the current core gameplay architecture.
- `03_v2_*` through `07_v2_*` are the follow-up specs that match the newer
  Conveyor + BoxColumn direction.

When implementation and old docs disagree, prefer the current code plus README
plus v2 specs.

### `src/main.ts`

The Phaser entry point.

It configures:

- game size
- scaling
- Arcade Physics
- registered scenes

The scene order is:

```text
BootScene
MenuScene
LevelSelectScene
GameScene
GameOverScene
EditorScene
```

### `src/config/`

Global constants and color definitions.

`constants.ts` is especially important because it defines gameplay and layout
parameters:

- game size
- board area
- block size
- marbles per block
- conveyor capacity and speed
- output port spacing
- box capacity
- animation durations

Avoid scattering magic numbers through scene or entity files. If a number
affects layout, capacity, timing, or game feel, it probably belongs here.

### `src/scenes/`

Scene-level orchestration.

- `MenuScene.ts`: main menu.
- `LevelSelectScene.ts`: built-in level selection.
- `GameScene.ts`: core gameplay orchestration.
- `EditorScene.ts`: built-in level editor UI.
- `GameOverScene.ts`: win/lose result screen.
- `BootScene.ts`: startup scene.

`GameScene` should coordinate systems and entities, but it should not become the
home of low-level game rules. When logic can be tested without Phaser, move it
toward `src/sim/`.

### `src/entities/`

Phaser-backed game objects.

- `Block.ts`: board block, rendering, hit zone, covered/hidden state, shatter
  animation.
- `Marble.ts`: visual marble object and tween movement helper.
- `Conveyor.ts`: looping conveyor runtime, marble movement, port detection,
  overflow, and magnetize helper.
- `OutputPort.ts`: visual output gate and its normalized track position.
- `Box.ts`: visual box, slot reservation, visual fill, destroy animation.
- `BoxColumn.ts`: ordered stack of boxes, top-color acceptance, column advance.
- `Funnel.ts`: visual funnel.

Entities are currently a mix of display and some gameplay state. That is
acceptable for the current project size, but high-risk rules should gradually
move into pure simulation modules.

### `src/systems/`

Scene-adjacent systems.

- `BoardManager.ts`: adapts pure coverage logic to Phaser blocks.
- `GravityFlip.ts`: currently a stub for the future gravity flip feature.

`BoardManager` is a good pattern: it does not own rendering details, and the
actual coverage calculation lives in `src/sim/coverage.ts`.

### `src/sim/`

Pure logic modules with no Phaser dependency.

This is the most important directory for correctness.

- `coverage.ts`: determines which blocks are covered by higher z blocks.
- `boxColumnRules.ts`: pure BoxColumn acceptance and reservation rules,
  including immediate top-box advance after logical capacity is reserved.
- `conveyorTrack.ts`: maps normalized conveyor progress `t` to screen
  coordinates.
- `editorState.ts`: headless editor state, deterministic with injected ID
  generation. It now speaks Conveyor/BoxColumns directly and keeps legacy
  Queue/Tray fields as import compatibility only.
- `levelLoader.ts`: level path helpers and strict level validation, including
  board bounds, duplicate IDs, duplicate layers, valid colors, and marble/box
  balance.
- `types.ts`: shared data contracts.
- `index.ts`: public exports for scripts/tests.

Future correctness-sensitive logic should be added here first where possible.

### `src/levels/`

Built-in level data.

Current levels use `box_columns`, not the old `trays` model. A valid level must
balance available marbles and box capacity:

```text
blocks.length * MARBLES_PER_BLOCK == totalBoxes * BOX_CAPACITY
```

Color counts must also balance:

```text
blocksOfColor * MARBLES_PER_BLOCK == boxesOfColor * BOX_CAPACITY
```

If this math is wrong, the level can become impossible, can finish incorrectly,
or can leave unmatched marbles on the conveyor.

### `scripts/`

Validation and smoke tests.

`npm test` currently runs:

```text
tsx scripts/validate.mjs
tsx scripts/sim-smoke.mjs
tsx scripts/test-conveyor-track.mjs
```

These scripts check:

- TypeScript compilation
- level schema consistency
- editor state behavior
- coverage logic
- BoxColumn reservation and top-box advance rules
- conveyor track determinism
- basic shipped-level validity

Browser smoke tests live in `scripts/smoke-browser.mjs` and should be used for
end-to-end Phaser behavior. The smoke script now contains 02c scenarios 1-10,
including concurrent conveyor entry and immediate top-box advance, but the most
recent local run stopped at browser boot timeout before those scenarios ran.

## Core Gameplay Components

### Blocks And Coverage

Blocks live on a grid with `(col, row, z)`.

Only the topmost uncleared block at a given `(col, row)` is clickable. Lower
blocks are covered until higher z blocks are cleared.

The pure rule lives in `src/sim/coverage.ts`:

```text
A block is covered when another uncleared block has:
  same col
  same row
  greater z
```

`BoardManager` applies this result back to Phaser `Block` objects.

### Conveyor Track

The conveyor is a deterministic loop parameterized by `t in [0, 1)`.

The track has four segments:

```text
0.00 - 0.40: upper straight, left to right
0.40 - 0.50: right curve
0.50 - 0.90: lower straight, right to left
0.90 - 1.00: left curve
```

`ConveyorTrack.positionAt(t)` turns `t` into `{ x, y }`.

This is better than relying on runtime physics collisions because:

- movement is deterministic
- port detection is testable
- browser performance differences are less likely to change gameplay
- correctness can be checked in Node without rendering

### Output Ports

Each output port has a fixed `t` position on the lower conveyor layer.

During `Conveyor.update(delta)`, each on-conveyor marble advances its `t`. If it
is within `CONFIG.OUTPUT_PORTS.DETECT_EPSILON` of a port and the port's
BoxColumn can accept its color, the marble is removed from the conveyor and sent
to that box.

The detection window is gameplay-critical. If it is too small, fast marbles can
skip ports. If it is too large, marbles can be accepted too early or by the
wrong-feeling port.

### Box Columns

Each column has an ordered list of boxes.

The first box in the array is the top box. Only the top box can accept marbles.
When it reserves enough slots, the column advances to the next box.

This split matters:

- logical reservation happens when a marble is accepted
- visual filling happens when the tween completes

The logic should not wait for animation to decide whether a slot is taken.
Otherwise multiple marbles could target the same visual slot during rapid
updates.

The pure reservation rule now lives in `src/sim/boxColumnRules.ts`. Phaser
entities still own rendering and tweens, but acceptance and slot reservation can
be tested without constructing a scene.

### Victory And Failure

Victory is based on all BoxColumns being empty.

Failure is based on conveyor overflow: if `Conveyor.acceptMarble()` is called
while the conveyor already holds `CONFIG.CONVEYOR.TOTAL_CAPACITY` marbles, the
scene emits `conveyor-overflow` and transitions to the lose state.

Victory and failure should remain data-state decisions, not animation-state
decisions.

## Current Incomplete Areas

### Magnet

`src/boosters/Magnet.ts` is still a stub.

`Conveyor.magnetize(color)` already contains some behavior for pulling matching
marbles from the conveyor into compatible boxes, but the feature is not fully
integrated into the gameplay UI and level flow.

Before shipping Magnet, define:

- when the player can activate it
- which colors are selectable
- whether it can target only visible/top box colors
- how it behaves when no matching box can accept the marble
- how it interacts with in-flight marbles and overflow

### Gravity Flip

`src/systems/GravityFlip.ts` is still a stub.

Before implementing it, decide whether Gravity Flip affects:

- board orientation
- conveyor direction
- output port order
- box column order
- only visuals

Avoid implementing this as "rotate visuals and hope the rules still work." The
state transition must be explicit and testable.

### Editor V2 Cleanup

`EditorScene` has been partially cleaned up to match the current Conveyor +
BoxColumn runtime model:

- visible Queue/Tray controls were replaced with Conveyor speed controls and a
  BoxColumns preview.
- preview boxes can be clicked to cycle their color for direct BoxColumn data
  edits.
- `AUTO` regenerates BoxColumns from the current block colors.
- exported playtest data uses `box_columns` plus `conveyor_speed`.

Remaining cleanup should make the BoxColumn editor more explicit: show every
box in long columns, add add/remove/reorder controls, and make validation errors
easy to fix before playtest.

## Development Principles

### 1. Keep Core Rules Pure

If a rule can be expressed without Phaser, put it in `src/sim/`.

Good candidates:

- box column state transitions (partially extracted in `boxColumnRules.ts`)
- port acceptance logic
- conveyor capacity checks
- level solvability invariants
- gravity flip transforms
- magnet targeting rules

Phaser code should handle:

- rendering
- input
- tweens
- scene transitions
- sound and effects

### 2. Treat Marble Flow As A State Machine

Every marble should have one active ownership state.

Useful states include:

```text
created
moving-to-funnel-mouth
falling-into-funnel
leaving-funnel
on-conveyor
dropping-to-box
flying-to-magnet-target
overflow-exit
destroyed
```

For every new mechanic, define:

- which states it can affect
- which states it must ignore
- whether it removes the marble from `Conveyor.marbles`
- which callback owns destruction

Most hard gameplay bugs will come from double ownership: a marble being updated
by the conveyor while a tween or booster also thinks it owns that marble.

### 3. Separate Logical Reservation From Visual Completion

Slot reservation should happen immediately when the game decides a marble has
entered a box.

Visual fill should happen later when the animation completes.

This avoids race conditions where several marbles arrive during the same short
time window and all believe the same slot is still available.

### 4. Validate Levels Before Playing Them

Every built-in level and editor playtest should pass `validateLevel()`.

Minimum invariants:

- block IDs are unique
- block positions are inside the board
- no duplicate `(col, row, z)`
- exactly four box columns
- valid color IDs only
- total marble count equals total box capacity
- each color's marble count equals that color's slot capacity

Do not tune gameplay around invalid level data. Fix the data first.

### 5. Prefer Deterministic Motion For Puzzle Logic

Use real-time physics only where visual flavor needs it. Core acceptance,
capacity, and win/loss decisions should be deterministic.

The current `t`-based conveyor is the right direction:

- it is inspectable
- it is testable
- it avoids browser-dependent collision edge cases
- it supports exact reasoning about ports and capacity

### 6. Keep Scene Files Thin

`GameScene` should remain the coordinator, not the rule engine.

If `GameScene` starts accumulating logic such as "which box should receive this
marble" or "how does a gravity flip transform active marbles," move that logic
into a pure module and let `GameScene` call it.

### 7. Test At Three Levels

Use three different test layers:

1. Pure logic tests for `src/sim`.
2. `npm test` for typecheck, schema validation, and headless smoke.
3. Browser smoke for Phaser integration, pointer input, animations, and scene
   transitions.

Do not rely only on browser smoke. It is slower and less precise than pure logic
tests.

## Recommended Next Steps

1. Fix the local browser smoke boot timeout, then rerun
   `PORT=8124 DEBUG_PORT=9325 npm run test:browser` to verify scenarios 1-10
   actually pass in Chrome.
2. Commit the current 02c QA/editor/sim checkpoint separately from future
   feature work once browser smoke is green.
3. Extract more Conveyor acceptance, capacity, and magnet targeting rules into
   `src/sim`.
4. Finish the BoxColumn editor controls: add/remove boxes, reorder boxes, show
   long columns clearly, and surface `validateLevel()` errors as fixable UI.
5. Implement Magnet as a tested state transition before adding polish.
6. Implement Gravity Flip only after its exact effect on data and visuals is
   specified.
7. Keep every feature behind passing `npm test` plus targeted browser smoke.

## Quality Bar

For this game, high quality means:

- the player can understand why a marble was accepted or rejected
- every level is mathematically valid
- no marble can be duplicated, lost silently, or owned by two systems
- victory and failure happen exactly once
- animation timing cannot corrupt the logical state
- new mechanics are deterministic before they are visually polished
- the editor exports data that the runtime can trust

The safest long-term architecture is:

```text
src/sim      = authoritative rules and deterministic state
src/entities = Phaser-backed visual objects
src/scenes   = orchestration, input, transitions
src/config   = shared constants and tuning knobs
scripts      = validation and regression checks
```

Keep moving in that direction as the project grows.
