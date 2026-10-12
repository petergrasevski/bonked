import test from 'node:test';
import assert from 'node:assert/strict';
import {botControls as controls,botShouldFire,botNudge,botAvoidance} from '../bots.js';
import {botInput,botSteeringTarget,botLaneBounds,nearestTrack,carContact,MOLES,angleDelta,selectTrack,spawnCar,trackAt,TRACK_LENGTH,BOOST_PADS,PICKUP_LOCATIONS,STEP,stepCar,resolveNudges,collideDesertMoles} from '../shared/game.js';
import {createPickups,collectPickup,giveWeapon,initCombat,updateCombat,WEAPON_IDS} from '../shared/combat.js';
import {collectBoostPad} from '../shared/boost-pads.js';

const botControls=(room,p,now)=>controls(room,p,now,()=>.5);

function arena(item,x,z){
  selectTrack('coast');
  const a={id:'a',car:{...spawnCar(),x:0,y:0,z:0,angle:0,pitch:0,progress:0,trackFraction:0}},b={id:'b',car:{...spawnCar(1),x,y:0,z,angle:0,pitch:0,progress:.01,trackFraction:.01}};
  giveWeapon(a.car,item);a.input={fire:false};b.input={fire:false};
  const room={phase:'racing',startAt:0,raceTime:0,players:new Map([[a.id,a],[b.id,b]]),pickups:[],boostPads:[]};initCombat(room);
  return {a,b,room};
}

test('bots use the firing geometry of every weapon and reject irrelevant targets',()=>{
  for(const [id,x,z,badX,badZ] of [
    ['machinegun',25,0,25,8],['plasma',25,0,25,8],['railgun',25,0,25,8],
    ['shotgun',0,8,8,0],['flame',8,0,-8,0],['taser',0,6,0,12],
    ['pulse',0,12,0,18],['mine',-12,0,12,0],['chain',-10,2,10,2],['shield',12,0,40,0],
  ]){
    const {a,b,room}=arena(id,x,z);b.car.vx=id==='mine'?20:0;
    assert.equal(botShouldFire(room,a),true,id);
    Object.assign(b.car,{x:badX,z:badZ});assert.equal(botShouldFire(room,a),false,id+' wrong position');
    Object.assign(b.car,{x,z,y:20});assert.equal(botShouldFire(room,a),false,id+' other deck');
    Object.assign(b.car,{y:0,eliminated:true});assert.equal(botShouldFire(room,a),false,id+' eliminated');
  }
});

test('rocket decisions follow the actual next race position and useful lifetime',()=>{
  const {a,b,room}=arena('rocket',30,0);b.car.vx=30;b.car.trackFraction=50/TRACK_LENGTH;
  assert.equal(botShouldFire(room,a),true);
  b.car.progress=-.01;assert.equal(botShouldFire(room,a),false);
  b.car.progress=.01;b.car.trackFraction=200/TRACK_LENGTH;assert.equal(botShouldFire(room,a),false);
  const other={id:'c',car:{...b.car,progress:.02,trackFraction:30/TRACK_LENGTH}};room.players.set(other.id,other);
  assert.equal(botShouldFire(room,a),false,'a closer car cannot replace the actual lock target');
});

test('shield responds to incoming projectiles without an opponent nearby',()=>{
  const {a,room}=arena('shield',100,0);room.projectiles.push({owner:'b',x:-30,y:1,z:0,vx:100,vy:0,vz:0});
  assert.equal(botShouldFire(room,a),true);
  room.projectiles[0].vx=-100;assert.equal(botShouldFire(room,a),false);
  room.projectiles[0].vx=100;room.projectiles[0].owner='a';assert.equal(botShouldFire(room,a),false);
});

test('continuous fire stops when a target leaves and tap weapons release between shots',()=>{
  const {a,b,room}=arena('machinegun',25,0);
  a.simInput=botControls(room,a,0);updateCombat(room,STEP,0);assert.equal(a.car.ammo,29);
  b.car.z=20;room.raceTime=.12;a.simInput=botControls(room,a,120);assert.equal(a.simInput.fire,false);
  giveWeapon(a.car,'shotgun');b.car.x=0;b.car.z=8;a.fireLatch=false;
  for(let i=0;i<40;i++){room.raceTime+=STEP;a.simInput=botControls(room,a,room.raceTime*1000);updateCombat(room,STEP,room.raceTime*1000);}
  assert.ok(a.car.ammo<4,'repeated deliberate taps');
  assert.ok(!Object.hasOwn(a.car,'botState'),'planning state does not enter snapshots');
});

test('six idle seconds trigger complete weapon disposal, including held fuel and repeated taps',()=>{
  for(const id of WEAPON_IDS){
    const {a,b,room}=arena(id,500,0);room.players.delete(b.id);
    for(let frame=0;frame<800&&a.car.item;frame++){
      room.raceTime=frame*STEP;a.simInput=botControls(room,a,frame*STEP*1000);
      if(room.raceTime<6)assert.equal(a.simInput.fire,false,id+' must wait six seconds');
      if(frame===360)assert.equal(a.simInput.fire,true,id+' must fire at six seconds');
      updateCombat(room,STEP,frame*STEP*1000);
    }
    assert.equal(a.car.item,null,id+' must finish using all ammo');
    giveWeapon(a.car,id);room.raceTime+=STEP;a.simInput=botControls(room,a,room.raceTime*1000);
    assert.equal(a.simInput.fire,false,id+' replacement gets a new opportunity window');
  }
});

test('normal weapon use restarts the six-second inactivity window',()=>{
  const {a,b,room}=arena('machinegun',500,0);
  botControls(room,a,0);room.raceTime=5;b.car.x=25;
  a.simInput=botControls(room,a,5000);updateCombat(room,STEP,5000);assert.equal(a.car.ammo,29);
  b.car.x=500;room.raceTime=5.2;botControls(room,a,5200);
  room.raceTime=6.1;assert.equal(botControls(room,a,6100).fire,false);
  room.raceTime=11.3;assert.equal(botControls(room,a,11300).fire,true);
});

test('nudges connect, release, and avoid edges, shields and other decks',()=>{
  selectTrack('coast');const road=trackAt(.025);
  const a={id:'a',car:{...spawnCar(),...road,groundY:road.y}},b={id:'b',car:{...spawnCar(1),...road,groundY:road.y,x:road.x+road.nx*3,z:road.z+road.nz*3}};
  const room={players:new Map([[a.id,a],[b.id,b]])};
  assert.equal(botNudge(room,a),1);
  const input={steer:0,throttle:0,nudge:1};
  for(let i=0;i<6;i++){stepCar(a.car,input);resolveNudges([a.car,b.car]);input.nudge=botNudge(room,a);}
  assert.equal(b.car.health,92);assert.equal(input.nudge,0);
  a.car.nudgeCooldown=0;a.car.nudgeHeld=0;b.car.shield=1;assert.equal(botNudge(room,a),0);
  b.car.shield=0;b.car.y+=20;assert.equal(botNudge(room,a),0);
  Object.assign(a.car,{...road,x:road.x+road.nx*(road.halfWidth-1.2),z:road.z+road.nz*(road.halfWidth-1.2)});
  Object.assign(b.car,{y:road.y,x:a.car.x+road.nx*3,z:a.car.z+road.nz*3});assert.equal(botNudge(room,a),0);
});

test('bots commit to useful targets, respect both cooldown clocks and ignore occupied inventory',()=>{
  selectTrack('coast');
  const location=PICKUP_LOCATIONS.find(loc=>loc.row===0&&loc.lane===1),id=PICKUP_LOCATIONS.indexOf(location);
  const pad={...location,id:'test-pad'},fraction=pad.fraction-55/TRACK_LENGTH,road=trackAt(fraction);
  const p={id:'a',car:{...spawnCar(),...road,trackFraction:fraction,groundY:road.y,vx:Math.cos(road.angle)*30,vz:Math.sin(road.angle)*30}};
  const room={raceTime:3,players:new Map([[p.id,p]]),pickups:[],boostPads:[{...pad}],projectiles:[]};
  botControls(room,p,100000);assert.equal(p.botState.target?.kind,'boost');assert.equal(p.botState.target.id,pad.id);
  room.raceTime+=.3;room.boostPads.push({...pad,id:'alternative',lateral:0,x:trackAt(pad.fraction).x,z:trackAt(pad.fraction).z});
  botControls(room,p,100300);assert.equal(p.botState.target.id,pad.id,'retain target instead of weaving');
  room.boostPads.length=1;room.boostPads[0].readyAt=10;room.raceTime+=.3;botControls(room,p,100600);assert.equal(p.botState.target,null);
  room.pickups=[{id,...location,readyAt:200000}];room.raceTime+=.3;botControls(room,p,100900);assert.equal(p.botState.target,null);
  room.pickups[0].readyAt=0;room.raceTime+=.3;botControls(room,p,101200);assert.equal(p.botState.target?.kind,'pickup');
  p.car.item='shield';room.raceTime+=.3;botControls(room,p,101500);assert.equal(p.botState.target,null);
});

test('randomly declining a pickup or nudge persists instead of rerolling every frame',()=>{
  selectTrack('coast');const location=PICKUP_LOCATIONS.find(loc=>loc.row===0&&loc.lane===1),fraction=location.fraction-55/TRACK_LENGTH,road=trackAt(fraction);
  const p={id:'a',car:{...spawnCar(),...road,trackFraction:fraction,groundY:road.y,vx:Math.cos(road.angle)*30,vz:Math.sin(road.angle)*30}};
  const room={raceTime:0,players:new Map([[p.id,p]]),pickups:[{...location,id:PICKUP_LOCATIONS.indexOf(location),readyAt:0}],boostPads:[],projectiles:[]};
  controls(room,p,0,()=>0);assert.equal(p.botState.target,null,'occasionally skip an available item');
  room.raceTime=.3;controls(room,p,300,()=>.5);assert.equal(p.botState.target,null,'do not reconsider that skipped item during the same approach');
  const opponent={id:'b',car:{...p.car,x:p.car.x+road.nx*3,z:p.car.z+road.nz*3}};room.players.set(opponent.id,opponent);
  assert.equal(botNudge(room,p),1,'there is a real nudge opportunity');
  assert.equal(controls(room,p,300,()=>.9).nudge,0,'occasionally decline the nudge');
  room.raceTime+=STEP;assert.equal(controls(room,p,317,()=>.1).nudge,0,'wait before reconsidering');
  room.raceTime=1.2;assert.equal(controls(room,p,1200,()=>.1).nudge,1,'take a later opportunity');
});

test('all eight grid slots navigate every course while collecting boosts and items',()=>{
  let boosts=0,pickups=0;
  for(const track of ['coast','ice','desert'])for(const slot of [0,1,2,3,4,5,6,7]){
    selectTrack(track);const p={id:'bot',car:spawnCar(slot)},room={raceTime:0,players:new Map(),pickups:createPickups(),boostPads:BOOST_PADS.map(p=>({...p})),projectiles:[]};room.players.set(p.id,p);
    let seed=slot+123;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
    for(let frame=0;frame<24000&&p.car.progress<1&&!p.car.eliminated;frame++){
      const now=frame*STEP*1000,previous={x:p.car.x,y:p.car.y,z:p.car.z};room.raceTime=frame*STEP;
      // Isolate navigation: moving crabs and opponents can legitimately shove a car off-road.
      stepCar(p.car,controls(room,p,now,random));p.car.raceTime=room.raceTime;collideDesertMoles(p.car,room.raceTime);
      if(collectPickup(p.car,room.pickups,now)){pickups++;p.car.item=null;}
      if(collectBoostPad(p.car,room.boostPads,room.raceTime,previous))boosts++;
    }
    assert.ok(p.car.progress>=1,`${track} slot ${slot}: progress=${p.car.progress}, health=${p.car.health}, falling=${p.car.falling}`);
  }
  assert.ok(boosts>0,'intentional routes collect boosts');assert.ok(pickups>0,'routes collect items');
});

test('drifting does not lower the speed target on a straight, and steering accounts for momentum',()=>{
  selectTrack('coast');const road=trackAt(.025),base={...spawnCar(),...road,groundY:road.y,trackFraction:.025,vx:Math.cos(road.angle)*30,vz:Math.sin(road.angle)*30};
  const aligned=botInput(base),drifting=botInput({...base,angle:road.angle+.45});
  assert.equal(aligned.throttle,1);assert.equal(drifting.throttle,1,'yaw alone must not trigger corner slowdown');
  assert.equal(drifting.brake,false,'a controlled drift does not need the handbrake');
  const outward=botInput({...base,vx:Math.cos(road.angle-.3)*30,vz:Math.sin(road.angle-.3)*30});
  const inward=botInput({...base,vx:Math.cos(road.angle+.3)*30,vz:Math.sin(road.angle+.3)*30});
  assert.ok(outward.steer>aligned.steer+.3,'steer into outward momentum');
  assert.ok(inward.steer<aligned.steer-.3,'unwind steering when momentum is already turning in');
});

test('faster cornering completes clean laps with enough speed through coast and desert bends',()=>{
  for(const [track,budget,minCornerSpeed] of [['coast',82,26],['ice',68,16],['desert',59,29.5]]){
    selectTrack(track);const car=spawnCar();let frames=0,cornerSpeed=0,cornerFrames=0;
    for(;frames<budget/STEP&&car.progress<1&&!car.eliminated;frames++){
      const road=trackAt(car.trackFraction),ahead=trackAt(car.trackFraction+24/TRACK_LENGTH);
      if(Math.abs(angleDelta(ahead.angle,road.angle))>.2){cornerSpeed+=Math.hypot(car.vx,car.vz);cornerFrames++;}
      stepCar(car,botInput(car,{side:track==='ice'&&road.z<0?-1:1,splitLead:215}));car.raceTime+=STEP;
    }
    assert.ok(car.progress>=1,`${track} should complete a lap within ${budget}s`);
    assert.equal(car.health,100,track+' should not trade speed for wall damage');
    assert.ok(cornerSpeed/cornerFrames>minCornerSpeed,track+' corner speed');
  }
});

function obstacleScene(kind,track='coast',fraction=.025){
  selectTrack(track);const at=trackAt(fraction),p={id:'driver',car:{...spawnCar(),...at,groundY:at.y,trackFraction:fraction,vx:Math.cos(at.angle)*28,vz:Math.sin(at.angle)*28},input:{fire:false}};
  const room={phase:'racing',startAt:0,raceTime:0,players:new Map([[p.id,p]]),pickups:[],boostPads:[]};initCombat(room);
  const f=fraction+35/TRACK_LENGTH,road=trackAt(f);
  const hazard={...road,id:'hazard',trackFraction:f,groundY:road.y};
  if(kind==='mine')room.mines.push({...hazard,owner:'other',armAt:0,until:180000});
  else room.players.set('hazard',{id:'hazard',input:{fire:false},car:{...spawnCar(1),...hazard,overturned:kind==='flipped',wrecked:kind==='wreck',eliminated:kind==='wreck'}});
  return {p,room,hazard};
}

test('bots actually pass mines, wrecks and flipped cars without touching them',()=>{
  for(const kind of ['mine','wreck','flipped']){
    const {p,room,hazard}=obstacleScene(kind);let closest=Infinity,contact=false;
    const plan=botAvoidance(room,p,{lane:0,side:1,splitLead:215});assert.equal(plan.active,true,kind);
    for(let frame=0;frame<240&&p.car.trackFraction<hazard.trackFraction+12/TRACK_LENGTH;frame++){
      room.raceTime=frame*STEP;p.simInput=controls(room,p,room.raceTime*1000,()=>.5);stepCar(p.car,p.simInput);
      closest=Math.min(closest,Math.hypot(p.car.x-hazard.x,p.car.z-hazard.z));
      if(kind!=='mine')contact||=!!carContact(p.car,room.players.get('hazard').car);
      updateCombat(room,STEP,room.raceTime*1000);
    }
    assert.ok(p.car.trackFraction>hazard.trackFraction,kind+' passed');
    assert.equal(p.car.health,100,kind+' no damage');assert.equal(contact,false,kind+' no chassis contact');
    if(kind==='mine')assert.ok(closest>3,`mine clearance ${closest}`);
  }
});

test('mole avoidance predicts emergence and ignores a safely retracted head',()=>{
  selectTrack('desert');const mole=MOLES.find(m=>m.id==='desert-mole-cluster-0');
  const {p,room}=obstacleScene('mine','desert',mole.fraction-30/TRACK_LENGTH);room.mines=[];
  const road=trackAt(p.car.trackFraction);p.car.x+=road.nx*mole.lateral;p.car.z+=road.nz*mole.lateral;
  room.raceTime=(3.1-mole.phase+6)%6;
  assert.equal(botAvoidance(room,p,{lane:mole.lateral,side:1,splitLead:215}).active,true);
  // A lone retracted mole well before its warning should not force a detour.
  const original=MOLES.splice(0,MOLES.length,mole);
  try{room.raceTime=(.1-mole.phase+6)%6;assert.equal(botAvoidance(room,p,{lane:mole.lateral,side:1,splitLead:215}).active,false);}
  finally{MOLES.splice(0,MOLES.length,...original);}
});

test('avoidance ignores obstacles on another deck, behind the car, and expired mines',()=>{
  const {p,room}=obstacleScene('mine');room.mines[0].y+=20;
  assert.equal(botAvoidance(room,p).active,false);
  room.mines[0].y=0;room.mines[0].until=-1;assert.equal(botAvoidance(room,p).active,false);
  room.mines[0].until=180000;room.mines[0].trackFraction=p.car.trackFraction-.01;assert.equal(botAvoidance(room,p).active,false);
});

test('ice avoidance stays on its branch and narrow blocked roads reduce throttle',()=>{
  selectTrack('ice');const fraction=nearestTrack(0,-40).fraction,road=trackAt(fraction);
  const {p,room}=obstacleScene('mine','ice',fraction);
  p.car.x=road.x-road.nx*8;p.car.z=road.z-road.nz*8;
  const mine=room.mines[0],at=trackAt(mine.trackFraction);mine.x=at.x-at.nx*9;mine.z=at.z-at.nz*9;
  const plan=botAvoidance(room,p,{side:-1,splitLead:215});assert.equal(plan.active,true);
  const bounds=botLaneBounds(fraction,-1,215);assert.ok(plan.lane<=bounds.max&&plan.lane>=bounds.min);
  assert.ok(plan.speedLimit<28,'slow down if this branch has no passing clearance');
  const input=botInput(p.car,{side:-1,splitLead:215,avoidLane:100});
  const target=botSteeringTarget(p.car,{side:-1,splitLead:215,avoidLane:100});
  assert.ok(target.lane<0,'even an invalid passing request cannot cross the crevasse');assert.ok(Number.isFinite(input.steer));
});

test('bots starting inside either ice split retain their spawned branch until the road rejoins',()=>{
  selectTrack('ice');
  for(const z of [-40,40])for(const x of [-90,0,90])for(let slot=0;slot<8;slot++){
    const start=nearestTrack(x,z).fraction,p={id:'bot',car:spawnCar(slot,start),input:{fire:false}};
    const room={phase:'racing',startAt:0,raceTime:0,players:new Map([[p.id,p]]),pickups:[],boostPads:[]};initCombat(room);
    const initial=trackAt(p.car.trackFraction),side=Math.sign((p.car.x-initial.x)*initial.nx+(p.car.z-initial.z)*initial.nz);
    let exited=false;
    for(let tick=0;tick<900;tick++){
      const road=trackAt(p.car.trackFraction);
      if(tick>0&&Math.abs(road.x)>=130){exited=true;break;}
      const input=botControls(room,p,room.raceTime*1000);stepCar(p.car,input);p.car.raceTime+=STEP;room.raceTime+=STEP;
      const at=trackAt(p.car.trackFraction),lane=(p.car.x-at.x)*at.nx+(p.car.z-at.z)*at.nz;
      assert.ok(lane*side>0,`crossed gap: x=${x} z=${z} slot=${slot}`);
      assert.equal(p.car.falling,false,`fell: x=${x} z=${z} slot=${slot}`);assert.equal(p.car.eliminated,false);
    }
    assert.ok(exited,`should leave split: x=${x} z=${z} slot=${slot}`);
  }
  selectTrack('coast');
});
