import test from 'node:test';
import assert from 'node:assert/strict';
import { countdownText } from '../public/race-countdown.js';
test('the shared countdown advances through numbers and GO, then clears for every display mode', () => {
  for (const mode of ['lan', 'online']) {
    const state = { mode, phase: 'countdown', startAt: 4000 };
    assert.equal(countdownText(state, 1000), '3');
    assert.equal(countdownText(state, 3001), '1');
    state.phase = 'racing';
    assert.equal(countdownText(state, 4000), 'GO!');
    assert.equal(countdownText(state, 4799), 'GO!');
    assert.equal(countdownText(state, 4800), '');
    state.phase = 'finished';
    assert.equal(countdownText(state, 4800), '');
    state.phase = 'lobby';
    assert.equal(countdownText(state, 1000), '');
  }
  assert.equal(countdownText(null, 1000), '');
});
