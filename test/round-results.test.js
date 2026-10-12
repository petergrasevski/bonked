import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreSegments} from '../public/score-meter.js';
import {leaderboardResults,readyProgress} from '../public/round-results.js';

test('results follow current leaderboard totals even when the leader finished last',()=>{
  const state={players:[{id:'winner',score:3},{id:'leader',score:8,bot:true},{id:'runner',score:5,ready:true}],roundResults:[{id:'winner',rank:1,total:3},{id:'leader',rank:3,total:8},{id:'runner',rank:2,total:5}]};
  const results=leaderboardResults(state);
  assert.deepEqual(results.map(r=>r.id),['leader','runner','winner']);
  assert.deepEqual(results.map(r=>r.ready),[true,true,false]);
  assert.equal(state.roundResults[0].id,'winner');
});
test('score thermometers distinguish retained, gained and lost points across zero and target',()=>{
  assert.deepEqual(scoreSegments(5,10,3).slice(0,6).map(s=>s.state),['lit','lit','gained','gained','gained','empty']);
  assert.deepEqual(scoreSegments(3,10,-2).slice(0,6).map(s=>s.state),['lit','lit','lit','lost','lost','empty']);
  assert.equal(scoreSegments(-2,10,-3).filter(s=>s.state==='lost').length,3);
  assert.equal(scoreSegments(1,10,3).filter(s=>s.state==='gained').length,3);
  assert.equal(scoreSegments(12,10,3).length,12);
});
test('Ready fill uses the server deadline, including reconnecting halfway through the wait',()=>{
  assert.deepEqual([0,2500,5000,6000].map(t=>readyProgress(5000,t)),[0,.5,1,1]);
  assert.equal(readyProgress(5000,-1000),0);
  assert.equal(readyProgress(null,1000),0);
});
