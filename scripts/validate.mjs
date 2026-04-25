import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COLOR_IDS } from '../src/config/colors.js';
import { CONFIG } from '../src/config/constants.js';

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
    if (!Array.isArray(data.box_columns)) fail(`${file}: box_columns must be an array`);
    if (data.box_columns.length !== 4) fail(`${file}: box_columns must have 4 columns`);
    if (data.conveyor_speed !== undefined && (!Number.isFinite(data.conveyor_speed) || data.conveyor_speed <= 0)) {
      fail(`${file}: conveyor_speed must be a positive number`);
    }

    const blockIds = new Set();
    const occupiedLayers = new Set();
    const blockColorCounts = new Map();
    const boxColorCounts = new Map();
    const boxColumns = new Set();

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
      blockColorCounts.set(block.color, (blockColorCounts.get(block.color) || 0) + 1);
    });

    let totalBoxes = 0;
    data.box_columns.forEach((column, index) => {
      if (!Number.isInteger(column.col) || column.col < 0 || column.col > 3) {
        fail(`${file}: box column ${index} col must be 0..3`);
      }
      if (boxColumns.has(column.col)) fail(`${file}: duplicate box column ${column.col}`);
      boxColumns.add(column.col);
      if (!Array.isArray(column.boxes)) fail(`${file}: column ${column.col} boxes must be an array`);
      column.boxes.forEach((color) => {
        if (!COLOR_IDS.includes(color)) fail(`${file}: unknown box color ${color}`);
        boxColorCounts.set(color, (boxColorCounts.get(color) || 0) + 1);
        totalBoxes += 1;
      });
    });

    const availableMarbles = data.blocks.length * CONFIG.MARBLES_PER_BLOCK;
    const boxSlots = totalBoxes * CONFIG.BOX_COLUMNS.BOX_CAPACITY;
    if (availableMarbles !== boxSlots) fail(`${file}: ${availableMarbles} marbles but ${boxSlots} box slots`);

    const colors = new Set([...blockColorCounts.keys(), ...boxColorCounts.keys()]);
    for (const color of colors) {
      const marbleCount = (blockColorCounts.get(color) || 0) * CONFIG.MARBLES_PER_BLOCK;
      const slotCount = (boxColorCounts.get(color) || 0) * CONFIG.BOX_COLUMNS.BOX_CAPACITY;
      if (marbleCount !== slotCount) {
        fail(`${file}: color ${color} has ${marbleCount} marbles but ${slotCount} box slots`);
      }
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
  const boxes = restored.boxColumns.flatMap((column) => column.boxes);
  if (restored.blocks.length !== 1 || boxes.length !== 3 || boxes.some((color) => color !== 'blue')) {
    fail('EditorState JSON round-trip failed');
  }

  pass('EditorState placement, stacking, erase, JSON round-trip');
}

checkJavaScriptSyntax();
checkLevelFiles();
await checkEditorState();
