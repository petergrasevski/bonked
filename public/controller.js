export const STANDARD_MAPPING = {
  steerAxis: 0,
  aimAxis: 1,
  invertSteer: false,
  invertAim: false,
  buttons: {
    throttle: 0,
    reverse: 2,
    fire: 5,
    left: 6,
    right: 7,
    ready: 9,
    steerLeft: null,
    steerRight: null,
  },
};
const neutral = () => ({
  connected: false,
  aimY: 0,
  steer: 0,
  throttle: 0,
  reverse: false,
  fire: false,
  left: false,
  right: false,
  ready: false,
});
export function gamepadButton(pad, index) {
  return (
    Number.isInteger(index) &&
    (!!pad?.buttons[index]?.pressed || (pad?.buttons[index]?.value || 0) > 0.3)
  );
}
const axisValue = (value) => {
  if (!Number.isFinite(value)) return 0;
  const dead = 0.14,
    magnitude = Math.min(1, Math.abs(value));
  return magnitude <= dead ? 0 : (Math.sign(value) * (magnitude - dead)) / (1 - dead);
};
export function controllerMapping(mapping, pad) {
  if (!mapping || !pad) return null;
  const axis = (index) =>
    Number.isInteger(index) && index >= 0 && index < pad.axes.length ? index : null;
  const button = (index) =>
    Number.isInteger(index) && index >= 0 && index < pad.buttons.length ? index : null;
  const buttons = Object.fromEntries(
    Object.keys(STANDARD_MAPPING.buttons).map((key) => [key, button(mapping.buttons?.[key])]),
  );
  const steerAxis = axis(mapping.steerAxis);
  if (steerAxis === null && (buttons.steerLeft === null || buttons.steerRight === null))
    return null;
  if (['throttle', 'reverse', 'fire'].some((key) => buttons[key] === null)) return null;
  return {
    steerAxis,
    aimAxis: axis(mapping.aimAxis),
    invertSteer: !!mapping.invertSteer,
    invertAim: !!mapping.invertAim,
    buttons,
  };
}
export function decodeController(pad, mapping) {
  if (!pad?.connected) return neutral();
  mapping ??= pad.mapping === 'standard' ? STANDARD_MAPPING : null;
  if (!mapping) return neutral();
  const pressed = (key) => gamepadButton(pad, mapping.buttons[key]);
  const digital = (pressed('steerRight') ? 1 : 0) - (pressed('steerLeft') ? 1 : 0);
  return {
    connected: true,
    steer: digital || axisValue(pad.axes[mapping.steerAxis]) * (mapping.invertSteer ? -1 : 1),
    aimY: -axisValue(pad.axes[mapping.aimAxis]) * (mapping.invertAim ? -1 : 1),
    throttle: pressed('throttle') ? 1 : 0,
    reverse: pressed('reverse'),
    fire: pressed('fire'),
    left: pressed('left'),
    right: pressed('right'),
    ready: pressed('ready'),
  };
}
export function readController(pads) {
  return decodeController(
    Array.from(pads || []).find((p) => p?.connected && p.mapping === 'standard'),
  );
}
export function controllerName(id = '') {
  if (/dualsense|054c.*(?:0ce6|0df2)/i.test(id)) return 'DualSense';
  if (/dualshock|054c.*(?:05c4|09cc)/i.test(id)) return 'DualShock';
  if (/joy.?con/i.test(id))
    return /\(L\)/i.test(id) ? 'Joy-Con Left' : /\(R\)/i.test(id) ? 'Joy-Con Right' : 'Joy-Con';
  if (/switch.*pro|pro controller|057e.*2009/i.test(id)) return 'Switch Pro';
  if (/xbox|xinput/i.test(id)) return 'Xbox';
  return 'Controller';
}
