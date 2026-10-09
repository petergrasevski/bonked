import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACK_LENGTH, START_FRACTION, spawnCar, trackAt, brakeMode } from '../shared/game.js';
import { CHASE_DISTANCE, CAMERA_LOOKAHEAD, createChase, updateChase, cameraFrame, raceOrder } from '../shared/chase.js';
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
test('shared camera bounds include both road edges from the line to 22 metres ahead of the leader',()=>{
  for(let distance=0;distance<TRACK_LENGTH*1.1;distance+=31){
    const chase=createChase([{progress:distance/TRACK_LENGTH}]);const f=cameraFrame(chase),c=Math.cos(f.angle),s=Math.sin(f.angle);
    for(let j=0;j<=20;j++){const p=trackAt(START_FRACTION+chase.progress+j/20*(CHASE_DISTANCE+CAMERA_LOOKAHEAD)/TRACK_LENGTH);for(const side of [-1,1]){const x=p.x+p.nx*p.halfWidth*side-f.x,z=p.z+p.nz*p.halfWidth*side-f.z;assert.ok(Math.abs(x*c+z*s)<f.halfWidth);assert.ok(Math.abs((-x*s+z*c)*.84)<f.halfHeight);}}
    assert.ok(f.halfWidth<82,'camera must not revert to the whole circuit');
  }
});
test('short brake hold drifts; 700ms hold reverses; release resets',()=>{
  assert.deepEqual(brakeMode(-1),{brake:false,reverse:false});assert.deepEqual(brakeMode(699),{brake:true,reverse:false});assert.deepEqual(brakeMode(700),{brake:false,reverse:true});assert.deepEqual(brakeMode(5000),{brake:false,reverse:true});
});
test('survivors rank ahead of eliminated players regardless of their frozen progress',()=>{
  const a=player('a',100),b=player('b',150);b.car.eliminated=true;b.car.eliminatedAt=9000;assert.equal([b,a].sort(raceOrder)[0].id,'a');
});
