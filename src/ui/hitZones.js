export function attachHitZone(scene, container, width, height, options = {}) {
  const hitZone = scene.add.zone(container.x, container.y, width, height);
  hitZone.setOrigin(0.5);
  hitZone.setInteractive({ useHandCursor: options.useHandCursor !== false });
  if (Number.isFinite(options.depth)) hitZone.setDepth(options.depth);

  ['pointerover', 'pointerout', 'pointerdown', 'pointerup'].forEach((eventName) => {
    hitZone.on(eventName, (...args) => {
      container.emit(eventName, ...args);
    });
  });

  container.once('destroy', () => {
    if (hitZone.scene) hitZone.destroy();
  });
  container.hitZone = hitZone;
  return hitZone;
}

export function makeWorldHitZone(scene, x, y, width, height, onPointerUp, options = {}) {
  const hitZone = scene.add.zone(x, y, width, height);
  hitZone.setOrigin(0.5);
  hitZone.setInteractive({ useHandCursor: options.useHandCursor !== false });
  if (Number.isFinite(options.depth)) hitZone.setDepth(options.depth);
  if (onPointerUp) hitZone.on('pointerup', onPointerUp);
  return hitZone;
}
