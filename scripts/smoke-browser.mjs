import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const PORT = Number(process.env.PORT || 8010);
const DEBUG_PORT = Number(process.env.DEBUG_PORT || 9224);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DEFAULT_CHROME_BIN = process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome';
const CHROME_BIN = process.env.CHROME_BIN || DEFAULT_CHROME_BIN;
const USER_DATA_DIR = `/tmp/marble-sort-chrome-${DEBUG_PORT}`;
const DEBUG_OUTPUT = process.env.SMOKE_DEBUG === '1';
const BROWSER_SCOPE = process.env.SMOKE_SCOPE
  || (process.argv.includes('--quick') ? 'quick' : 'full');
const QUICK_BROWSER_SMOKE = BROWSER_SCOPE === 'quick';

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

function pipeChildOutput(stream, writer, filter) {
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    if (DEBUG_OUTPUT) {
      writer.write(text);
      return;
    }
    const visible = text
      .split(/\r?\n/)
      .filter((line) => line && (!filter || filter(line)))
      .join('\n');
    if (visible) writer.write(`${visible}\n`);
  });
}

function spawnProcess(command, args, options = {}) {
  const { stdoutFilter, stderrFilter, ...spawnOptions } = options;
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...spawnOptions
  });
  pipeChildOutput(child.stdout, process.stdout, stdoutFilter);
  pipeChildOutput(child.stderr, process.stderr, stderrFilter);
  return child;
}

async function waitForJson(url, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Keep polling until the dev server exposes the endpoint.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function connectWebSocket(url) {
  return new Promise((resolveSocket, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolveSocket(ws), { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}

async function createCdpClient(wsUrl) {
  const ws = await connectWebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = [];

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolveCommand, rejectCommand } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectCommand(new Error(JSON.stringify(message.error)));
      else resolveCommand(message.result);
      return;
    }
    if (message.method) events.push(message);
  });

  ws.addEventListener('close', () => {
    const error = new Error('CDP socket closed');
    for (const { rejectCommand } of pending.values()) rejectCommand(error);
    pending.clear();
  });

  function send(method, params = {}) {
    return new Promise((resolveCommand, rejectCommand) => {
      if (ws.readyState !== WebSocket.OPEN) {
        rejectCommand(new Error('CDP socket is not open'));
        return;
      }
      const commandId = ++id;
      pending.set(commandId, { resolveCommand, rejectCommand });
      ws.send(JSON.stringify({ id: commandId, method, params }));
    });
  }

  return { send, events, close: () => ws.close() };
}

async function evaluate(client, expression, timeout = 12000) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(client, expression, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(client, `Boolean(${expression})`)) return;
    await delay(200);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function getGameSceneGeneration(client) {
  return evaluate(client, `window.marbleSortGame.scene.getScene('GameScene')._createGeneration || 0`);
}

async function waitForGameSceneCreated(client, levelId, beforeGeneration, options = {}) {
  const checks = [
    's.scene.isActive()',
    `s._createGeneration > ${beforeGeneration}`,
    `s.levelData?.level_id === ${levelId}`,
    's.blocks?.length > 0',
    's.boxColumns?.length === 4',
    's.conveyor'
  ];
  if (Number.isFinite(options.blocks)) checks.push(`s.blocks.length === ${options.blocks}`);
  if (typeof options.fromEditor === 'boolean') checks.push(`s.fromEditor === ${options.fromEditor}`);

  const condition = checks.join(' && ');
  const timeout = options.timeout || 12000;
  const start = Date.now();
  let lastState = null;

  while (Date.now() - start < timeout) {
    const result = await evaluate(client, `(async () => {
      const getScene = () => window.marbleSortGame.scene.getScene('GameScene');
      let s = getScene();
      const state = () => ({
        active: s.scene.isActive(),
        generation: s._createGeneration || 0,
        levelId: s.levelData?.level_id,
        blocks: s.blocks?.length || 0,
        columns: s.boxColumns?.length || 0,
        conveyor: Boolean(s.conveyor),
        fromEditor: s.fromEditor,
        activeScenes: window.marbleSortGame.scene.getScenes(true).map((scene) => scene.scene.key)
      });
      if (!(${condition})) return { ready: false, state: state() };
      const generation = s._createGeneration;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      s = getScene();
      return { ready: s._createGeneration === generation && ${condition}, state: state() };
    })()`, timeout);
    lastState = result.state;
    if (result.ready) return;
    await delay(100);
  }

  throw new Error(`Timed out waiting for stable GameScene level ${levelId}: ${JSON.stringify(lastState)}`);
}

async function startScene(client, sceneKey, data = {}) {
  await evaluate(client, `(() => {
    const manager = window.marbleSortGame.scene;
    manager.getScenes(true).forEach((scene) => manager.stop(scene.scene.key));
    manager.start('${sceneKey}', ${JSON.stringify(data)});
    return true;
  })()`);
}

async function restartGameScene(client, levelId, options = {}) {
  const beforeGeneration = await getGameSceneGeneration(client);
  const data = { levelId };
  if (typeof options.fromEditor === 'boolean') data.fromEditor = options.fromEditor;
  await startScene(client, 'GameScene', data);
  await waitForGameSceneCreated(client, levelId, beforeGeneration, options);
}

async function gameToViewport(client, x, y) {
  return evaluate(client, `(() => {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (${x} / 720) * rect.width,
      y: rect.top + (${y} / 1280) * rect.height
    };
  })()`);
}

async function clickGame(client, x, y) {
  const point = await gameToViewport(client, x, y);
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await delay(30);
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1
  });
  await delay(30);
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1
  });
}

async function assertNoInteractiveContainers(client, sceneKey) {
  const bad = await evaluate(client, `(() => {
    const scene = window.marbleSortGame.scene.getScene('${sceneKey}');
    const found = [];
    const walk = (node, path) => {
      if (node.type === 'Container' && node.input) found.push(path);
      if (node.list) node.list.forEach((child, index) => walk(child, path + '/' + (child.type || 'child') + '[' + index + ']'));
    };
    scene.children.list.forEach((child, index) => walk(child, (child.type || 'child') + '[' + index + ']'));
    return found;
  })()`);
  if (bad.length > 0) throw new Error(`${sceneKey} has interactive containers: ${bad.join(', ')}`);
}

async function setCustomLevel(client, level) {
  await evaluate(client, `window._customLevelData = ${JSON.stringify(level)}; true`);
  await restartGameScene(client, level.level_id, {
    blocks: level.blocks.length,
    fromEditor: true,
    timeout: 15000
  });
}

async function expectInvalidCustomLevelLoadError(client, level, expectedMessagePart) {
  const beforeGeneration = await getGameSceneGeneration(client);
  await evaluate(client, `window._customLevelData = ${JSON.stringify(level)}; true`);
  await startScene(client, 'GameScene', { levelId: level.level_id, fromEditor: true });
  await waitFor(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const texts = s.children.list
      .filter((child) => child.type === 'Text')
      .map((child) => child.text);
    return s.scene.isActive()
      && (s._createGeneration || 0) === ${beforeGeneration}
      && texts.includes('LEVEL LOAD ERROR')
      && texts.some((text) => text.includes(${JSON.stringify(expectedMessagePart)}));
  })()`, 5000);

  const state = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const texts = s.children.list
      .filter((child) => child.type === 'Text')
      .map((child) => child.text);
    return {
      generation: s._createGeneration || 0,
      levelId: s.levelData?.level_id,
      active: s.scene.isActive(),
      loadError: texts.includes('LEVEL LOAD ERROR'),
      expectedMessage: texts.some((text) => text.includes(${JSON.stringify(expectedMessagePart)})),
      normalTargetScene: (s.levelData?.level_id === ${level.level_id}) && s.blocks?.length > 0 && s.boxColumns?.length === 4 && Boolean(s.conveyor)
    };
  })()`);
  if (state.generation !== beforeGeneration || !state.loadError || !state.expectedMessage || state.normalTargetScene) {
    throw new Error(`Invalid level entered normal GameScene: ${JSON.stringify(state)}`);
  }
}

async function waitForColumnSettled(client, columnIndex, timeout = 18000) {
  await waitFor(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const column = s.boxColumns?.[${columnIndex}];
    const activeMarbles = s.marbles?.filter((marble) => marble.state !== 'destroyed').length || 0;
    return column?.isEmpty()
      && s.conveyor?.count() === 0
      && activeMarbles === 0;
  })()`, timeout);
}

function makeColumns(columns) {
  return [0, 1, 2, 3].map((col) => ({ col, boxes: columns[col] || [] }));
}

async function runConveyorBoxEdgeCases(client) {
  await setCustomLevel(client, {
    level_id: 99,
    name: 'Single Color Conveyor',
    difficulty: 0,
    board_size: { cols: 5, rows: 5 },
    blocks: [{ id: 'p0', col: 2, row: 2, z: 0, color: 'pink', is_hidden: false }],
    box_columns: makeColumns({ 0: ['pink', 'pink', 'pink'] }),
    conveyor_speed: 0.45,
    gravity_flip_enabled: false,
    magnet_count: 0
  });
  await clickGame(client, 360, 390);
  await waitFor(client, `window.marbleSortGame.scene.getScene('GameOverScene').scene.isActive()`, 14000);
  const singleResult = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameOverScene');
    return { result: s.result, levelId: s.levelId };
  })()`);
  if (singleResult.result !== 'win') throw new Error(`Scenario 1 expected win: ${JSON.stringify(singleResult)}`);
  console.log('ok - 02c scenario 1 single color boxes clear to victory');

  await setCustomLevel(client, {
    level_id: 99,
    name: 'Four Column Victory',
    difficulty: 0,
    board_size: { cols: 5, rows: 5 },
    blocks: [
      { id: 'pink', col: 0, row: 1, z: 0, color: 'pink', is_hidden: false },
      { id: 'blue', col: 1, row: 1, z: 0, color: 'blue', is_hidden: false },
      { id: 'green', col: 2, row: 1, z: 0, color: 'green', is_hidden: false },
      { id: 'yellow', col: 3, row: 1, z: 0, color: 'yellow', is_hidden: false }
    ],
    box_columns: makeColumns({
      0: ['pink', 'pink', 'pink'],
      1: ['blue', 'blue', 'blue'],
      2: ['green', 'green', 'green'],
      3: ['yellow', 'yellow', 'yellow']
    }),
    conveyor_speed: 0.5,
    gravity_flip_enabled: false,
    magnet_count: 0
  });
  for (const [columnIndex, blockId] of ['pink', 'blue', 'green', 'yellow'].entries()) {
    await evaluate(client, `(() => {
      const s = window.marbleSortGame.scene.getScene('GameScene');
      const block = s.blocks.find((candidate) => candidate.data.id === ${JSON.stringify(blockId)});
      s._onBlockTapped(block);
      return true;
    })()`);
    await waitForColumnSettled(client, columnIndex);
  }
  await waitFor(client, `window.marbleSortGame.scene.getScene('GameOverScene').scene.isActive()`, 4000);
  const fourColumnResult = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameOverScene');
    return { result: s.result, levelId: s.levelId };
  })()`);
  if (fourColumnResult.result !== 'win') {
    throw new Error(`Scenario 2 expected win: ${JSON.stringify(fourColumnResult)}`);
  }
  console.log('ok - 02c scenario 2 four color columns clear to victory');

  await setCustomLevel(client, {
    level_id: 99,
    name: 'Top Color Gate',
    difficulty: 0,
    board_size: { cols: 5, rows: 5 },
    blocks: [
      { id: 'blue', col: 1, row: 2, z: 0, color: 'blue', is_hidden: false },
      { id: 'pink', col: 3, row: 2, z: 0, color: 'pink', is_hidden: false }
    ],
    box_columns: makeColumns({ 0: ['pink', 'pink', 'pink', 'blue', 'blue', 'blue'] }),
    conveyor_speed: 0.5,
    gravity_flip_enabled: false,
    magnet_count: 0
  });
  await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    s._onBlockTapped(s.blocks.find((block) => block.data.id === 'blue'));
    return true;
  })()`);
  await delay(3500);
  const blocked = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const top = s.boxColumns[0].boxes[0];
    return {
      conveyorCount: s.conveyor.count(),
      topColor: top.color,
      topCount: top.current_count,
      blueStillMoving: s.conveyor.marbles.some((m) => m.color === 'blue' && m.state === 'on-conveyor')
    };
  })()`);
  if (blocked.topColor !== 'pink' || blocked.topCount !== 0 || !blocked.blueStillMoving) {
    throw new Error(`Scenario 3 top-color gate failed: ${JSON.stringify(blocked)}`);
  }
  console.log('ok - 02c scenario 3 wrong color loops until top box changes');

  await expectInvalidCustomLevelLoadError(client, {
    level_id: 98,
    name: 'Invalid Capacity',
    difficulty: 0,
    board_size: { cols: 5, rows: 5 },
    blocks: [{ id: 'pink', col: 2, row: 2, z: 0, color: 'pink', is_hidden: false }],
    box_columns: makeColumns({ 0: ['pink', 'pink', 'pink', 'pink'] }),
    conveyor_speed: 0.5,
    gravity_flip_enabled: false,
    magnet_count: 0
  }, 'Marble count');
  console.log('ok - 02c scenario 4 invalid level shows load error');

  await setCustomLevel(client, {
    level_id: 99,
    name: 'Deadlocked Conveyor',
    difficulty: 0,
    board_size: { cols: 5, rows: 5 },
    blocks: [
      { id: 'b0', col: 0, row: 0, z: 0, color: 'blue', is_hidden: false },
      { id: 'y0', col: 4, row: 0, z: 0, color: 'yellow', is_hidden: false }
    ],
    box_columns: makeColumns({ 0: ['yellow', 'yellow', 'yellow', 'blue', 'blue', 'blue'] }),
    conveyor_speed: 0.5,
    gravity_flip_enabled: false,
    magnet_count: 0
  });
  await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const fake = (slotIndex) => ({
      color: 'blue',
      slotIndex,
      t: s.conveyor._slotT(slotIndex),
      state: 'on-conveyor',
      sprite: { x: 0, y: 0 },
      setPositionDirect(x, y) { this.sprite.x = x; this.sprite.y = y; },
      flyTo(_x, _y, _duration, _ease, onComplete) { if (onComplete) onComplete(); },
      destroy() { this.state = 'destroyed'; }
    });
    s.conveyor._reservedSlots.clear();
    s.conveyor.marbles = Array.from(
      { length: s.conveyor.slotCount },
      (_value, slotIndex) => fake(slotIndex)
    );
    s.conveyor.update(16);
    return true;
  })()`);
  await waitFor(client, `window.marbleSortGame.scene.getScene('GameScene')._inputLocked === true`, 3000);
  const overflow = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const target = s.blocks.find((block) => block.data.id === 'y0');
    return {
      inputLocked: s._inputLocked,
      overflowFired: s.conveyor._overflowFired,
      count: s.conveyor.count(),
      targetEnabled: target.hitZone.input?.enabled === true
    };
  })()`);
  if (!overflow.inputLocked || !overflow.overflowFired || overflow.targetEnabled) {
    throw new Error(`Scenario 5 overflow failed: ${JSON.stringify(overflow)}`);
  }
  console.log('ok - 02c scenario 5 deadlocked full conveyor locks input once');

  await setCustomLevel(client, {
    level_id: 99,
    name: 'Concurrent Entry While Moving',
    difficulty: 0,
    board_size: { cols: 5, rows: 5 },
    blocks: [
      { id: 'pink', col: 1, row: 2, z: 0, color: 'pink', is_hidden: false },
      { id: 'blue', col: 3, row: 2, z: 0, color: 'blue', is_hidden: false }
    ],
    box_columns: makeColumns({ 0: ['blue', 'blue', 'blue', 'pink', 'pink', 'pink'] }),
    conveyor_speed: 0.18,
    gravity_flip_enabled: false,
    magnet_count: 0
  });
  await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    s._onBlockTapped(s.blocks.find((block) => block.data.id === 'pink'));
    return true;
  })()`);
  await waitFor(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    return s.conveyor.marbles.some((marble) => marble.color === 'pink' && marble.state === 'on-conveyor');
  })()`, 6000);
  const beforeSecondTap = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    return {
      conveyorCount: s.conveyor.count(),
      pinkOnConveyor: s.conveyor.marbles.filter((marble) => marble.color === 'pink').length,
      overflowFired: s.conveyor._overflowFired
    };
  })()`);
  await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    s._onBlockTapped(s.blocks.find((block) => block.data.id === 'blue'));
    return true;
  })()`);
  await waitFor(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    return s.marbles.some((marble) => marble.color === 'blue' && marble.state !== 'destroyed');
  })()`, 4000);
  const concurrentEntry = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    return {
      beforeCount: ${JSON.stringify(beforeSecondTap)}.conveyorCount,
      beforePink: ${JSON.stringify(beforeSecondTap)}.pinkOnConveyor,
      count: s.conveyor.count(),
      overflowFired: s.conveyor._overflowFired,
      blueCleared: s.blocks.find((block) => block.data.id === 'blue').isCleared,
      activeBlue: s.marbles.filter((marble) => marble.color === 'blue' && marble.state !== 'destroyed').length
    };
  })()`);
  if (
    beforeSecondTap.overflowFired
    || beforeSecondTap.pinkOnConveyor === 0
    || concurrentEntry.overflowFired
    || !concurrentEntry.blueCleared
    || concurrentEntry.activeBlue === 0
    || concurrentEntry.count > 24
  ) {
    throw new Error(`Scenario 6 concurrent entry failed: ${JSON.stringify(concurrentEntry)}`);
  }
  console.log('ok - 02c scenario 6 new block feeds while earlier marbles are moving');

  await setCustomLevel(client, {
    level_id: 99,
    name: 'Reveal Hit Zone',
    difficulty: 0,
    board_size: { cols: 5, rows: 5 },
    blocks: [
      { id: 'top', col: 2, row: 2, z: 1, color: 'pink', is_hidden: false },
      { id: 'hidden', col: 2, row: 2, z: 0, color: 'blue', is_hidden: true }
    ],
    walls: [],
    box_columns: makeColumns({
      0: ['pink', 'pink', 'pink'],
      1: ['blue', 'blue', 'blue']
    }),
    conveyor_speed: 0.1,
    gravity_flip_enabled: false,
    magnet_count: 0
  });
  const reveal = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    window.__revealedBlockTapCount = 0;
    s.events.on('block-tapped', () => { window.__revealedBlockTapCount += 1; });
    const top = s.blocks.find((block) => block.data.id === 'top');
    const hidden = s.blocks.find((block) => block.data.id === 'hidden');
    top.shatter();
    s.boardManager.onBlockCleared(top);
    return {
      hiddenCovered: hidden.isCovered,
      hiddenEnabled: hidden.hitZone.input?.enabled === true,
      x: hidden.container.x,
      y: hidden.container.y
    };
  })()`);
  if (reveal.hiddenCovered || !reveal.hiddenEnabled) {
    throw new Error(`Scenario 9 reveal enable failed: ${JSON.stringify(reveal)}`);
  }
  await clickGame(client, reveal.x, reveal.y);
  await delay(160);
  const revealClick = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const hidden = s.blocks.find((block) => block.data.id === 'hidden');
    return { tapCount: window.__revealedBlockTapCount, hiddenCleared: hidden.isCleared };
  })()`);
  if (revealClick.tapCount !== 1 || !revealClick.hiddenCleared) {
    throw new Error(`Scenario 9 revealed hitZone click failed: ${JSON.stringify(revealClick)}`);
  }
  console.log('ok - 02c hitZone reveal remains clickable');

  await setCustomLevel(client, {
    level_id: 99,
    name: 'Direct Conveyor Mechanics',
    difficulty: 0,
    board_size: { cols: 5, rows: 5 },
    blocks: [{ id: 'blue', col: 2, row: 2, z: 0, color: 'blue', is_hidden: false }],
    box_columns: makeColumns({ 0: ['blue', 'blue', 'blue'] }),
    conveyor_speed: 0.1,
    gravity_flip_enabled: false,
    magnet_count: 0
  });
  const direct = await evaluate(client, `(async () => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const fake = (color, t) => ({
      color,
      t,
      state: 'on-conveyor',
      sprite: { x: 0, y: 0 },
      setPositionDirect(x, y) { this.sprite.x = x; this.sprite.y = y; },
      flyTo(_x, _y, _duration, _ease, onComplete) { if (onComplete) onComplete(); },
      destroy() { this.state = 'destroyed'; }
    });
    const m0 = fake('blue', 0.2);
    s.conveyor.marbles = [m0];
    s.conveyor.setPaused(true);
    s.conveyor.update(1000);
    const pausedT = m0.t;
    s.conveyor.setPaused(false);
    s.conveyor.update(1000);
    const advanced = m0.t > pausedT;

    const m1 = fake('blue', 0.3);
    const m2 = fake('blue', 0.4);
    s.conveyor.marbles = [m1, m2];
    const magnetized = s.conveyor.magnetize('blue');
    await new Promise((resolve) => setTimeout(resolve, 260));
    const box = s.boxColumns[0].boxes[0];
    const boxCountAfterMagnet = box.current_count;
    box.current_count = 0;
    box.visual_filled = 0;
    box.reservedSlots = [];

    const slots = [
      s.boxColumns[0].reserveSlotForColor('blue'),
      s.boxColumns[0].reserveSlotForColor('blue'),
      s.boxColumns[0].reserveSlotForColor('blue'),
      s.boxColumns[0].reserveSlotForColor('blue')
    ];

    return {
      pausedT,
      advanced,
      magnetized,
      conveyorCount: s.conveyor.count(),
      boxCountAfterMagnet,
      fourthSlotAccepted: Boolean(slots[3]),
      nextBoxCount: s.boxColumns[0].boxes[0]?.current_count || 0,
      uniqueSlots: new Set(slots.slice(0, 3).map((slot) => slot && (slot.x + ':' + slot.y))).size
    };
  })()`);
  if (!direct.advanced || direct.magnetized !== 2 || direct.conveyorCount !== 0 || direct.boxCountAfterMagnet !== 2 || !direct.fourthSlotAccepted || direct.nextBoxCount !== 1 || direct.uniqueSlots !== 3) {
    throw new Error(`Scenarios 7/8/9 direct mechanics failed: ${JSON.stringify(direct)}`);
  }
  console.log('ok - 02c scenarios 7, 8, 9 magnetize, pause, and slot reserve work');

  await setCustomLevel(client, {
    level_id: 99,
    name: 'Immediate Top Advance',
    difficulty: 0,
    board_size: { cols: 5, rows: 5 },
    blocks: [
      { id: 'pink', col: 1, row: 2, z: 0, color: 'pink', is_hidden: false },
      { id: 'blue', col: 3, row: 2, z: 0, color: 'blue', is_hidden: false }
    ],
    box_columns: makeColumns({ 0: ['pink', 'pink', 'pink', 'blue', 'blue', 'blue'] }),
    conveyor_speed: 0.18,
    gravity_flip_enabled: false,
    magnet_count: 0
  });
  const immediateAdvance = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const column = s.boxColumns[0];
    const oldTop = column.boxes[0];
    const pinkSlots = [
      column.reserveSlotForColor('pink'),
      column.reserveSlotForColor('pink'),
      column.reserveSlotForColor('pink')
    ];
    const afterPink = column.getColorSequence();
    const blueSlot = column.reserveSlotForColor('blue');
    const rejectedPink = column.reserveSlotForColor('pink');
    return {
      pinkSlots: pinkSlots.map((slot) => slot?.slotIndex),
      oldTopVisualFilled: oldTop.visual_filled,
      afterPink,
      blueSlot: blueSlot?.slotIndex,
      rejectedPink: Boolean(rejectedPink),
      newTopCount: column.boxes[0]?.current_count || 0
    };
  })()`);
  if (
    immediateAdvance.pinkSlots.join(',') !== '0,1,2'
    || immediateAdvance.oldTopVisualFilled !== 0
    || immediateAdvance.afterPink[0] !== 'blue'
    || immediateAdvance.blueSlot !== 0
    || immediateAdvance.rejectedPink
    || immediateAdvance.newTopCount !== 1
  ) {
    throw new Error(`Scenario 10 immediate top advance failed: ${JSON.stringify(immediateAdvance)}`);
  }
  console.log('ok - 02c scenario 10 full top box advances before visual completion');
}

function assertNoBrowserErrors(client) {
  const errors = client.events.filter((event) => {
    if (event.method === 'Runtime.exceptionThrown') return true;
    if (event.method === 'Log.entryAdded') return ['error', 'assert'].includes(event.params.entry.level);
    if (event.method === 'Console.messageAdded') return event.params.message.level === 'error';
    return false;
  });
  if (errors.length > 0) {
    throw new Error(`Browser reported ${errors.length} errors:\n${JSON.stringify(errors, null, 2)}`);
  }
  console.log('ok - no browser console/runtime errors');
}

async function runBrowserChecks(client) {
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await client.send('Log.enable');
  await client.send('Console.enable');
  await client.send('Page.navigate', { url: `${BASE_URL}/?smoke=1` });
  await waitFor(client, 'window.Phaser && window.marbleSortGame && window.marbleSortGame.isBooted', 20000);
  await waitFor(client, `window.marbleSortGame.scene.getScene('MenuScene').scene.isActive()`, 20000);

  const bootState = await evaluate(client, `(() => {
    const game = window.marbleSortGame;
    return {
      menuActive: game.scene.getScene('MenuScene').scene.isActive(),
      canvasCount: document.querySelectorAll('canvas').length
    };
  })()`);
  if (!bootState.menuActive || bootState.canvasCount !== 1) throw new Error(`Bad boot state: ${JSON.stringify(bootState)}`);
  console.log('ok - browser boots to MenuScene');

  await assertNoInteractiveContainers(client, 'MenuScene');
  await clickGame(client, 360, 600);
  await waitFor(client, `window.marbleSortGame.scene.getScene('LevelSelectScene').scene.isActive()`);
  await assertNoInteractiveContainers(client, 'LevelSelectScene');
  console.log('ok - PLAY button hit zone starts LevelSelectScene');

  const beforeLevelCardGeneration = await getGameSceneGeneration(client);
  await clickGame(client, 360, 620);
  await waitForGameSceneCreated(client, 2, beforeLevelCardGeneration, { blocks: 12 });
  console.log('ok - level card hit zone starts conveyor level');

  await waitFor(client, `(() => {
    const gameScene = window.marbleSortGame.scene.getScene('GameScene');
    const backButton = gameScene.children.list.find((child) => (
      child.type === 'Container'
      && child.x === 48
      && child.y === 48
      && child.hitZone?.width === 80
      && child.hitZone?.height === 80
    ));
    return backButton?.hitZone?.input?.enabled === true
      && backButton.hitZone.listenerCount('pointerup') > 0
      && backButton.listenerCount('pointerup') > 0;
  })()`);
  await clickGame(client, 48, 48);
  await waitFor(client, `window.marbleSortGame.scene.getScene('LevelSelectScene').scene.isActive()`);
  console.log('ok - game back hit zone returns to level select');

  for (const levelId of [1, 2, 3]) {
    const expected = { 1: 9, 2: 12, 3: 17 }[levelId];
    await restartGameScene(client, levelId, { blocks: expected });
    const summary = await evaluate(client, `(() => {
      const s = window.marbleSortGame.scene.getScene('GameScene');
      return {
        blocks: s.blocks.length,
        columns: s.boxColumns.length,
        capacity: s.conveyor.count(),
        speed: s.conveyor.speed,
        boxes: s.boxColumns.map((column) => column.boxes.length)
      };
    })()`);
    if (summary.blocks !== expected || summary.columns !== 4) {
      throw new Error(`Level ${levelId} failed to load conveyor schema: ${JSON.stringify(summary)}`);
    }
    console.log(`ok - level ${levelId} loads conveyor schema (${summary.blocks} blocks, boxes ${summary.boxes.join('/')})`);
  }

  const hitZones = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const bad = s.blocks.find((b) => (
      !b.hitZone ||
      b.container.input ||
      b.hitZone.x !== b.container.x ||
      b.hitZone.y !== b.container.y ||
      b.hitZone.width !== 96 ||
      b.hitZone.height !== 96
    ));
    return bad ? {
      id: bad.data.id,
      containerInput: Boolean(bad.container.input),
      hitX: bad.hitZone?.x,
      hitY: bad.hitZone?.y,
      visualX: bad.container.x,
      visualY: bad.container.y
    } : null;
  })()`);
  if (hitZones) throw new Error(`Block hit zone mismatch: ${JSON.stringify(hitZones)}`);
  console.log('ok - block hit zones align with visuals');

  if (QUICK_BROWSER_SMOKE) {
    assertNoBrowserErrors(client);
    console.log('ok - quick browser smoke skips editor and long conveyor scenarios');
    return;
  }

  await startScene(client, 'EditorScene');
  await waitFor(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('EditorScene');
    return s.scene.isActive() && s.editorState;
  })()`);
  const beforeEditorPlayGeneration = await getGameSceneGeneration(client);
  const editorResult = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('EditorScene');
    s.editorState.clear();
    s.editorState.eraseMode = false;
    s.editorState.activeIsHidden = false;
    s.editorState.activeColor = 'pink';
    s.editorState.setActiveZ(0);
    s.editorState.placeBlock(0, 0);
    s._playTest();
    return {
      blocks: window._customLevelData.blocks.length,
      columns: window._customLevelData.box_columns.length,
      boxes: window._customLevelData.box_columns.flatMap((column) => column.boxes).length
    };
  })()`);
  if (editorResult.blocks !== 1 || editorResult.columns !== 4 || editorResult.boxes !== 3) {
    throw new Error(`Editor play-test handoff failed: ${JSON.stringify(editorResult)}`);
  }
  await waitForGameSceneCreated(client, 99, beforeEditorPlayGeneration, { blocks: 1, fromEditor: true });
  console.log('ok - editor exports conveyor box schema and starts custom play-test');

  await runConveyorBoxEdgeCases(client);

  const overlayDump = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    s._toggleDebugOverlay();
    s._updateDebugOverlay();
    return s._debugText.text;
  })()`);
  if (!overlayDump.includes('Conveyor') || !overlayDump.includes('Col0')) {
    throw new Error(`Debug overlay missing conveyor data: ${overlayDump}`);
  }
  console.log(`ok - debug overlay dump: ${overlayDump.split('\\n').slice(0, 3).join(' | ')}`);

  assertNoBrowserErrors(client);
}

async function main() {
  mkdirSync(USER_DATA_DIR, { recursive: true });
  const server = spawnProcess('npm', [
    'run',
    'dev',
    '--',
    '--host',
    '127.0.0.1',
    '--port',
    String(PORT),
    '--strictPort'
  ], {
    cwd: ROOT,
    stdoutFilter: (line) => DEBUG_OUTPUT || !/(VITE|Local:|ready in)/.test(line),
    stderrFilter: (line) => DEBUG_OUTPUT || !/(VITE|Local:|ready in)/.test(line)
  });
  let chrome;
  let client;

  try {
    await waitForJson(`${BASE_URL}/src/levels/level_test.json`, 10000);
    chrome = spawnProcess(CHROME_BIN, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${USER_DATA_DIR}`,
      '--window-size=720,1280',
      'about:blank'
    ], {
      stderrFilter: () => false
    });

    const targets = await waitForJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`, 15000);
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('Chrome page target not found');

    client = await createCdpClient(page.webSocketDebuggerUrl);
    await runBrowserChecks(client);
  } finally {
    if (client) client.close();
    if (chrome) chrome.kill('SIGTERM');
    server.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(`fail - ${error.stack || error.message}`);
  process.exit(1);
});
