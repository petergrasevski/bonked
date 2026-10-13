import test from 'node:test';
import assert from 'node:assert/strict';
import {OptimisticBots} from '../public/lobby-bots.js';
test('pending bot slots appear immediately and confirmations do not duplicate them',()=>{
  let serial=0;const bots=new OptimisticBots({id:()=>String(++serial)}),players=[{id:'host'}];const first=bots.add(players,3),second=bots.add(players,3);assert.equal(bots.pending.length,2);assert.equal(bots.add(players,3),null);
  bots.reconcile([...players,{id:'somebody-else'}]);assert.equal(bots.pending.length,2);
  bots.reconcile([...players,{id:'bot1',botRequestId:first.id}]);assert.deepEqual(bots.pending,[second]);bots.reconcile([...players,{id:'bot1',botRequestId:first.id},{id:'bot2',botRequestId:second.id}]);assert.equal(bots.pending.length,0);
});
test('failed, timed-out and disconnected additions roll back without replaying requests',()=>{
  let now=0,serial=0;const bots=new OptimisticBots({now:()=>now,id:()=>String(++serial)}),a=bots.add([],8);bots.add([],8);bots.reject(a.id);assert.equal(bots.pending.length,1);now=9999;assert.equal(bots.expire(),false);now=10000;assert.equal(bots.expire(),true);assert.equal(bots.pending.length,0);bots.add([],8);bots.clear();assert.equal(bots.pending.length,0);
});
