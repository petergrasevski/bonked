import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readAudioSettings,
  saveAudioSettings,
  AUDIO_SETTINGS_KEY,
} from '../public/audio-settings.js';
test('new profiles and unavailable or corrupt storage use 40% effects and 100% music defaults', () => {
  for (const storage of [
    undefined,
    {
      getItem() {
        throw Error('blocked');
      },
    },
    { getItem: () => '{broken' },
    { getItem: () => 'null' },
    { getItem: () => '{}' },
    { getItem: () => '{"effects":"0","music":null}' },
  ]) {
    assert.deepEqual(readAudioSettings(storage), { effects: 0.4, music: 1, muted: false });
  }
  assert.doesNotThrow(() =>
    saveAudioSettings(
      {
        setItem() {
          throw Error('blocked');
        },
      },
      { effects: 0.4, music: 1, muted: false },
    ),
  );
});
test('volume preferences persist independently, including mute, and clamp stale values', () => {
  const data = new Map(),
    storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  saveAudioSettings(storage, { effects: 0, music: 0.73 });
  assert.deepEqual(readAudioSettings(storage), { effects: 0, music: 0.73, muted: false });
  storage.setItem(AUDIO_SETTINGS_KEY, '{"effects":-2,"music":4}');
  assert.deepEqual(readAudioSettings(storage), { effects: 0, music: 1, muted: false });
});

test('master mute persists separately without losing slider preferences', () => {
  const data = new Map(),
    storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) };
  saveAudioSettings(storage, { effects: 0.64, music: 0.21, muted: true });
  assert.deepEqual(readAudioSettings(storage), { effects: 0.64, music: 0.21, muted: true });
  saveAudioSettings(storage, { ...readAudioSettings(storage), muted: false });
  assert.deepEqual(readAudioSettings(storage), { effects: 0.64, music: 0.21, muted: false });
});
