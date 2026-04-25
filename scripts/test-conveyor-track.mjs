import ConveyorTrack from '../src/systems/ConveyorTrack.js';

const track = new ConveyorTrack();

function assertNear(label, point, expected, tolerance = 0.001) {
  const dx = Math.abs(point.x - expected.x);
  const dy = Math.abs(point.y - expected.y);
  if (dx > tolerance || dy > tolerance) {
    throw new Error(`${label}: got (${point.x.toFixed(2)}, ${point.y.toFixed(2)}), expected (${expected.x.toFixed(2)}, ${expected.y.toFixed(2)})`);
  }
  console.log(`ok - ${label}: (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`);
}

assertNear('t=0.00 entry', track.positionAt(0), { x: track.leftX, y: track.topY });
assertNear('t=0.40 upper right', track.positionAt(0.4 - Number.EPSILON), { x: track.rightX, y: track.topY });
assertNear('t=0.45 right arc outer', track.positionAt(0.45), { x: track.rightX + track.r, y: track.cy });
assertNear('t=0.90 lower left', track.positionAt(0.9 - Number.EPSILON), { x: track.leftX, y: track.bottomY });
assertNear('t=0.95 left arc outer', track.positionAt(0.95), { x: track.leftX - track.r, y: track.cy });
