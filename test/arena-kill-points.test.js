import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomEngine} from '../shared/room-engine.js';
import {giveWeapon,pressWeapon,updateCombat} from '../shared/combat.js';
import {scoreRound} from '../shared/tournament.js';

function fixture(){
  let id=0;const engine=createRoomEngine({randomUUID:()=>String(++id),randomBytes:n=>new Uint8Array(n)}),room={trackId:'cafe',code:'TEST',players:new Map()};
  engine.resetRoom(room,{newTournament:true});const attacker=engine.addPlayer(room,{},'Attacker'),victim=engine.addPlayer(room,{},'Victim');engine.startRound(room,0);room.phase='racing';
  Object.assign(attacker.car,{x:-60,z:0,y:0,angle:0});Object.assign(victim.car,{x:-50,z:0,y:0,angle:0,health:1});
  return {engine,room,attacker,victim};
}
for(const weapon of ['railgun','machinegun','plasma','rocket','pulse','taser','flame','shotgun','mine','chain'])test(`${weapon} credits exactly one arena kill bonus to its owner`,()=>{
  const {engine,room,attacker,victim}=fixture();giveWeapon(attacker.car,weapon);
  if(['pulse','taser'].includes(weapon))victim.car.x=-55;
  if(weapon==='flame')victim.car.x=-65;
  if(weapon==='shotgun')Object.assign(victim.car,{x:-60,z:5});
  if(['taser','flame'].includes(weapon)){attacker.simInput={fire:true};updateCombat(room,.1,10000);}
  else{
    pressWeapon(room,attacker,10000);
    if(weapon==='mine'){Object.assign(victim.car,{x:room.mines[0].x,z:room.mines[0].z});}
    if(weapon==='chain'){Object.assign(victim.car,{x:room.chains[0].x,z:room.chains[0].z});}
    updateCombat(room,weapon==='rocket'?.2:weapon==='machinegun'?.02:.1,10200);
  }
  assert.equal(victim.car.eliminated,true);assert.equal(attacker.score,1);assert.equal(attacker.roundKills,1);assert.equal(victim.score,0);
  const effects=room.effects.filter(e=>e.kind==='kill-score');assert.equal(effects.length,1);assert.equal(effects[0].owner,attacker.id);assert.equal(effects[0].victim,victim.id);assert.equal(effects[0].duration,1100);
  assert.equal(engine.snapshot(room).players.find(p=>p.id===attacker.id).score,1,'score is visible before round end');
  giveWeapon(attacker.car,'railgun');pressWeapon(room,attacker,10300);assert.equal(attacker.score,1,'wrecks cannot be scored again');
});
test('nonlethal hits, shields, self kills and race kills do not earn arena bonuses',()=>{
  let {room,attacker,victim}=fixture();victim.car.health=100;giveWeapon(attacker.car,'railgun');pressWeapon(room,attacker,10000);assert.equal(victim.car.health,25);assert.equal(attacker.score,0);
  ({room,attacker,victim}=fixture());victim.car.shield=8;giveWeapon(attacker.car,'railgun');pressWeapon(room,attacker,10000);assert.equal(attacker.score,0);
  ({room,attacker,victim}=fixture());attacker.car.health=1;giveWeapon(attacker.car,'mine');pressWeapon(room,attacker,10000);Object.assign(attacker.car,{x:room.mines[0].x,z:room.mines[0].z});updateCombat(room,.1,10200);assert.equal(attacker.car.eliminated,true);assert.equal(attacker.score,0);
  ({room,attacker,victim}=fixture());room.gameType='battle-race';giveWeapon(attacker.car,'railgun');pressWeapon(room,attacker,10000);assert.equal(victim.car.eliminated,true);assert.equal(attacker.score,0);
});
test('placement and kill points combine once, and zero-floor losses cannot erase earned kills',()=>{
  let {room,attacker,victim}=fixture();giveWeapon(attacker.car,'railgun');pressWeapon(room,attacker,10000);scoreRound(room,11000);assert.equal(attacker.score,4);assert.equal(room.roundResults[0].delta,4);scoreRound(room,12000);assert.equal(attacker.score,4);
  ({room,attacker,victim}=fixture());attacker.score=1;attacker.roundKills=1;Object.assign(attacker.car,{eliminated:true,health:0,eliminatedAt:10});Object.assign(victim.car,{eliminated:true,health:0,eliminatedAt:20});scoreRound(room,11000);assert.equal(attacker.score,1);assert.equal(room.roundResults.at(-1).delta,1);
});
test('prediction cannot award points or popups, and the next round clears kill counters',()=>{
  const {engine,room,attacker,victim}=fixture();room.visualOnly=true;giveWeapon(attacker.car,'railgun');pressWeapon(room,attacker,10000);assert.equal(victim.car.health,1);assert.equal(attacker.score,0);assert.equal(room.effects.filter(e=>e.kind==='kill-score').length,0);
  room.visualOnly=false;giveWeapon(attacker.car,'railgun');pressWeapon(room,attacker,10100);assert.equal(attacker.roundKills,1);engine.resetRoom(room);assert.equal(attacker.roundKills,0);assert.equal(attacker.roundStartScore,1);assert.equal(room.effects.length,0);
});

test('lethal rams award the other driver once, and nudges award their initiating driver',async()=>{
  const {collideCars,resolveNudges}=await import('../shared/game.js');const {awardArenaKill}=await import('../shared/combat.js');
  let {engine,room,attacker,victim}=fixture();Object.assign(attacker.car,{x:-60,z:0,vx:35,vz:0,angle:0});Object.assign(victim.car,{x:-55.2,z:0,vx:0,vz:0,angle:0});
  const award=(car,source)=>awardArenaKill(room,[...room.players.values()].find(p=>p.car===car),[...room.players.values()].find(p=>p.car===source)?.id,10000);
  collideCars([attacker.car,victim.car],{onElimination:award});assert.equal(victim.car.eliminated,true);assert.equal(attacker.score,1);assert.equal(awardArenaKill(room,victim,attacker.id,10001),false);assert.equal(attacker.score,1);
  ({engine,room,attacker,victim}=fixture());Object.assign(attacker.car,{x:-60,z:0,angle:0,nudgeMoved:true,nudgeAngle:0,nudgeDirection:1,nudgeHits:[]});Object.assign(victim.car,{x:-60,z:1.9,health:1});
  resolveNudges([attacker.car,victim.car],{onElimination:award});assert.equal(victim.car.eliminated,true);assert.equal(attacker.score,1);
});
test('the authoritative arena tick publishes ram kill scores immediately',()=>{
  const {engine,room,attacker,victim}=fixture();Object.assign(attacker.car,{x:-60,z:0,vx:35,vz:0,angle:0});Object.assign(victim.car,{x:-55.1,z:0,vx:0,vz:0,angle:0});engine.step(room,10000);
  assert.equal(victim.car.eliminated,true);assert.equal(attacker.score,1);assert.equal(engine.snapshot(room).players.find(p=>p.id===attacker.id).score,1);assert.equal(room.effects.filter(e=>e.kind==='kill-score').length,1);
});
