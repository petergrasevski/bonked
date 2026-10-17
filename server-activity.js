export const INACTIVITY_MS = 600000;
const actions = new Set([
  'activity',
  'create',
  'join',
  'leave',
  'start',
  'ready',
  'rematch',
  'lobby',
  'track',
  'bot',
  'remove-bot',
  'reset-scores',
  'item',
]);
export class PlayerActivity {
  constructor(now) {
    this.lastActivity = now;
  }
  message(type, now) {
    if (actions.has(type)) this.lastActivity = now;
  }
  voice(frame, now) {
    // Speech counts as activity; a silent open microphone does not.
    let energy = 0,
      count = 0;
    for (let i = 0; i + 1 < frame.length; i += 20) {
      const sample = frame.readInt16LE(i);
      energy += sample * sample;
      count++;
    }
    if (count && energy / count > 500 * 500) this.lastActivity = now;
  }
  expired(now) {
    return now - this.lastActivity >= INACTIVITY_MS;
  }
}
