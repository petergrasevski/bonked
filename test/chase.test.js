import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK_LENGTH, spawnCar, brakeMode } from '../shared/game.js';
import { CHASE_DISTANCE, createChase, updateChase, raceOrder } from '../shared/chase.js';
const player=(id,distance)=>({id,car:{...spawnCar(),progress:distance/TRACK_LENGTH}});
test('line is fixed distance, unaffected by time or a stopped leader',()=>{
  const players=[player('a',100),player('b',40)],chase=createChase(players.map(p=>p.car));
  updateChase(chase,players,0);const line=chase.progress;
  updateChase(chase,players,90000);assert.equal(chase.progress,line);assert.equal((chase.leaderProgress-line)*TRACK_LENGTH,CHASE_DISTANCE);assert.ok(!players[1].car.eliminated);
});
test('crossing the line eliminates once and cannot be undone by overtaking or reversing',()=>{
  const a=player('a',CHASE_DISTANCE+10),b=player('b',9),c=player('c',11),chase=createChase([a.car,b.car,c.car]);
  assert.deepEqual(updateChase(chase,[a,b,c],1000).map(p=>p.id),['b']);assert.equal(b.car.eliminatedAt,1000);
  a.car.progress=0;c.car.progress=50/TRACK_LENGTH;
  updateChase(chase,[a,b,c],2000);assert.equal(chase.leaderId,'c');assert.ok(b.car.eliminated);assert.equal(b.car.eliminatedAt,1000);
});
test('grid fits inside the cutoff, including across the lap seam',()=>{
  const players=Array.from({length:6},(_,i)=>({id:String(i),car:spawnCar(i)})),chase=createChase(players.map(p=>p.car));
  assert.equal(updateChase(chase,players,0).length,0);
  players[0].car.progress=.99;players[1].car.progress=1.01;
  updateChase(chase,players,5000);assert.equal(chase.leaderId,'1');assert.ok(!players[0].car.eliminated);
});
test('short brake hold drifts; 350ms hold reverses; release resets',()=>{
  assert.deepEqual(brakeMode(-1),{brake:false,reverse:false});assert.deepEqual(brakeMode(349),{brake:true,reverse:false});assert.deepEqual(brakeMode(350),{brake:false,reverse:true});assert.deepEqual(brakeMode(5000),{brake:false,reverse:true});
});
test('survivors rank ahead of eliminated players regardless of their frozen progress',()=>{
  const a=player('a',100),b=player('b',150);b.car.eliminated=true;b.car.eliminatedAt=9000;assert.equal([b,a].sort(raceOrder)[0].id,'a');
});
