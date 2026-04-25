# Bugfix Record — Pointer Hit Zones

Date: 2026-04-25

## Problem

Some blocks and UI buttons had inaccurate pointer areas:

- A visible part of a block/button could fail to click.
- Some pointer positions could trigger a neighboring block/button.
- Hover and click feedback did not always match the visible target.

## Root Cause

Several clickable elements used `Container.setInteractive(...)` directly. In Phaser, container hit areas can become unreliable when the visual container contains nested objects and is tweened or scaled for hover/press feedback.

The issue was most visible on blocks, but the same pattern existed in menu buttons, level cards, editor controls, and game-over buttons.

## Fix

Clickable visuals now use a stable transparent `Zone` as the pointer target.

Pattern:

- The visual `Container` only draws the UI and handles tween animation.
- A same-center fixed-size `Zone` receives pointer events.
- The `Zone` forwards pointer events to the visual container when useful.
- Covered/cleared blocks disable their `Zone`, preventing hidden or cleared objects from stealing clicks.

Shared helper:

- `src/ui/hitZones.js`
  - `attachHitZone(scene, container, width, height, options)`
  - `makeWorldHitZone(scene, x, y, width, height, onPointerUp, options)`

## Files Changed

- `src/entities/Block.js`
- `src/scenes/MenuScene.js`
- `src/scenes/LevelSelectScene.js`
- `src/scenes/GameScene.js`
- `src/scenes/GameOverScene.js`
- `src/scenes/EditorScene.js`
- `src/ui/hitZones.js`
- `scripts/smoke-browser.mjs`

## Regression Tests Added

Browser smoke tests now use real mouse coordinates through Chrome DevTools Protocol to verify:

- PLAY button starts level select.
- Level select back returns to menu.
- Editor palette buttons update editor state.
- Editor Play Test starts a custom level.
- Level card starts the selected level.
- Game back returns to level select.
- GameOver Retry restarts the level.
- Block hit zones align with block visuals.
- Covered hidden blocks have disabled hit zones, then enable after reveal.

## Verification

Run:

```bash
node scripts/validate.mjs
node scripts/smoke-browser.mjs
```

Expected key output:

```text
ok - PLAY button hit zone starts LevelSelectScene
ok - level select back hit zone returns to menu
ok - editor palette hit zones update state
ok - editor Play Test hit zone starts custom level
ok - level card hit zone starts selected level
ok - game back hit zone returns to level select
ok - GameOver retry hit zone restarts level
ok - block hit zones align with visuals
ok - hidden layer reveals when top block clears
ok - no browser console/runtime errors
```
