# Marble Sort Art Assets

This folder contains editable SVG exports of the game's procedural art.

- Run `npm run render:art` to regenerate the full set.
- Edit or replace SVG files directly when iterating on art.
- `manifest.json` maps each file to its intended in-game role.
- `contact-sheet.html` previews every asset in a browser.

The current runtime still draws most objects procedurally. These files are the
replaceable art source exports, ready to be wired into the Phaser scenes if the
project moves to a texture-driven pipeline.
