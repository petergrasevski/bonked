// Authoritative decisions shared by Node and browser hosts. Steering remains in shared/game.js; none of this state
// is attached to car snapshots or evaluated by browser prediction.
import {botInput,botSteeringTarget,botLaneBounds,botRouteSide,nearestTrack,MOLES,OBSTACLES,trackAt,TRACK_LENGTH,PLAZAS,PICKUP_LOCATIONS,activeTrack,angleDelta,clamp,CAR_WIDTH,CAR_LENGTH,STEP,NUDGE_DURATION} from './game.js';
import {moleState} from './desert-features.js';
import {WEAPONS,FLAME_RANGE,TASER_RADIUS} from './combat.js';
import {weaponBasis,weaponMuzzle,weaponDirection,rayCar3D,shotgunRays} from './weapon-geometry.js';

const forwardDistance=(a,b)=>((b-a+1)%1)*TRACK_LENGTH;
const arcDistance=(a,b)=>Math.abs(((b-a+1.5)%1)-.5)*TRACK_LENGTH;
const live=car=>!car.eliminated&&!car.finished&&!car.falling;
const grounded=car=>live(car)&&!car.overturned&&car.y-(car.groundY||0)<.05;
const protectedRoute=fraction=>PLAZAS.some(f=>arcDistance(fraction,f)<65)||(activeTrack.id==='ice'&&Math.abs(trackAt(fraction).x)<230);

function chooseLane(room,p,now,state,random){
  const c=p.car,road=trackAt(c.trackFraction),speed=Math.hypot(c.vx,c.vz),horizon=clamp(speed*3,45,110);
  if(!grounded(c)||protectedRoute(c.trackFraction)){state.target=null;return state.preferredLane;}
  const currentLane=(c.x-road.x)*road.nx+(c.z-road.z)*road.nz;
  for(const [key,choice] of state.approaches)if(c.progress>choice.until)state.approaches.delete(key);
  function candidate(kind,object){
    if(kind==='pickup'?(c.item||now<object.readyAt):(c.boost>0||c.padBoostRemaining>0||room.raceTime<object.readyAt))return null;
    const location=kind==='pickup'?PICKUP_LOCATIONS[object.id]:object;
    if(!location)return null;
    const distance=forwardDistance(c.trackFraction,location.fraction);
    if(distance<1||distance>horizon||protectedRoute(location.fraction))return null;
    const targetRoad=trackAt(location.fraction),middle=trackAt(c.trackFraction+distance*.5/TRACK_LENGTH);
    // Do not cut across a split, plaza, hairpin or stacked crossing to collect.
    if(protectedRoute(c.trackFraction+distance*.5/TRACK_LENGTH)||Math.abs(angleDelta(targetRoad.angle,road.angle))>.3||Math.abs(angleDelta(middle.angle,road.angle))>.3)return null;
    const lane=(location.x-targetRoad.x)*targetRoad.nx+(location.z-targetRoad.z)*targetRoad.nz;
    if(Math.abs(lane)>Math.min(road.halfWidth,middle.halfWidth,targetRoad.halfWidth)-CAR_WIDTH/2-.4)return null;
    const shift=Math.abs(lane-currentLane);
    if(distance<Math.max(0,shift-1)*speed/2)return null;
    const key=kind+':'+object.id;
    let choice=state.approaches.get(key);
    if(!choice){choice={until:c.progress+distance/TRACK_LENGTH+.002,interested:random()>.12,weight:.9+random()*.2};state.approaches.set(key,choice);}
    if(!choice.interested)return null;
    return {kind,id:object.id,lane,score:(distance+shift*9+(kind==='pickup'?-12:0))*choice.weight};
  }
  if(state.target){
    const list=state.target.kind==='pickup'?room.pickups:room.boostPads;
    const object=list.find(o=>o.id===state.target.id),retained=object&&candidate(state.target.kind,object);
    if(retained){state.target=retained;return retained.lane;}
  }
  let best=null;
  for(const [kind,list] of [['pickup',room.pickups],['boost',room.boostPads]])for(const object of list){
    const next=candidate(kind,object);if(next&&(!best||next.score<best.score))best=next;
  }
  state.target=best;
  return best?.lane??state.preferredLane;
}

export function botShouldFire(room,p){
  const c=p.car,id=c.item;
  if(!id||!live(c)||c.overturned)return false;
  const ca=Math.cos(c.angle),sa=Math.sin(c.angle);
  let origin,direction,basis,rays,rocketTarget=null;
  if(['machinegun','plasma','railgun','flame'].includes(id)){origin=weaponMuzzle(c,0,id==='flame'?0:undefined);direction=weaponDirection(c);}
  if(id==='flame')basis=weaponBasis(c);
  if(id==='shotgun')rays=shotgunRays(c);
  for(const q of room.players.values()){
    const t=q.car;if(q===p||!live(t))continue;
    // Match the rocket's actual next-in-race lock, even if a different car is closer.
    if(id==='rocket'){if(t.progress>c.progress&&(!rocketTarget||t.progress<rocketTarget.progress))rocketTarget=t;continue;}
    if(t.shield>0&&id!=='shield')continue;
    const dx=t.x-c.x,dz=t.z-c.z,dy=t.y-c.y,d2=dx*dx+dz*dz,along=dx*ca+dz*sa,side=-dx*sa+dz*ca;
    if(id==='shield'&&c.shield<=0&&Math.abs(dy)<3&&d2<24*24)return true;
    if(id==='pulse'&&Math.abs(dy)<3&&d2<16*16)return true;
    if(id==='taser'&&Math.abs(dy)<2.5&&d2<TASER_RADIUS*TASER_RADIUS)return true;
    if(id==='mine'&&Math.abs(dy)<1.4&&along< -5&&along> -32&&Math.abs(side)<2.5&&t.vx*ca+t.vz*sa>3)return true;
    if(id==='chain'&&Math.abs(dy)<2&&along<1&&along> -15&&Math.abs(side)<8)return true;
    if(id==='flame'){
      const x=t.x-origin.x,y=t.y+.7-origin.y,z=t.z-origin.z;
      const fore=x*basis.forward.x+y*basis.forward.y+z*basis.forward.z,lateral=Math.abs(x*basis.side.x+y*basis.side.y+z*basis.side.z),vertical=Math.abs(x*basis.up.x+y*basis.up.y+z*basis.up.z);
      if(fore>0&&fore<FLAME_RANGE&&lateral<1.2+fore*.24&&vertical<1.2+fore*.12)return true;
    }
    if(rays&&d2<20*20&&rays.some(r=>rayCar3D(r.origin,{x:r.direction.x*16,y:r.direction.y*16,z:r.direction.z*16},t,.1)!==null))return true;
    if(id==='railgun'||id==='machinegun'||id==='plasma'){
      const range=id==='railgun'?150:id==='machinegun'?100:65;
      if(along<=0||d2>range*range)continue;
      // Relative motion predicts an intercept without changing the driving line.
      const speed=id==='machinegun'?350:54,flight=id==='railgun'?0:Math.max(0,along-CAR_LENGTH/2)/Math.max(10,speed-(t.vx*ca+t.vz*sa));
      const target=flight?{...t,x:t.x+t.vx*flight,y:t.y+(t.vy||0)*flight,z:t.z+t.vz*flight}:t;
      if(rayCar3D(origin,{x:direction.x*range,y:direction.y*range,z:direction.z*range},target,id==='plasma'?.55:id==='railgun'?.25:.1)!==null)return true;
    }
  }
  if(rocketTarget){
    const distance=forwardDistance(c.trackFraction,rocketTarget.trackFraction),closing=65-Math.hypot(rocketTarget.vx,rocketTarget.vz);
    return rocketTarget.shield<=0&&distance>0&&distance<Math.max(0,closing)*3.5;
  }
  if(id==='shield'&&c.shield<=0)for(const shot of room.projectiles){
    if(shot.owner===p.id)continue;
    const dx=c.x-shot.x,dz=c.z-shot.z,vx=(shot.vx||0)-c.vx,vz=(shot.vz||0)-c.vz,speed2=vx*vx+vz*vz;
    const time=speed2?clamp((dx*vx+dz*vz)/speed2,0,.6):0;
    if(Math.abs((shot.y||0)+(shot.vy||0)*time-c.y)<3&&(dx-vx*time)**2+(dz-vz*time)**2<16)return true;
  }
  return false;
}

export function botNudge(room,p){
  const c=p.car;
  if(!grounded(c)||c.nudgeCooldown>0||c.nudgeHeld||c.spinout>0||Math.abs(c.yawVelocity)>.8)return 0;
  const ca=Math.cos(c.angle),sa=Math.sin(c.angle),road=trackAt(c.trackFraction);
  if(Math.abs(angleDelta(c.angle,road.angle))>.3||protectedRoute(c.trackFraction))return 0;
  for(const q of room.players.values()){
    const t=q.car;if(q===p||!grounded(t)||t.shield>0||Math.abs(c.y-t.y)>1.3)continue;
    const dx=t.x-c.x,dz=t.z-c.z,along=dx*ca+dz*sa,side=-dx*sa+dz*ca;
    const relativeFore=(t.vx-c.vx)*ca+(t.vz-c.vz)*sa,relativeSide=-(t.vx-c.vx)*sa+(t.vz-c.vz)*ca;
    if(Math.abs(along+relativeFore*NUDGE_DURATION)>CAR_LENGTH*.65||Math.abs(side)<CAR_WIDTH*.6||Math.abs(side+relativeSide*NUDGE_DURATION)>CAR_WIDTH*1.9)continue;
    const direction=Math.sign(side),ahead=trackAt(c.trackFraction+Math.max(4,Math.hypot(c.vx,c.vz)*.3)/TRACK_LENGTH);
    const endX=c.x+c.vx*.3-sa*direction*CAR_WIDTH,endZ=c.z+c.vz*.3+ca*direction*CAR_WIDTH;
    const lateral=(endX-ahead.x)*ahead.nx+(endZ-ahead.z)*ahead.nz;
    if(protectedRoute(c.trackFraction+Math.max(4,Math.hypot(c.vx,c.vz)*.3)/TRACK_LENGTH)||Math.abs(lateral)>ahead.halfWidth-CAR_WIDTH/2-1)continue;
    return direction;
  }
  return 0;
}


// Check only the next few seconds of road. A handful of lane candidates is
// enough for local passing; no route search or extra physics simulation.
export function botAvoidance(room,p,options={},previous=null){
  const c=p.car,aim=botSteeringTarget(c,options),road=trackAt(c.trackFraction);
  const current=(c.x-road.x)*road.nx+(c.z-road.z)*road.nz,horizon=clamp(aim.speed*1.5,25,65),hazards=[];
  let bounds=botLaneBounds(c.trackFraction,options.side,215);
  function add(object,clearance,kind){
    if((object.x-c.x)**2+(object.z-c.z)**2>(horizon+8)**2)return;
    const fraction=object.fraction??object.trackFraction??nearestTrack(object.x,object.z,c.trackFraction).fraction;
    const distance=(((fraction-c.trackFraction+1.5)%1)-.5)*TRACK_LENGTH;
    if(distance<0||distance>horizon)return;
    const at=trackAt(fraction);
    if(Math.abs((object.y||0)-at.y)>2.8)return; // Ignore another deck or flying debris.
    if(kind==='mole'){
      const arrival=room.raceTime+Math.max(0,distance)/Math.max(8,aim.speed);
      if(!moleState(object,room.raceTime).active&&!moleState(object,arrival).active&&!moleState(object,arrival).warning)return;
    }
    const lane=(object.x-at.x)*at.nx+(object.z-at.z)*at.nz;
    if(kind==='car'){
      const angle=object.angle-at.angle;
      clearance=Math.abs(Math.cos(angle))*CAR_WIDTH/2+Math.abs(Math.sin(angle))*CAR_LENGTH/2+CAR_WIDTH/2+.6;
    }
    const legal=botLaneBounds(fraction,options.side,215);
    if(lane+clearance<legal.min||lane-clearance>legal.max)return;
    bounds={min:Math.max(bounds.min,legal.min),max:Math.min(bounds.max,legal.max)};
    hazards.push({lane,distance,clearance});
  }
  for(const q of room.players.values())if(q!==p&&(q.car.wrecked||q.car.overturned||q.car.eliminated)&&!q.car.falling)add(q.car,0,'car');
  for(const mine of room.mines||[])if((mine.until??Infinity)>(room.startAt||0)+room.raceTime*1000)add(mine,3.6,'mine');
  for(const mole of MOLES)add(mole,mole.radius+CAR_WIDTH/2+.6,'mole');
  // Coastal islands already have a dedicated passing route; do not override it.
  for(const obstacle of OBSTACLES)if(obstacle.kind==='cactus')add(obstacle,obstacle.radius+CAR_WIDTH/2+.6,'obstacle');
  if(!hazards.length||!grounded(c))return {active:false,lane:aim.lane,speedLimit:Infinity,from:current};
  hazards.sort((a,b)=>a.distance-b.distance);
  // Split boundaries can converge while entering/leaving a fork. Stay on the
  // selected branch even when the legal interval cannot fit a passing line.
  if(bounds.min>bounds.max)return {active:true,lane:aim.lane,speedLimit:8,from:current};
  const candidates=[aim.lane,current,previous?.lane??aim.lane];
  for(const hazard of hazards.slice(0,3))candidates.push(hazard.lane-hazard.clearance-.4,hazard.lane+hazard.clearance+.4);
  let best=null;
  for(const candidate of candidates){
    const lane=clamp(candidate,bounds.min,bounds.max);
    let score=Math.abs(lane-aim.lane)+Math.abs(lane-(previous?.lane??current))*.5,risk=0,nearest=Infinity;
    for(const h of hazards){
      const passing=current+(lane-current)*clamp(Math.max(0,h.distance)/(Math.max(10,aim.speed*.65)),0,1);
      const overlap=h.clearance-Math.abs(passing-h.lane);
      if(overlap>0){risk+=overlap*(1-h.distance/(horizon+5));nearest=Math.min(nearest,h.distance);}
    }
    score+=risk*50;
    if(!best||score<best.score)best={lane,score,risk,nearest};
  }
  return {active:Math.abs(best.lane-aim.lane)>.15||best.risk>0,lane:best.lane,speedLimit:best.risk>0?clamp((best.nearest-5)*.7,6,18):Infinity,from:current};
}

export function botControls(room,p,now,random=Math.random){
  const c=p.car;
  const state=p.botState??={preferredLane:(c.gridSlot%2?1:-1)*(.55+random()*.35),side:c.gridSlot%2?-1:1,lane:0,desiredLane:0,nextPlan:0,nextFire:0,nextNudge:0,nextAvoid:0,avoidLane:null,avoidance:null,fire:false,item:null,ammo:0,lastUse:room.raceTime,forceUse:false,target:null,approaches:new Map()};
  if(!live(c))return {...botInput(c),fire:false,nudge:0};
  if(c.overturned)return {steer:Math.sign(c.rollVelocity)||-Math.sign(angleDelta(c.roll,0))||1,throttle:1,reverse:false,brake:false,fire:false,nudge:0};
  const time=room.raceTime;
  if(time>=state.nextPlan){state.desiredLane=chooseLane(room,p,now,state,random);state.nextPlan=time+.18+random()*.04;}
  state.lane+=clamp(state.desiredLane-state.lane,-2*STEP,2*STEP);
  // The first ice split's boost-fed branch has no barriers and carries a bot
  // over the edge at boosted speed. Use the guarded branch on that straight.
  const side=botRouteSide(c,activeTrack.id==='ice'&&trackAt(c.trackFraction).z<0?-1:state.side);
  const driving={lane:state.lane,side,splitLead:215,difficulty:p.botDifficulty};
  if(time>=state.nextAvoid){state.avoidance=botAvoidance(room,p,driving,state.avoidance);state.nextAvoid=time+.1;}
  const avoidance=state.avoidance;
  if(avoidance?.active&&state.avoidLane===null)state.avoidLane=avoidance.from;
  if(state.avoidLane!==null){
    state.avoidLane+=clamp(avoidance.lane-state.avoidLane,-6*STEP,6*STEP);
    if(!avoidance.active&&Math.abs(state.avoidLane-avoidance.lane)<.1)state.avoidLane=null;
  }
  const input=botInput(c,{...driving,avoidLane:state.avoidLane});
  if(avoidance&&Math.hypot(c.vx,c.vz)>avoidance.speedLimit)input.throttle=0;
  if(state.item!==c.item||c.ammo>state.ammo){state.lastUse=time;state.forceUse=false;}
  else if(c.ammo<state.ammo)state.lastUse=time;
  if(c.item&&time-state.lastUse>=6)state.forceUse=true;
  state.ammo=c.ammo;
  if(time>=state.nextFire||state.item!==c.item){state.fire=botShouldFire(room,p);state.item=c.item;state.nextFire=time+.08+random()*.04;}
  // Tap weapons need a release between presses; held weapons retain their normal cadence.
  input.fire=!!c.item&&(state.fire||state.forceUse)&&(WEAPONS[c.item]?.continuous||(!p.fireLatch&&c.fireCooldown<=0));
  input.nudge=0;
  if(state.avoidLane===null&&time>=state.nextNudge){const direction=botNudge(room,p);if(direction){input.nudge=random()<.7?direction:0;state.nextNudge=time+.35+random()*.4;}}
  return input;
}
