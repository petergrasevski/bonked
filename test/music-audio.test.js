import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MusicAudio } from '../public/music-audio.js';
import { AudioMixer } from '../public/audio-mixer.js';
import { audioContext } from './audio-helpers.js';
test('music loads one compressed format, shares its request and reports retryable failure', async () => {
  const ctx = audioContext();
  let calls = 0,
    ok = false;
  const urls = [];
  const music = new MusicAudio(ctx, {
    format: 'mp3',
    fetcher: async (url) => {
      calls++;
      urls.push(url);
      return { ok, status: 503, arrayBuffer: async () => new ArrayBuffer(4) };
    },
  });
  const loading = music.load();
  assert.equal(music.load(), loading);
  assert.equal(await loading, false);
  assert.ok(music.error);
  ok = true;
  assert.equal(await music.load(), true);
  await music.load();
  assert.equal(calls, 2);
  assert.deepEqual(urls, ['/music/chill-menu.mp3', '/music/chill-menu.mp3']);
  assert.equal(music.error, null);
});
test('loop stays continuous across updates and resumes its position after mute/background', () => {
  const ctx = audioContext(),
    mixer = new AudioMixer(ctx),
    music = new MusicAudio(ctx, { mixer });
  music.buffer = { duration: 57 };
  music.update(false);
  assert.equal(music.loop, null);
  music.update(true);
  const first = music.loop;
  assert.equal(first.source.loop, true);
  assert.equal(first.gain.connections[0], mixer.bus('music'));
  for (let i = 0; i < 100; i++) music.update(true);
  assert.equal(music.loop, first);
  ctx.currentTime = 60;
  music.update(false);
  assert.equal(music.offset, 3);
  assert.equal(music.loop, null);
  assert.ok(first.source.stopped);
  first.source.end();
  assert.ok(first.source.disconnected);
  assert.ok(first.gain.disconnected);
  ctx.currentTime = 80;
  music.update(true);
  assert.deepEqual(music.loop.source.started, [80, 3]);
});
test('muting during a slow load cannot start music when the request completes', async () => {
  const ctx = audioContext(),
    mixer = new AudioMixer(ctx);
  let resolve;
  const music = new MusicAudio(ctx, { mixer, fetcher: () => new Promise((r) => (resolve = r)) });
  const pending = music.load();
  music.update(true);
  music.update(false);
  resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  await pending;
  assert.equal(music.loop, null);
  music.update(false);
  assert.equal(music.loop, null);
  music.update(true);
  assert.ok(music.loop);
});
test('speaker mute silences both game outputs, preserving sliders and separate voice output', () => {
  const ctx = audioContext(),
    voice = ctx.createGain();
  voice.gain.value = 1;
  voice.connect(ctx.destination);
  const mixer = new AudioMixer(ctx, { effects: 0.6, music: 0.3 });
  mixer.update(true);
  mixer.setMuted(true);
  mixer.update(true, 0.2, { musicEnabled: true });
  assert.equal(mixer.master.gain.value, 0);
  assert.equal(mixer.music.gain.value, 0);
  assert.equal(voice.gain.value, 1);
  mixer.setMuted(false);
  ctx.currentTime = 1;
  mixer.update(false, 0, { musicEnabled: true });
  assert.equal(mixer.master.gain.value, 0);
  assert.equal(mixer.music.gain.value, 0.24);
  mixer.update(true);
  assert.equal(mixer.master.gain.value, 0.48);
});
test('bundled loop formats are CC0, intact and each smaller than 750 KB', () => {
  const root = new URL('../public/music/', import.meta.url),
    manifest = JSON.parse(readFileSync(new URL('source.json', root)));
  assert.equal(manifest.licence, 'CC0-1.0');
  assert.equal(manifest.attributionRequired, false);
  assert.ok(Math.abs(manifest.duration - (32 * 4 * 60) / 135) < 1 / 44100);
  for (const [name, entry] of Object.entries(manifest.assets)) {
    const bytes = readFileSync(new URL(name, root));
    assert.equal(bytes.length, entry.bytes);
    assert.ok(bytes.length < 750000);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  }
});
