import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function processor(sampleRate = 48000) {
  let Processor;
  const sent = [];
  const context = {
    sampleRate,
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { postMessage: (data) => sent.push(data) };
      }
    },
    registerProcessor: (name, cls) => {
      Processor = cls;
    },
  };
  vm.runInNewContext(
    readFileSync(new URL('../public/voice-worklet.js', import.meta.url), 'utf8'),
    context,
  );
  return { p: new Processor(), sent };
}
test('microphone packets are bounded 20ms PCM and mute prevents transmission', () => {
  const { p, sent } = processor();
  const input = [[new Float32Array(128).fill(0.25)]],
    output = [[new Float32Array(128)]];
  for (let i = 0; i < 100; i++) p.process(input, output);
  assert.equal(sent.length, 0);
  p.port.onmessage({ data: { type: 'mute', muted: false } });
  for (let i = 0; i < 75; i++) p.process(input, output);
  assert.equal(sent.length, 10);
  assert.ok(sent.every((m) => m.buffer.byteLength === 640));
  assert.ok(
    output[0][0].every((x) => x === 0),
    'never play the local mic',
  );
  p.port.onmessage({ data: { type: 'mute', muted: true } });
  for (let i = 0; i < 10; i++) p.process(input, output);
  assert.equal(sent.length, 10);
});
test('remote voices mix after jitter prefill, stay bounded and clear on lobby leave', () => {
  const { p } = processor(44100),
    pcm = new Int16Array(320).fill(16000);
  for (let id = 0; id < 5; id++)
    for (let i = 0; i < 4; i++) p.port.onmessage({ data: { type: 'audio', id, pcm: pcm.buffer } });
  const output = [[new Float32Array(128)]];
  p.process([[]], output);
  assert.ok(output[0][0].some((x) => x > 0));
  assert.ok(output[0][0].every((x) => x <= 1 && x >= -1));
  for (let i = 0; i < 100; i++)
    p.port.onmessage({ data: { type: 'audio', id: 0, pcm: pcm.buffer } });
  const speaker = p.speakers.get(0);
  assert.ok(speaker.write - speaker.read < 3000);
  p.port.onmessage({ data: { type: 'clear' } });
  p.process([[]], output);
  assert.ok(output[0][0].every((x) => x === 0));
});
