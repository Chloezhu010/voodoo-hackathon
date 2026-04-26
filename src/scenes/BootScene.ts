import { preloadArtAssets } from '../assets/artAssets.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    preloadArtAssets(this);
  }

  create(): void {
    this.scene.start('MenuScene');
  }
}
