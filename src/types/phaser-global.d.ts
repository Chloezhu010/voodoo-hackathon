// Phaser is loaded via <script> tag in index.html as a global. We install the
// `phaser` package only for its bundled .d.ts. This shim re-exposes those types
// on the global `Phaser` namespace so TS code can use `Phaser.Scene` etc. as if
// they were ambient — without bundling Phaser itself.

// eslint-disable-next-line @typescript-eslint/no-require-imports
import PhaserPkg = require('phaser');

declare global {
  namespace Phaser {
    export = PhaserPkg;
  }
  const Phaser: typeof PhaserPkg;
}

export {};
