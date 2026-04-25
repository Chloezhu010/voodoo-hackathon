# Marble Sort!

Browser prototype for the Voodoo Game Jam Track 1 physics puzzle brief.

## Run Locally

```bash
cd marble-sort
python3 -m http.server 8000
```

Open `http://localhost:8000`.

The project uses Phaser 3.70 from CDN, Vanilla JavaScript ES modules, and no build step.

## Test Loop

Fast checks:

```bash
node scripts/validate.mjs
```

Browser smoke checks:

```bash
node scripts/smoke-browser.mjs
```

The browser smoke test starts its own local server and a headless Chrome instance, then checks scene boot, level loading, hidden-layer reveal, tap-to-tray flow, editor export/import, and console/runtime errors.
