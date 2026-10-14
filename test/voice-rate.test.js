import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceRelayBudget} from '../server-voice.js';
test('normal microphone timing and half-second catch-up do not exhaust relay allowance',()=>{
  const budget=new VoiceRelayBudget(0);
  for(let now=0;now<10000;now+=20)assert.equal(budget.take(now),true);
  for(let i=0;i<25;i++)assert.equal(budget.take(10500),true);
  for(let now=10520;now<15000;now+=20)assert.equal(budget.take(now),true);
});
test('excess frames are bounded, refill automatically, and do not affect another speaker',()=>{
  const budget=new VoiceRelayBudget(0),other=new VoiceRelayBudget(0);
  const accepted=Array.from({length:5000},()=>budget.take(1000)).filter(Boolean).length;
  assert.equal(accepted,25);assert.equal(other.take(1000),true);
  assert.equal(budget.take(1001),false);
  for(let now=1020;now<3000;now+=20)assert.equal(budget.take(now),true);
});
