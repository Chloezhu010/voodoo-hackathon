import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const PORT = Number(process.env.PORT || 8010);
const DEBUG_PORT = Number(process.env.DEBUG_PORT || 9224);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const USER_DATA_DIR = `/tmp/marble-sort-chrome-${DEBUG_PORT}`;
const DEBUG_OUTPUT = process.env.SMOKE_DEBUG === '1';

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
    } catch {}
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
      if (message.error) {
        rejectCommand(new Error(JSON.stringify(message.error)));
      } else {
        resolveCommand(message.result);
      }
      return;
    }
    if (message.method) events.push(message);
  });

  ws.addEventListener('close', () => {
    const error = new Error('CDP socket closed');
    for (const { rejectCommand } of pending.values()) {
      rejectCommand(error);
    }
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
    const value = await evaluate(client, `Boolean(${expression})`);
    if (value) return;
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
    `s.levelId === ${levelId}`,
    `s.levelData?.level_id === ${levelId}`,
    's.blocks?.length > 0',
    's.trays?.length > 0',
    's.queue'
  ];

  if (Number.isFinite(options.blocks)) checks.push(`s.blocks.length === ${options.blocks}`);
  if (Number.isFinite(options.trays)) checks.push(`s.trays.length === ${options.trays}`);
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
        levelId: s.levelId,
        levelDataId: s.levelData?.level_id,
        blocks: s.blocks?.length || 0,
        trays: s.trays?.length || 0,
        hasQueue: Boolean(s.queue),
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
    manager.getScenes(true).forEach((scene) => {
      manager.stop(scene.scene.key);
    });
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
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x,
    y: point.y
  });
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
      if (node.type === 'Container' && node.input) {
        found.push(path);
      }
      if (node.list) {
        node.list.forEach((child, index) => walk(child, path + '/' + (child.type || 'child') + '[' + index + ']'));
      }
    };
    scene.children.list.forEach((child, index) => walk(child, (child.type || 'child') + '[' + index + ']'));
    return found;
  })()`);
  if (bad.length > 0) {
    throw new Error(`${sceneKey} has interactive containers: ${bad.join(', ')}`);
  }
}

async function runQueueTrayEdgeCases(client) {
  const futureCountResult = await evaluate(client, `(() => {
    window._customLevelData = {
      level_id: 99,
      name: 'Future Count Test',
      board_size: { cols: 5, rows: 5 },
      blocks: [{ id: 'seed', col: 0, row: 0, z: 0, color: 'pink', is_hidden: false }],
      trays: [{ color: 'pink', capacity: 6 }],
      queue_capacity: 12,
      gravity_flip_enabled: false,
      magnet_count: 0
    };
    return true;
  })()`);
  if (!futureCountResult) throw new Error('Could not start future-count test scene');
  await restartGameScene(client, 99, { blocks: 1, trays: 1, fromEditor: true });

  const scenario2 = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const tray = s.trays[0];
    tray.current_count = 4;
    tray.visual_filled = 4;
    tray.reserved_slots = [];
    const makeMarble = (index) => ({
      color: 'pink',
      state: 'queued',
      slotIndex: index,
      sprite: { x: s.queue.slotPositions[index].x, y: s.queue.slotPositions[index].y },
      flyTo() {},
      destroy() { this.state = 'destroyed'; }
    });
    const marbles = [makeMarble(0), makeMarble(1), makeMarble(2)];
    s.queue.marbles = marbles;
    s.queue.evaluateMatching();
    return {
      queueLength: s.queue.marbles.length,
      remainingIsThird: s.queue.marbles[0] === marbles[2],
      remainingState: s.queue.marbles[0]?.state,
      currentCount: tray.current_count,
      visualFilled: tray.visual_filled,
      reserved: tray.reserved_slots.length,
      consumedStates: marbles.slice(0, 2).map((m) => m.state)
    };
  })()`);
  if (
    scenario2.queueLength !== 1 ||
    !scenario2.remainingIsThird ||
    scenario2.remainingState !== 'queued' ||
    scenario2.currentCount !== 6 ||
    scenario2.visualFilled !== 4 ||
    scenario2.reserved !== 2 ||
    scenario2.consumedStates.some((state) => state !== 'flying-to-tray')
  ) {
    throw new Error(`Scenario 2 future-count failed: ${JSON.stringify(scenario2)}`);
  }
  console.log('ok - 02b scenario 2 future-count prevents overfilling tray');

  await evaluate(client, `(() => {
    window._customLevelData = {
      level_id: 99,
      name: 'Overflow Lock Test',
      board_size: { cols: 5, rows: 5 },
      blocks: [
        { id: 'b0', col: 0, row: 0, z: 0, color: 'blue', is_hidden: false },
        { id: 'b1', col: 1, row: 0, z: 0, color: 'blue', is_hidden: false },
        { id: 'b2', col: 2, row: 0, z: 0, color: 'blue', is_hidden: false },
        { id: 'b3', col: 3, row: 0, z: 0, color: 'blue', is_hidden: false },
        { id: 'b4', col: 4, row: 0, z: 0, color: 'blue', is_hidden: false },
        { id: 'b5', col: 0, row: 1, z: 0, color: 'blue', is_hidden: false },
        { id: 'b6', col: 1, row: 1, z: 0, color: 'blue', is_hidden: false }
      ],
      trays: [{ color: 'pink', capacity: 6 }],
      queue_capacity: 12,
      gravity_flip_enabled: false,
      magnet_count: 0
    };
    return true;
  })()`);
  await restartGameScene(client, 99, { blocks: 7, trays: 1, fromEditor: true });
  await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    window.__postOverflowTapCount = 0;
    s.blocks.slice(0, 6).forEach((block) => s._onBlockTapped(block));
    return true;
  })()`);
  await waitFor(client, `window.marbleSortGame.scene.getScene('GameScene')._inputLocked === true`, 5000);
  const overflowBeforeClick = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    s.events.on('block-tapped', () => { window.__postOverflowTapCount += 1; });
    const target = s.blocks.find((block) => block.data.id === 'b6');
    return {
      queueLength: s.queue.marbles.length,
      overflowFired: s.queue._overflowFired,
      inputLocked: s._inputLocked,
      targetEnabled: target.hitZone.input?.enabled === true,
      targetX: target.container.x,
      targetY: target.container.y
    };
  })()`);
  if (
    overflowBeforeClick.queueLength !== 12 ||
    !overflowBeforeClick.overflowFired ||
    !overflowBeforeClick.inputLocked ||
    overflowBeforeClick.targetEnabled
  ) {
    throw new Error(`Scenario 1/7 pre-click overflow state failed: ${JSON.stringify(overflowBeforeClick)}`);
  }
  await clickGame(client, overflowBeforeClick.targetX, overflowBeforeClick.targetY);
  await delay(120);
  const overflowAfterClick = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const target = s.blocks.find((block) => block.data.id === 'b6');
    return {
      tapCount: window.__postOverflowTapCount,
      targetCleared: target.isCleared,
      queueLength: s.queue.marbles.length,
      inputLocked: s._inputLocked
    };
  })()`);
  if (
    overflowAfterClick.tapCount !== 0 ||
    overflowAfterClick.targetCleared ||
    overflowAfterClick.queueLength !== 12 ||
    !overflowAfterClick.inputLocked
  ) {
    throw new Error(`Scenario 8 post-overflow hitZone lock failed: ${JSON.stringify(overflowAfterClick)}`);
  }
  console.log('ok - 02b scenarios 1, 7, 8 overflow locks input and hitZones');

  await restartGameScene(client, 2, { blocks: 12, trays: 4 });
  const hiddenTarget = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    window.__revealedBlockTapCount = 0;
    s.events.on('block-tapped', () => { window.__revealedBlockTapCount += 1; });
    const top = s.blocks.find((block) => block.data.id === 't1');
    const hidden = s.blocks.find((block) => block.data.id === 'h1');
    top.shatter();
    s.boardManager.onBlockCleared(top);
    let hits = [];
    try {
      hits = s.input.manager.hitTest(
        { x: hidden.container.x, y: hidden.container.y },
        s.children.list,
        s.cameras.main
      ).map((obj) => ({
        type: obj.type,
        x: obj.x,
        y: obj.y,
        enabled: obj.input?.enabled,
        visible: obj.visible,
        depth: obj.depth
      }));
    } catch (error) {
      hits = [{ error: error.message }];
    }
    return {
      hiddenCovered: hidden.isCovered,
      hiddenEnabled: hidden.hitZone.input?.enabled === true,
      hiddenVisible: hidden.hitZone.visible,
      pointerupListeners: hidden.hitZone.listenerCount?.('pointerup') ?? -1,
      hits,
      x: hidden.container.x,
      y: hidden.container.y
    };
  })()`);
  if (hiddenTarget.hiddenCovered || !hiddenTarget.hiddenEnabled) {
    throw new Error(`Scenario 9 hidden block did not enable after reveal: ${JSON.stringify(hiddenTarget)}`);
  }
  await delay(260);
  await clickGame(client, hiddenTarget.x, hiddenTarget.y);
  await delay(160);
  const revealedClick = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const hidden = s.blocks.find((block) => block.data.id === 'h1');
    return {
      tapCount: window.__revealedBlockTapCount,
      hiddenCleared: hidden.isCleared,
      enabledAfterClick: hidden.hitZone.input?.enabled === true,
      pointerX: s.input.activePointer.x,
      pointerY: s.input.activePointer.y,
      pointerWorldX: s.input.activePointer.worldX,
      pointerWorldY: s.input.activePointer.worldY
    };
  })()`);
  if (revealedClick.tapCount !== 1 || !revealedClick.hiddenCleared || revealedClick.enabledAfterClick) {
    throw new Error(`Scenario 9 revealed hitZone click failed: ${JSON.stringify({ hiddenTarget, revealedClick })}`);
  }
  console.log('ok - 02b scenario 9 revealed hidden block hitZone becomes clickable');
}

async function runBrowserChecks(client) {
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Log.enable');
  await client.send('Console.enable');
  await client.send('Page.navigate', { url: `${BASE_URL}/?smoke=1` });
  await waitFor(client, 'window.Phaser && window.marbleSortGame && window.marbleSortGame.isBooted', 20000);

  const bootState = await evaluate(client, `(() => {
    const game = window.marbleSortGame;
    return {
      menuActive: game.scene.getScene('MenuScene').scene.isActive(),
      canvasCount: document.querySelectorAll('canvas').length,
      text: document.body.innerText
    };
  })()`);
  if (!bootState.menuActive) throw new Error('MenuScene is not active after boot');
  if (bootState.canvasCount !== 1) throw new Error(`Expected 1 canvas, got ${bootState.canvasCount}`);
  console.log('ok - browser boots to MenuScene');

  await assertNoInteractiveContainers(client, 'MenuScene');
  await clickGame(client, 360, 600);
  await waitFor(client, `window.marbleSortGame.scene.getScene('LevelSelectScene').scene.isActive()`);
  await assertNoInteractiveContainers(client, 'LevelSelectScene');
  console.log('ok - PLAY button hit zone starts LevelSelectScene');

  await clickGame(client, 50, 50);
  await waitFor(client, `window.marbleSortGame.scene.getScene('MenuScene').scene.isActive()`);
  console.log('ok - level select back hit zone returns to menu');

  await clickGame(client, 360, 740);
  await waitFor(client, `window.marbleSortGame.scene.getScene('EditorScene').scene.isActive()`);
  await assertNoInteractiveContainers(client, 'EditorScene');
  await clickGame(client, 180, 720);
  await clickGame(client, 540, 720);
  await clickGame(client, 612, 720);
  const editorControls = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('EditorScene');
    return {
      color: s.editorState.activeColor,
      hidden: s.editorState.activeIsHidden,
      erase: s.editorState.eraseMode
    };
  })()`);
  if (editorControls.color !== 'blue' || !editorControls.hidden || !editorControls.erase) {
    throw new Error(`Editor control hit zones failed: ${JSON.stringify(editorControls)}`);
  }
  console.log('ok - editor palette hit zones update state');

  await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('EditorScene');
    s.editorState.clear();
    s.editorState.eraseMode = false;
    s.editorState.activeIsHidden = false;
    s.editorState.activeColor = 'pink';
    s.editorState.setActiveZ(0);
    s.editorState.placeBlock(0, 0);
    s.editorState.trays = [{ color: 'pink', capacity: 6 }];
    s._renderAll();
    return true;
  })()`);
  const beforeEditorPlayGeneration = await getGameSceneGeneration(client);
  await clickGame(client, 594, 48);
  await waitForGameSceneCreated(client, 99, beforeEditorPlayGeneration, { blocks: 1, trays: 1, fromEditor: true });
  const customLevelActive = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    return s.fromEditor && s.levelId === 99 && s.blocks.length === 1;
  })()`);
  if (!customLevelActive) throw new Error('Editor Play Test hit zone did not start custom GameScene');
  console.log('ok - editor Play Test hit zone starts custom level');

  await startScene(client, 'LevelSelectScene');
  await waitFor(client, `window.marbleSortGame.scene.getScene('LevelSelectScene').scene.isActive()`);
  const beforeLevelCardGeneration = await getGameSceneGeneration(client);
  await clickGame(client, 360, 620);
  await waitForGameSceneCreated(client, 2, beforeLevelCardGeneration, { blocks: 12, trays: 4 });
  console.log('ok - level card hit zone starts selected level');

  await clickGame(client, 48, 48);
  await waitFor(client, `window.marbleSortGame.scene.getScene('LevelSelectScene').scene.isActive()`);
  console.log('ok - game back hit zone returns to level select');

  await startScene(client, 'GameOverScene', { result: 'lose', levelId: 1 });
  await waitFor(client, `window.marbleSortGame.scene.getScene('GameOverScene').scene.isActive()`);
  await assertNoInteractiveContainers(client, 'GameOverScene');
  const beforeRetryGeneration = await getGameSceneGeneration(client);
  await clickGame(client, 360, 650);
  await waitForGameSceneCreated(client, 1, beforeRetryGeneration, { blocks: 9, trays: 3 });
  console.log('ok - GameOver retry hit zone restarts level');

  for (const levelId of [1, 2, 3]) {
    const expected = {
      1: { blocks: 9, trays: 3 },
      2: { blocks: 12, trays: 4 },
      3: { blocks: 17, trays: 6 }
    }[levelId];
    await restartGameScene(client, levelId, expected);
    const summary = await evaluate(client, `(() => {
      const s = window.marbleSortGame.scene.getScene('GameScene');
      const badBlock = s.blocks.find((b) => !Number.isFinite(b.container.x) || !Number.isFinite(b.container.y));
      return {
        name: s.levelData.name,
        blocks: s.blocks.length,
        trays: s.trays.length,
        queueCapacity: s.queue.capacity,
        badBlock: badBlock ? badBlock.data.id : null
      };
    })()`);
    if (summary.badBlock) throw new Error(`Level ${levelId} has bad block position: ${summary.badBlock}`);
    console.log(`ok - level ${levelId} loads (${summary.blocks} blocks, ${summary.trays} trays)`);
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
      visualY: bad.container.y,
      width: bad.hitZone?.width,
      height: bad.hitZone?.height
    } : null;
  })()`);
  if (hitZones) throw new Error(`Block hit zone mismatch: ${JSON.stringify(hitZones)}`);
  console.log('ok - block hit zones align with visuals');

  await restartGameScene(client, 2, { blocks: 12, trays: 4 });
  const reveal = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const top = s.blocks.find((b) => b.data.id === 't1');
    const hidden = s.blocks.find((b) => b.data.id === 'h1');
    const before = hidden.isCovered === true;
    const disabledWhileCovered = !hidden.hitZone.input?.enabled;
    top.shatter();
    s.boardManager.onBlockCleared(top);
    return {
      before,
      disabledWhileCovered,
      after: hidden.isCovered,
      enabledAfterReveal: hidden.hitZone.input?.enabled === true,
      hiddenCleared: hidden.isCleared
    };
  })()`);
  if (!reveal.before || !reveal.disabledWhileCovered || reveal.after || !reveal.enabledAfterReveal || reveal.hiddenCleared) {
    throw new Error(`Hidden layer reveal failed: ${JSON.stringify(reveal)}`);
  }
  console.log('ok - hidden layer reveals when top block clears');

  await restartGameScene(client, 1, { blocks: 9, trays: 3 });
  await delay(300);
  const visibleBlockPoint = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const block = s.blocks.find((b) => b.data.color === 'pink' && !b.isCovered);
    window.__visibleBlockTapTarget = block.data.id;
    let hits = [];
    try {
      hits = s.input.manager.hitTest(
        { x: block.container.x, y: block.container.y },
        s.children.list,
        s.cameras.main
      ).map((obj) => ({
        type: obj.type,
        x: obj.x,
        y: obj.y,
        enabled: obj.input?.enabled,
        visible: obj.visible,
        depth: obj.depth
      }));
    } catch (error) {
      hits = [{ error: error.message }];
    }
    return {
      id: block.data.id,
      x: block.container.x,
      y: block.container.y,
      enabled: block.hitZone.input?.enabled,
      visible: block.hitZone.visible,
      listeners: block.hitZone.listenerCount?.('pointerup') ?? -1,
      hits
    };
  })()`);
  await clickGame(client, visibleBlockPoint.x, visibleBlockPoint.y);
  await delay(300);
  const oneBlockResult = await evaluate(client, `(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const block = s.blocks.find((b) => b.data.id === window.__visibleBlockTapTarget);
    const tray = s.trays.find((t) => t.color === 'pink');
    const start = performance.now();
    while (tray.filled < 6 && performance.now() - start < 7000) {
      await wait(100);
    }
    return {
      trayFilled: tray.filled,
      blockCleared: block.isCleared,
      queueLength: s.queue.marbles.length,
      sceneActive: s.scene.isActive()
    };
  })()`, 9000);
  if (!oneBlockResult.blockCleared || oneBlockResult.trayFilled !== 6) {
    const errorsSoFar = client.events.filter((event) => (
      event.method === 'Runtime.exceptionThrown' ||
      (event.method === 'Log.entryAdded' && ['error', 'assert'].includes(event.params.entry.level)) ||
      (event.method === 'Console.messageAdded' && event.params.message.level === 'error')
    ));
    throw new Error(`Tap -> tray flow failed: ${JSON.stringify({ visibleBlockPoint, oneBlockResult, errorsSoFar })}`);
  }
  console.log('ok - tapping a block fills matching tray');

  await startScene(client, 'EditorScene');
  await waitFor(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('EditorScene');
    return s.scene.isActive() && s.editorState;
  })()`);
  const beforeEditorHandoffGeneration = await getGameSceneGeneration(client);
  const editorResult = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('EditorScene');
    s.editorState.clear();
    s.editorState.eraseMode = false;
    s.editorState.activeIsHidden = false;
    s.editorState.activeColor = 'pink';
    s.editorState.setActiveZ(0);
    s.editorState.placeBlock(0, 0);
    s.editorState.trays = [{ color: 'pink', capacity: 6 }];
    const json = s.editorState.exportJSON();
    s.editorState.importJSON(json);
    s._playTest();
    return {
      blocks: window._customLevelData.blocks.length,
      trays: window._customLevelData.trays.length,
      customLevel: window._customLevelData.level_id
    };
  })()`);
  if (editorResult.blocks !== 1 || editorResult.trays !== 1 || editorResult.customLevel !== 99) {
    throw new Error(`Editor play-test handoff failed: ${JSON.stringify(editorResult)}`);
  }
  await waitForGameSceneCreated(client, 99, beforeEditorHandoffGeneration, { blocks: 1, trays: 1, fromEditor: true });
  console.log('ok - editor exports and starts custom play-test');

  await runQueueTrayEdgeCases(client);

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

async function main() {
  mkdirSync(USER_DATA_DIR, { recursive: true });
  const server = spawnProcess('python3', ['-m', 'http.server', String(PORT)], {
    cwd: ROOT,
    stderrFilter: (line) => !/ "GET /.test(line) && !/ "HEAD /.test(line)
  });
  let chrome;
  let client;

  try {
    await waitForJson(`${BASE_URL}/src/levels/level_01.json`, 10000);
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
