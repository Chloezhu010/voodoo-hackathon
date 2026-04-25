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

  function send(method, params = {}) {
    return new Promise((resolveCommand, rejectCommand) => {
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
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    clickCount: 1
  });
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
  await clickGame(client, 594, 48);
  await waitFor(client, `window.marbleSortGame.scene.getScene('GameScene').scene.isActive()`);
  const customLevelActive = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    return s.fromEditor && s.levelId === 99 && s.blocks.length === 1;
  })()`);
  if (!customLevelActive) throw new Error('Editor Play Test hit zone did not start custom GameScene');
  console.log('ok - editor Play Test hit zone starts custom level');

  await evaluate(client, `window.marbleSortGame.scene.start('LevelSelectScene'); true`);
  await waitFor(client, `window.marbleSortGame.scene.getScene('LevelSelectScene').scene.isActive()`);
  await clickGame(client, 360, 620);
  await waitFor(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    return s.scene.isActive() && s.levelId === 2 && s.blocks && s.blocks.length > 0;
  })()`);
  console.log('ok - level card hit zone starts selected level');

  await clickGame(client, 48, 48);
  await waitFor(client, `window.marbleSortGame.scene.getScene('LevelSelectScene').scene.isActive()`);
  console.log('ok - game back hit zone returns to level select');

  await evaluate(client, `window.marbleSortGame.scene.start('GameOverScene', { result: 'lose', levelId: 1 }); true`);
  await waitFor(client, `window.marbleSortGame.scene.getScene('GameOverScene').scene.isActive()`);
  await assertNoInteractiveContainers(client, 'GameOverScene');
  await clickGame(client, 360, 650);
  await waitFor(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('GameScene');
    return s.scene.isActive() && s.levelId === 1;
  })()`);
  console.log('ok - GameOver retry hit zone restarts level');

  for (const levelId of [1, 2, 3]) {
    await evaluate(client, `window.marbleSortGame.scene.start('GameScene', { levelId: ${levelId} }); true`);
    await waitFor(client, `(() => {
      const s = window.marbleSortGame.scene.getScene('GameScene');
      return s.scene.isActive() && s.blocks && s.blocks.length > 0 && s.trays && s.trays.length > 0;
    })()`);
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

  await evaluate(client, `window.marbleSortGame.scene.start('GameScene', { levelId: 2 }); true`);
  await waitFor(client, `window.marbleSortGame.scene.getScene('GameScene').blocks`);
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

  await evaluate(client, `window.marbleSortGame.scene.start('GameScene', { levelId: 1 }); true`);
  await waitFor(client, `window.marbleSortGame.scene.getScene('GameScene').blocks`);
  const oneBlockResult = await evaluate(client, `(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const s = window.marbleSortGame.scene.getScene('GameScene');
    const block = s.blocks.find((b) => b.data.color === 'pink' && !b.isCovered);
    s._onBlockTapped(block);
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
    throw new Error(`Tap -> tray flow failed: ${JSON.stringify(oneBlockResult)}`);
  }
  console.log('ok - tapping a block fills matching tray');

  await evaluate(client, `window.marbleSortGame.scene.start('EditorScene'); true`);
  await waitFor(client, `window.marbleSortGame.scene.getScene('EditorScene').editorState`);
  const editorResult = await evaluate(client, `(() => {
    const s = window.marbleSortGame.scene.getScene('EditorScene');
    s.editorState.placeBlock(0, 0);
    s.editorState.toggleTray('pink');
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
  await waitFor(client, `window.marbleSortGame.scene.getScene('GameScene').scene.isActive()`);
  console.log('ok - editor exports and starts custom play-test');

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
  process.exitCode = 1;
});
