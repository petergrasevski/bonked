import {
  angleDelta,
  updateFactoryMechanics,
  stepCar,
  collideCoastalCrabs,
  collideDesertMoles,
  collideCars,
  resolveNudges,
  NEUTRAL,
} from './game.js';
// Use the same measured derivatives in snapshots and local prediction. These
// follow actual drift, nudges, slopes and contacts rather than chassis heading.
export const captureMotion = (car) => ({
  x: car.x,
  y: car.y,
  z: car.z,
  angle: car.angle,
  pitch: car.pitch || 0,
  roll: car.roll || 0,
  progress: car.progress || 0,
});
export function recordMotion(car, old, dt) {
  car.renderVx = (car.x - old.x) / dt;
  car.renderVz = (car.z - old.z) / dt;
  car.renderTurn = angleDelta(car.angle, old.angle) / dt;
  car.renderRise = (car.y - old.y) / dt;
  car.renderPitch = angleDelta(car.pitch || 0, old.pitch) / dt;
  car.renderRoll = angleDelta(car.roll || 0, old.roll) / dt;
  car.renderProgress = ((car.progress || 0) - old.progress) / dt;
}
// All cars advance on one timeline, using the actual replicated steering input.
// Linear extrapolation loses the turn rate and snaps back at every snapshot.
export function predictFleet(local, others, input, dt) {
  const fleet = [local, ...others],
    before = fleet.map(captureMotion);
  updateFactoryMechanics(fleet, (local.raceTime || 0) + dt);
  for (const car of fleet) {
    stepCar(car, car === local ? input : car.input || NEUTRAL, dt);
    car.raceTime = (car.raceTime || 0) + dt;
    collideDesertMoles(car, car.raceTime, { damage: false });
    collideCoastalCrabs(car, car.raceTime);
  }
  resolveNudges(fleet, { damage: false });
  collideCars(fleet, { road: true, damage: false });
  // Measure the final poses: nudges and contact resolution move the chassis too.
  // Their displacement must not alternate with motionless 120 Hz render frames.
  for (let i = 0; i < fleet.length; i++) recordMotion(fleet[i], before[i], dt);
}
