// Grounded roof/side motion uses the same angular state as airborne tumbling.
// This is an arcade rocking body: roof and wheels are stable, the side is the
// tipping point. Inputs add torque; they never make the car immune to contacts.
const grounded = (car) =>
  car.overturned &&
  !car.falling &&
  !car.edgeBalance &&
  car.vy <= 0 &&
  car.y <= (car.groundY || 0) + 0.05;
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

export function stepRollover(car, input, dt) {
  if (!grounded(car)) return;
  const powered =
    !car.wrecked &&
    !car.eliminated &&
    !car.finished &&
    car.stun <= 0 &&
    input.throttle >= 0.9 &&
    Math.abs(input.steer) >= 0.9 &&
    !input.reverse &&
    !input.brake;
  // Stop applying engine torque once the wheels are nearly down. Gravity then
  // finishes the roll even if the driver keeps holding the recovery controls.
  const torque = powered && Math.cos(car.roll) < 0.65 ? Math.sign(input.steer) * 24 : 0;
  car.rollVelocity =
    (car.rollVelocity + (torque - 8 * Math.sin(2 * car.roll)) * dt) * Math.exp(-4 * dt);
  const previous = wrap(car.roll);
  car.roll = wrap(car.roll + car.rollVelocity * dt);
  if (Math.abs(car.roll) < 0.12 || (Math.abs(previous) < Math.PI / 2 && previous * car.roll < 0)) {
    car.overturned = false;
    car.roll = 0;
    car.pitch = 0;
    car.rollVelocity = 0;
    car.pitchVelocity = 0;
  }
}

export function shoveRollover(car, dvx, dvz) {
  if (!grounded(car)) return;
  // A side impulse below the centre of mass also turns the chassis. Resolve
  // this for each body, in its own heading, including during powered recovery.
  const sideways = -Math.sin(car.angle) * dvx + Math.cos(car.angle) * dvz;
  car.rollVelocity = Math.max(-9, Math.min(9, car.rollVelocity - sideways * 0.65));
}

export function rolloverLift(car) {
  if (!grounded(car)) return 0;
  // The renderer already rotates about a 0.5m COM. Lift the rounded chassis
  // footprint while it rocks so its side does not disappear below the road.
  return Math.max(
    0,
    1.05 * Math.abs(Math.sin(car.roll)) + 0.55 * Math.abs(Math.cos(car.roll)) - 0.5,
  );
}
