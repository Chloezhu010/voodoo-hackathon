#!/usr/bin/env node
/**
 * Headless smoke test for src/sim/. Verifies the sim layer imports and runs
 * under Node with zero browser/Phaser dependency, and exercises a couple of
 * basic invariants. Extend (don't replace) as new sim modules land.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

const sim = await import(join(ROOT, 'src/sim/index.js'));
const {
  computeCoverage,
  isBoardCleared,
  ConveyorTrack,
  EditorState,
  validateLevel,
  levelCacheKey,
  levelPathFor,
} = sim;

function ok(message) {
  console.log(`ok - ${message}`);
}

// --- coverage --------------------------------------------------------------
{
  const blocks = [
    { id: 'a', col: 0, row: 0, z: 0 },
    { id: 'b', col: 0, row: 0, z: 1 },
    { id: 'c', col: 1, row: 0, z: 0 },
    { id: 'd', col: 0, row: 0, z: 2, isCleared: true },
  ];
  const coverage = computeCoverage(blocks);
  assert.equal(coverage.get('a'), true, 'lower block must be covered');
  assert.equal(coverage.get('b'), false, 'topmost active block must be uncovered');
  assert.equal(coverage.get('c'), false, 'lone block must be uncovered');
  assert.equal(coverage.has('d'), false, 'cleared block excluded from coverage map');
  assert.equal(isBoardCleared(blocks), false);
  assert.equal(
    isBoardCleared(blocks.map((b) => ({ ...b, isCleared: true }))),
    true,
    'all-cleared board reports complete',
  );
  ok('coverage: stack coverage and clearance detection');
}

// --- conveyor track --------------------------------------------------------
{
  const track = new ConveyorTrack();
  const entry = track.positionAt(track.entryT);
  const mid = track.positionAt(0.5);
  assert.ok(Number.isFinite(entry.x) && Number.isFinite(entry.y), 'entry is finite');
  assert.ok(Number.isFinite(mid.x) && Number.isFinite(mid.y), 'midpoint is finite');
  assert.notDeepEqual(entry, mid, 'entry and midpoint differ');
  // Track is a closed loop: t and t+1 must coincide.
  const loopA = track.positionAt(0.27);
  const loopB = track.positionAt(1.27);
  assert.ok(Math.abs(loopA.x - loopB.x) < 1e-9, 'loop x-periodic');
  assert.ok(Math.abs(loopA.y - loopB.y) < 1e-9, 'loop y-periodic');
  ok('conveyorTrack: deterministic, finite, periodic');
}

// --- editor state with injected RNG ---------------------------------------
{
  let counter = 0;
  const idGen = () => `b_test_${++counter}`;
  const editor = new EditorState({ idGen });
  editor.placeBlock(0, 0);
  editor.activeColor = 'blue';
  editor.placeBlock(1, 0);
  assert.equal(editor.blocks.length, 2);
  assert.deepEqual(
    editor.blocks.map((b) => b.id),
    ['b_test_1', 'b_test_2'],
    'EditorState honours injected idGen — output is deterministic',
  );

  const json = editor.exportJSON();
  const restored = new EditorState({ idGen: () => 'unused' });
  restored.importJSON(json);
  assert.equal(restored.blocks.length, 2, 'JSON round-trip preserves block count');
  ok('editorState: deterministic ids + JSON round-trip');
}

// --- level loader ----------------------------------------------------------
{
  assert.equal(levelCacheKey(0), 'level-test');
  assert.equal(levelCacheKey(3), 'level-03');
  assert.equal(levelPathFor(2), 'src/levels/level_02.json');

  const samplePath = join(ROOT, 'src/levels/level_01.json');
  const sample = JSON.parse(readFileSync(samplePath, 'utf8'));
  assert.doesNotThrow(() => validateLevel(sample), 'shipped level_01 validates');

  assert.throws(() => validateLevel(null), /Level data is missing/);
  assert.throws(
    () => validateLevel({ board_size: {}, blocks: [], box_columns: [] }),
    /4 box columns/,
  );
  ok('levelLoader: pure validation accepts shipped level and rejects malformed');
}

console.log('\nheadless sim smoke: PASS');
