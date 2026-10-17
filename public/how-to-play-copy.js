export const HOW_TO_PLAY_KEY = 'bonked-how-to-play-seen-v1';
export function helpControls({ mobile = false, controller = false } = {}) {
  if (controller)
    return {
      weapon: 'Press R1 to fire.',
      sky: 'Aim with the left stick. Press R1 to bonk.',
      drive: 'Left stick to steer · ✕ to accelerate',
    };
  if (mobile)
    return {
      weapon: 'Tap the weapon button to fire.',
      sky: 'Drag the stick to aim. Tap the beam button to bonk.',
      drive: 'Drag to steer · Your car accelerates automatically',
    };
  return {
    weapon: 'Press Enter to fire.',
    sky: 'Aim with WASD. Press Enter to bonk.',
    drive: 'WASD to drive · ← / → to nudge',
  };
}
export function hasSeenHowToPlay(storage) {
  try {
    return storage?.getItem(HOW_TO_PLAY_KEY) === '1';
  } catch {
    return false;
  }
}
export function rememberHowToPlay(storage) {
  try {
    storage?.setItem(HOW_TO_PLAY_KEY, '1');
  } catch {}
}
