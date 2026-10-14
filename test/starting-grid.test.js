import test from 'node:test';
import assert from 'node:assert/strict';
import {safeGridStartFraction,RESPAWN_PICKUP_CLEARANCE,randomGridSlots} from '../shared/starting-grid.js';
import {selectTrack,TRACK_LENGTH,PICKUP_LOCATIONS,BOOST_PADS,spawnCar,gridSlotDistance,START_FRACTION} from '../shared/game.js';
const wrapDistance=(a,b,length)=>Math.abs(((a-b+.5)%1+1)%1-.5)*length;
const fixture=(pickups=[],pads=[])=>({length:1000,pickups:pickups.map(fraction=>({fraction})),pads:pads.map(fraction=>({fraction,length:5}))});
test('random grids retain every available position exactly once, including empty and solo grids',()=>{
  for(let count=0;count<=8;count++)for(const random of [()=>0,()=>.999999,Math.random])assert.deepEqual(randomGridSlots(count,random).sort((a,b)=>a-b),Array.from({length:count},(_,i)=>i));
});
test('each four-car lineup is equally reachable, so every driver can occupy every slot',()=>{
  const lineups=new Set(),positions=Array.from({length:4},()=>[0,0,0,0]);
  for(let a=0;a<4;a++)for(let b=0;b<3;b++)for(let c=0;c<2;c++){
    const choices=[(a+.5)/4,(b+.5)/3,(c+.5)/2];const slots=randomGridSlots(4,()=>choices.shift());lineups.add(slots.join(','));slots.forEach((slot,driver)=>positions[driver][slot]++);
  }
  assert.equal(lineups.size,24);for(const counts of positions)assert.deepEqual(counts,[6,6,6,6]);
});
test('clear checkpoints and empty grids are unchanged',()=>{
  assert.equal(safeGridStartFraction(.2,8,fixture([.5])),.2);
  assert.equal(safeGridStartFraction(.2,0,fixture([.2])),.2);
});
test('a pickup within 20 metres of any grid row moves the entire formation past it',()=>{
  for(const count of [1,2,3,8])for(const slot of [0,count-1])for(const ahead of [-19,0,19,20]){
    const start=.3,pickup=start+(ahead-gridSlotDistance(slot))/1000;
    const result=safeGridStartFraction(start,count,fixture([pickup]));
    assert.ok(result>start);
    for(let i=0;i<count;i++)assert.ok((result-pickup)*1000-gridSlotDistance(i)>20);
  }
});
test('boost pads include their full length, and clustered pickups are skipped together',()=>{
  const data=fixture([.3,.345],[.32,.37]),start=.29,result=safeGridStartFraction(start,8,data);
  assert.ok(result>.37);
  for(const feature of [...data.pickups,...data.pads])for(let slot=0;slot<8;slot++){
    assert.ok((result-feature.fraction)*1000-gridSlotDistance(slot)>20+(feature.length||0)/2);
  }
});
test('nearby pickups across a lap boundary advance forward without wrapping progress backwards',()=>{
  const data=fixture([.995,.025]);
  for(const start of [.99,1.01,2.99,-.01]){
    const result=safeGridStartFraction(start,8,data);
    assert.ok(result>start&&result<start+.15);
    for(let slot=0;slot<8;slot++)for(const item of data.pickups){
      const carFraction=result-gridSlotDistance(slot)/data.length;
      assert.ok(wrapDistance(carFraction,item.fraction,data.length)>20);
    }
  }
});
test('all circuits retain clear initial grids and safe respawns for every grid size around every pickup',()=>{
  for(const id of ['coast','ice','desert']){
    selectTrack(id);
    for(let count=1;count<=8;count++){
      assert.equal(safeGridStartFraction(START_FRACTION,count),START_FRACTION);
      for(const feature of [...PICKUP_LOCATIONS,...BOOST_PADS])for(const offset of [-20,0,20]){
        const original=feature.fraction+offset/TRACK_LENGTH,result=safeGridStartFraction(original,count);
        assert.ok(result>=original&&result-original<1);
        const cars=Array.from({length:count},(_,slot)=>spawnCar(slot,result));
        for(const car of cars)for(const item of [...PICKUP_LOCATIONS,...BOOST_PADS])assert.ok(wrapDistance(car.trackFraction,item.fraction,TRACK_LENGTH)>RESPAWN_PICKUP_CLEARANCE+(item.length||0)/2-1e-6,`${id}: grid touches a pickup`);
        for(let slot=2;slot<count;slot++)assert.ok(Math.abs((cars[slot-2].progress-cars[slot].progress)*TRACK_LENGTH-5.5)<1e-8);
      }
    }
  }
  selectTrack('coast');
});
