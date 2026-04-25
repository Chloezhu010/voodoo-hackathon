interface AttachHitZoneOptions {
  useHandCursor?: boolean;
  depth?: number;
}

interface WorldHitZoneOptions extends AttachHitZoneOptions {
  depth?: number;
}

interface ContainerWithHitZone extends Phaser.GameObjects.Container {
  hitZone?: Phaser.GameObjects.Zone;
}

export function attachHitZone(
  scene: Phaser.Scene,
  container: ContainerWithHitZone,
  width: number,
  height: number,
  options: AttachHitZoneOptions = {},
): Phaser.GameObjects.Zone {
  const hitZone = scene.add.zone(0, 0, width, height);
  hitZone.setOrigin(0.5);
  hitZone.setInteractive({ useHandCursor: options.useHandCursor !== false });
  if (Number.isFinite(options.depth)) hitZone.setDepth(options.depth!);
  container.add(hitZone);

  (['pointerover', 'pointerout', 'pointerdown', 'pointerup'] as const).forEach((eventName) => {
    hitZone.on(eventName, (...args: unknown[]) => {
      container.emit(eventName, ...args);
    });
  });

  container.once('destroy', () => {
    if (hitZone.scene) hitZone.destroy();
  });
  container.hitZone = hitZone;
  return hitZone;
}

export function makeWorldHitZone(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  onPointerUp: ((...args: unknown[]) => void) | null,
  options: WorldHitZoneOptions = {},
): Phaser.GameObjects.Zone {
  const hitZone = scene.add.zone(x, y, width, height);
  hitZone.setOrigin(0.5);
  hitZone.setInteractive({ useHandCursor: options.useHandCursor !== false });
  if (Number.isFinite(options.depth)) hitZone.setDepth(options.depth!);
  if (onPointerUp) hitZone.on('pointerup', onPointerUp);
  return hitZone;
}
