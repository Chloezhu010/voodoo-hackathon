import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SRC = join(ROOT, 'src');
const LEVELS = join(SRC, 'levels');
const COLOR_IDS = ['pink', 'blue', 'green', 'yellow', 'purple', 'orange'];

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

function checkJavaScriptSyntax() {
  const files = listFiles(SRC, '.js');
  files.forEach((file) => execFileSync('node', ['--check', file], { stdio: 'pipe' }));
  pass(`JavaScript syntax (${files.length} files)`);
}

function checkLevelFiles() {
  const files = readdirSync(LEVELS)
    .filter((file) => file.endsWith('.json'))
    .sort();

  files.forEach((file) => {
    const data = JSON.parse(readFileSync(join(LEVELS, file), 'utf8'));

    if (!Number.isInteger(data.level_id)) fail(`${file}: level_id must be an integer`);
    if (!data.name) fail(`${file}: name is required`);
    if (!data.board_size) fail(`${file}: board_size is required`);
    if (!Number.isInteger(data.board_size.cols) || !Number.isInteger(data.board_size.rows)) {
      fail(`${file}: board_size cols/rows must be integers`);
    }
    if (!Array.isArray(data.blocks)) fail(`${file}: blocks must be an array`);
    if (!Array.isArray(data.trays)) fail(`${file}: trays must be an array`);
    if (!Number.isInteger(data.queue_capacity) || data.queue_capacity <= 0) {
      fail(`${file}: queue_capacity must be a positive integer`);
    }

    const blockIds = new Set();
    const occupiedLayers = new Set();
    const blockColors = new Set();
    const trayColors = new Set();

    data.blocks.forEach((block, index) => {
      if (!block.id) fail(`${file}: block ${index} missing id`);
      if (blockIds.has(block.id)) fail(`${file}: duplicate block id ${block.id}`);
      blockIds.add(block.id);

      if (!Number.isInteger(block.col) || !Number.isInteger(block.row) || !Number.isInteger(block.z)) {
        fail(`${file}: block ${block.id} col/row/z must be integers`);
      }
      if (block.col < 0 || block.col >= data.board_size.cols || block.row < 0 || block.row >= data.board_size.rows) {
        fail(`${file}: block ${block.id} is outside board`);
      }
      if (!COLOR_IDS.includes(block.color)) fail(`${file}: unknown block color ${block.color}`);
      if (typeof block.is_hidden !== 'boolean') fail(`${file}: block ${block.id} is_hidden must be boolean`);

      const layerKey = `${block.col}:${block.row}:${block.z}`;
      if (occupiedLayers.has(layerKey)) fail(`${file}: duplicate block layer ${layerKey}`);
      occupiedLayers.add(layerKey);
      blockColors.add(block.color);
    });

    data.trays.forEach((tray, index) => {
      if (!COLOR_IDS.includes(tray.color)) fail(`${file}: unknown tray color ${tray.color}`);
      if (!Number.isInteger(tray.capacity) || tray.capacity <= 0) {
        fail(`${file}: tray ${index} capacity must be positive integer`);
      }
      if (trayColors.has(tray.color)) fail(`${file}: duplicate tray color ${tray.color}`);
      trayColors.add(tray.color);
    });

    blockColors.forEach((color) => {
      if (!trayColors.has(color)) fail(`${file}: block color ${color} has no tray`);
    });
    trayColors.forEach((color) => {
      if (!blockColors.has(color)) fail(`${file}: tray color ${color} has no block`);
    });

    const neededMarbles = [...data.trays].reduce((total, tray) => total + tray.capacity, 0);
    const availableMarbles = data.blocks.length * 6;
    if (availableMarbles < neededMarbles) {
      fail(`${file}: not enough block marbles for trays`);
    }
  });

  pass(`level schema and consistency (${files.length} files)`);
}

async function checkEditorState() {
  const { default: EditorState } = await import(pathToFileURL(join(SRC, 'systems', 'EditorState.js')).href);
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

  state.toggleTray('blue');
  const json = state.exportJSON();
  const restored = new EditorState();
  restored.importJSON(json);
  if (restored.blocks.length !== 1 || restored.trays.length !== 1 || restored.trays[0].color !== 'blue') {
    fail('EditorState JSON round-trip failed');
  }

  pass('EditorState placement, stacking, erase, JSON round-trip');
}

checkJavaScriptSyntax();
checkLevelFiles();
await checkEditorState();
