import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateLevel } from '../src/sim/levelLoader.js';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SRC = join(ROOT, 'src');
const LEVELS = join(SRC, 'levels');
function pass(message) {
  console.log(`ok - ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function listFiles(dir, extension) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path, extension);
    return path.endsWith(extension) ? [path] : [];
  });
}

function checkTypeScriptCompilation() {
  const files = listFiles(SRC, '.ts');
  if (files.length === 0) fail('src must contain TypeScript files');
  execFileSync('npx', ['tsc', '--noEmit'], { stdio: 'pipe' });
  pass(`TypeScript compilation (${files.length} files)`);
}

function checkLevelFiles() {
  const files = readdirSync(LEVELS)
    .filter((file) => file.endsWith('.json'))
    .sort();

  files.forEach((file) => {
    const data = JSON.parse(readFileSync(join(LEVELS, file), 'utf8'));
    if (!Number.isInteger(data.level_id)) fail(`${file}: level_id must be an integer`);
    if (!data.name) fail(`${file}: name is required`);
    validateLevel(data);
  });

  pass(`level schema and consistency (${files.length} files)`);
}

async function checkEditorState() {
  const { EditorState } = await import(pathToFileURL(join(SRC, 'sim', 'editorState.ts')).href);
  const state = new EditorState();

  state.placeBlock(0, 0);
  if (state.blocks.length !== 1 || state.blocks[0].color !== 'pink') {
    fail('EditorState placeBlock did not create a pink block');
  }

  state.activeColor = 'blue';
  state.placeBlock(0, 0);
  if (state.blocks.length !== 1 || state.blocks[0].color !== 'blue') {
    fail('EditorState placeBlock should overwrite same col/row/z');
  }

  state.setActiveZ(1);
  state.activeColor = 'green';
  state.placeBlock(0, 0);
  if (state.blocks.length !== 2) fail('EditorState should stack different z layers');

  state.eraseMode = true;
  state.removeBlock(0, 0);
  if (state.blocks.length !== 1 || state.blocks[0].z !== 0) {
    fail('EditorState removeBlock should remove highest z layer first');
  }

  const json = state.exportJSON();
  const restored = new EditorState();
  restored.importJSON(json);
  const boxes = restored.boxColumns.flatMap((column) => column.boxes);
  if (restored.blocks.length !== 1 || boxes.length !== 3 || boxes.some((color) => color !== 'blue')) {
    fail('EditorState JSON round-trip failed');
  }

  pass('EditorState placement, stacking, erase, JSON round-trip');
}

checkTypeScriptCompilation();
checkLevelFiles();
await checkEditorState();
