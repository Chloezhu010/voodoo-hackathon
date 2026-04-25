# Marble Sort! - 30 hour development control doc

## Current Source Of Truth

The project direction changed on 2026-04-25:

- Old core loop: static Queue + Tray.
- New core loop: looping Conveyor + OutputPort + BoxColumn.
- `00_MASTER_SPEC.md` and legacy task files are historical context for constraints and original intent.
- The active implementation path is `02c_CONVEYOR_BOX.md` and the v2 follow-up specs.

Current checkpoint:

- `02c` conveyor core has been verified with `npm test`.
- `02c` browser smoke has been verified on `PORT=8124 DEBUG_PORT=9325`.
- Next step before new features: commit the 02c checkpoint, then run QA-only coverage for the remaining 02c edge cases.

## Mission

Deliver a browser-playable Voodoo Game Jam Track 1 puzzle game with:

- 3 playable levels.
- Built-in level editor.
- Conveyor + box-column core loop.
- 2 creative mechanics: Magnet booster and Gravity Flip.
- itch.io deployment.

## Task Roadmap

| Task | Spec | Status | Owner | Notes |
|---|---|---|---|---|
| Shared context | `00_MASTER_SPEC.md` | Historical | All | Read for stack, style, constraints. Core loop is superseded by 02c. |
| Scaffold | `01_SCAFFOLD.md` | Done | Dev | Menu, level select, Phaser shell. |
| Legacy core | `02_CORE_GAMEPLAY.md` | Done, partially retained | Dev | Block, BoardManager, scene structure still useful. Queue/Tray loop superseded. |
| Queue/Tray hardening | `02b_QUEUE_TRAY_LOGIC.md` | Deprecated | - | Only the sync-data / async-visual principle remains relevant. |
| Conveyor core | `02c_CONVEYOR_BOX.md` | Checkpoint verified | Dev | Current core implementation. Commit before continuing. |
| 02c QA | `scripts/smoke-browser.mjs` | Next | QA | Add missing scenarios 2, 4, 6, 10. Tests only unless integration owner approves code fix. |
| Levels v2 | `03_v2_LEVELS.md` | Pending | Creative/PM | New `box_columns` schema levels. |
| Editor v2 | `04_v2_EDITOR.md` | Pending | Dev | Replace tray/queue UI with box column editor. |
| Magnet v2 | `05_v2_MAGNET.md` | Pending | Feature | Use `conveyor.magnetize(color)`. |
| Gravity Flip v2 | `06_v2_GRAVITY_FLIP.md` | Pending | Feature | Pause conveyor during flip. |
| Polish/deploy v2 | `07_v2_POLISH_DEPLOY.md` | Pending | Visual + Dev | Effects, mobile checks, itch.io package. |

Execution order:

1. Commit verified 02c checkpoint.
2. Run 02c QA-only missing smoke scenarios.
3. Commit QA tests.
4. Implement `03_v2_LEVELS.md`.
5. Implement `04_v2_EDITOR.md`.
6. Implement `05_v2_MAGNET.md`.
7. Implement `06_v2_GRAVITY_FLIP.md`.
8. Implement `07_v2_POLISH_DEPLOY.md`.

Do not start a later task until the previous task has a passing checkpoint and commit.

## Run And Test

Local server:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

Fast validation:

```bash
npm test
```

Browser smoke:

```bash
PORT=8124 DEBUG_PORT=9325 npm run test:browser
```

The default smoke port may be occupied. Prefer explicit `PORT` and `DEBUG_PORT` values when running alongside other agents.

## Agent Operating Rules

Every agent prompt must include:

- `Read scope`: exact docs to read.
- `Write scope`: exact files it may edit.
- `Do not edit`: files and folders outside scope.
- `Run`: exact test commands.
- `Stop conditions`: timeout and failure limits.

Hard rules:

- One coding agent owns core gameplay files at a time.
- Other agents may do QA, docs, or level data in disjoint file scopes.
- Browser smoke running longer than 3 minutes without useful output is a failure. Stop and report.
- Same failure can be investigated for at most 2 repair loops, then checkpoint.
- Long tasks must checkpoint every 20 minutes.
- No agent may "also start" the next task after finishing its current task.
- Do not modify `README copy*.md`.
- Do not use `git add -A` while spec/docs copies and generated files are unreviewed.

## Multi Agent Ownership

| Role | Purpose | Write scope |
|---|---|---|
| Integration owner | Merge, resolve source bugs, run full validation | Any file, one task at a time |
| QA agent | Add or refine automated smoke/validation tests | `scripts/*` only by default |
| Level agent | Build and validate v2 levels | `src/levels/*.json`, `LevelSelectScene.js`, level validation script |
| Editor agent | Implement `box_columns` editor | `src/scenes/EditorScene.js`, `src/systems/EditorState.js` |
| Feature agent | Magnet or Gravity Flip | Specific feature files plus minimal `GameScene` hooks |
| Visual agent | Effects, polish, deployment docs | Visual/effects files, deployment package docs |

If two agents need the same file, stop and let the integration owner sequence the work.

## Prompt Template

Use this structure for every implementation task:

```text
Task: <task name>

Read:
- README.md
- <active spec only>
- <one or two necessary reference specs>

Write scope:
- <exact files>

Do not edit:
- <exact forbidden files/directories>

Run:
- npm test
- PORT=8124 DEBUG_PORT=9325 npm run test:browser

Stop conditions:
- Stop after tests pass and report.
- Browser smoke over 3 minutes without useful output means stop and report.
- Same failure max 2 repair loops.
- 20 minute checkpoint if still working.
- Do not start the next task.
```

## Risk Plan

| Risk | Action |
|---|---|
| 02c checkpoint fails after a small patch | Stop feature work. Fix only the regressed patch. |
| 02c QA finds gameplay bug | QA reports. Integration owner fixes in a focused follow-up. |
| 03_v2 levels are mathematically invalid | Do not tune gameplay. Fix level data and validation first. |
| 04_v2 editor runs long | Keep minimal EditorState compatibility and prioritize playable built-in levels. |
| P1 features run late | Keep Magnet or Gravity Flip, not necessarily both. Prefer the one that is stable and demoable. |
| Browser smoke harness becomes flaky | Add deterministic wait helpers. Do not rewrite gameplay to satisfy flaky waits. |
| Deadline pressure | Preserve playable 3-level build and deployment over polish. |

## Presentation Notes

Slide 1: AI workflow and checkpoint process.

Slide 2: New core mechanic:

- Tap block.
- 9 marbles enter conveyor.
- Output ports accept matching marbles into top boxes.
- Full box disappears and the column advances.

Slide 3: Demo:

- Level 1 conveyor loop.
- Editor play test.
- Magnet / Gravity Flip if stable.

Judging hooks:

- Browser playable.
- 3 levels.
- Level editor.
- Clear AI-driven spec and checkpoint workflow.
- Creative conveyor + box-column loop.
