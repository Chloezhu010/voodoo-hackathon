export function attachHitZone(scene, container, width, height, options = {}) {
  const hitZone = scene.add.zone(0, 0, width, height);
  hitZone.setOrigin(0.5);
  hitZone.setInteractive({ useHandCursor: options.useHandCursor !== false });

  ['pointerover', 'pointerout', 'pointerdown', 'pointerup'].forEach((eventName) => {
    hitZone.on(eventName, (...args) => {
      container.emit(eventName, ...args);
    });
  });

  container.add(hitZone);
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
