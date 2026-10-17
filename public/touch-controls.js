// Touch auto-drive begins at GO; manual countdown revving is optional.
export function driveThrottle({
  mobile = false,
  controllerConnected = false,
  phase,
  reverse = false,
  accelerating = false,
} = {}) {
  return reverse
    ? 0
    : accelerating || (mobile && !controllerConnected && phase === 'racing')
      ? 1
      : 0;
}

// A swipe is a short horizontal movement, including one made after holding to steer.
// Once recognised, that touch stops steering until lifted and emits only one nudge.
export class SteeringTouches {
  constructor() {
    this.touches = new Map();
  }
  start(id, x, y, time, bounds) {
    const point = { x, y, time };
    this.touches.set(id, {
      samples: [point],
      last: point,
      swiped: false,
      direction: this.direction(x, bounds),
    });
  }
  direction(x, { left, width }) {
    return x < left || x >= left + width ? 0 : x < left + width / 2 ? -1 : 1;
  }
  move(id, x, y, time, bounds) {
    const touch = this.touches.get(id);
    if (!touch || touch.swiped) return 0;
    touch.samples = touch.samples.filter((p) => time - p.time <= 250);
    if (!touch.samples.length) touch.samples.push({ ...touch.last, time });
    const point = { x, y, time },
      origin = touch.samples[0],
      dx = x - origin.x,
      dy = y - origin.y;
    touch.samples.push(point);
    touch.last = point;
    touch.direction = this.direction(x, bounds);
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      touch.swiped = true;
      touch.direction = 0;
      return Math.sign(dx);
    }
    return 0;
  }
  end(id) {
    this.touches.delete(id);
  }
  clear() {
    this.touches.clear();
  }
  get steer() {
    return Math.sign([...this.touches.values()].reduce((sum, touch) => sum + touch.direction, 0));
  }
}

export function bindTouchSteering(element, { enabled, steer, nudge, activate }) {
  const touches = new SteeringTouches();
  const release = (id) => {
    touches.end(id);
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
  };
  const reset = () => {
    for (const id of [...touches.touches.keys()]) release(id);
    steer(0);
  };
  element.addEventListener('pointerdown', (event) => {
    if (!enabled() || event.button !== 0) return;
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    touches.start(
      event.pointerId,
      event.clientX,
      event.clientY,
      event.timeStamp,
      element.getBoundingClientRect(),
    );
    activate();
    steer(touches.steer);
  });
  const move = (event) => {
    if (!touches.touches.has(event.pointerId)) return;
    if (!enabled()) {
      reset();
      return;
    }
    event.preventDefault();
    const direction = touches.move(
      event.pointerId,
      event.clientX,
      event.clientY,
      event.timeStamp,
      element.getBoundingClientRect(),
    );
    steer(touches.steer);
    if (direction) nudge(direction);
  };
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', (event) => {
    if (!touches.touches.has(event.pointerId)) return;
    move(event);
    release(event.pointerId);
    steer(touches.steer);
  });
  for (const type of ['pointercancel', 'lostpointercapture'])
    element.addEventListener(type, (event) => {
      if (!touches.touches.has(event.pointerId)) return;
      release(event.pointerId);
      steer(touches.steer);
    });
  return reset;
}

export function joystickVector(dx, dy, radius) {
  const length = Math.max(radius, Math.hypot(dx, dy));
  return { x: dx / length, y: -dy / length };
}
export function bindSkyJoystick(element, { enabled, move, activate = () => {} }) {
  let pointer = null;
  const knob = element.querySelector('span');
  const reset = () => {
    const id = pointer;
    pointer = null;
    move({ x: 0, y: 0 });
    knob.style.transform = 'translate(0,0)';
    if (id !== null && element.hasPointerCapture(id)) element.releasePointerCapture(id);
  };
  const update = (e) => {
    const r = element.getBoundingClientRect(),
      v = joystickVector(
        e.clientX - r.left - r.width / 2,
        e.clientY - r.top - r.height / 2,
        r.width * 0.32,
      );
    move(v);
    knob.style.transform = `translate(${v.x * r.width * 0.32}px,${-v.y * r.width * 0.32}px)`;
  };
  element.addEventListener('pointerdown', (e) => {
    if (!enabled() || pointer !== null || e.button !== 0) return;
    e.preventDefault();
    pointer = e.pointerId;
    element.setPointerCapture(pointer);
    activate();
    update(e);
  });
  element.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointer) return;
    if (!enabled()) return reset();
    e.preventDefault();
    update(e);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    element.addEventListener(type, (e) => {
      if (e.pointerId === pointer) reset();
    });
  return reset;
}
