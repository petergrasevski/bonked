export const PULSE_RADIUS = 16;
export const pulsePush = (distance) => 22 * (1 - distance / PULSE_RADIUS) + 8;
