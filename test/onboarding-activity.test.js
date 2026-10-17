import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerActivity, INACTIVITY_MS } from '../server-activity.js';
import {
  helpControls,
  hasSeenHowToPlay,
  rememberHowToPlay,
  HOW_TO_PLAY_KEY,
} from '../public/how-to-play-copy.js';
import { createHelpPreview } from '../public/how-to-play.js';
import { createEliminationLine } from '../public/elimination-line.js';

test('network traffic cannot keep an idle player connected', () => {
  assert.equal(INACTIVITY_MS, 10 * 60 * 1000);
  const activity = new PlayerActivity(1000);
  assert.equal(
    activity.expired(1000 + 5 * 60 * 1000),
    false,
    'spectating for five minutes stays connected',
  );
  for (const type of ['ping', 'server-pong', 'net-report', 'input']) activity.message(type, 100000);
  assert.equal(activity.expired(1000 + INACTIVITY_MS - 1), false);
  assert.equal(activity.expired(1000 + INACTIVITY_MS), true);
  activity.message('activity', 125000);
  assert.equal(activity.expired(130000), false);
  activity.message('ready', 200000);
  assert.equal(activity.expired(200000 + INACTIVITY_MS), true);
});
test('help controls match touch, keyboard and standard controller fire and aim actions', () => {
  assert.match(helpControls().weapon, /Enter/);
  assert.match(helpControls().sky, /WASD/);
  assert.match(helpControls({ mobile: true }).weapon, /Tap/);
  assert.match(helpControls({ mobile: true }).sky, /stick/);
  assert.match(helpControls({ mobile: true, controller: true }).weapon, /R1/);
});
test('first visit is remembered only on dismissal and unavailable storage is tolerated', () => {
  const values = new Map(),
    storage = {
      getItem: (key) => values.get(key),
      setItem: (key, value) => values.set(key, value),
    };
  assert.equal(hasSeenHowToPlay(storage), false);
  rememberHowToPlay(storage);
  assert.equal(values.get(HOW_TO_PLAY_KEY), '1');
  assert.equal(hasSeenHowToPlay(storage), true);
  const unavailable = {
    getItem() {
      throw Error('blocked');
    },
    setItem() {
      throw Error('blocked');
    },
  };
  assert.equal(hasSeenHowToPlay(unavailable), false);
  assert.doesNotThrow(() => rememberHowToPlay(unavailable));
});
test('help and racing share the same red elimination line model', () => {
  const line = createEliminationLine();
  assert.equal(line.children.length, 4);
  assert.equal(line.children[0].material.color.getHex(), 0xff514f);
  assert.equal(line.children[1].material.transparent, true);
  assert.equal(line.children[1].geometry.parameters.height, 4);
});

test('speaking keeps party chat active but silent audio does not defeat the idle timeout', () => {
  const activity = new PlayerActivity(0);
  activity.voice(Buffer.alloc(640), 100000);
  assert.equal(activity.expired(INACTIVITY_MS), true);
  const speech = Buffer.alloc(640);
  for (let i = 0; i < 640; i += 2) speech.writeInt16LE(1500, i);
  activity.voice(speech, 100000);
  assert.equal(activity.expired(INACTIVITY_MS), false);
});
test('live sky preview uses the actual beam and pulse animation without a WebGL context', () => {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      setAttribute() {},
      getContext: () => ({
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      }),
    }),
  };
  try {
    const preview = createHelpPreview('sky');
    for (const time of [0, 0.3, 0.72, 0.82]) assert.doesNotThrow(() => preview.tick(time, 0.016));
    assert.equal(preview.scene.getObjectByName('sky-strike').visible, true);
    assert.ok(preview.scene.getObjectByName('weapon-ring').count > 0, 'impact has a live pulse');
    preview.tick(2.9, 0.016);
    assert.equal(
      preview.scene.getObjectByName('weapon-ring').count,
      0,
      'new cycle clears old pulses',
    );
    preview.target.dispose();
  } finally {
    globalThis.document = previous;
  }
});
