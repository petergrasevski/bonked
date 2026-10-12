import {applyDesertWind} from './desert-storm.js';
import {boostLayout,boostSpeed} from './boost-pads.js';
import {wheelSupports,balanceOnWheels,collideTerrain} from './edge-physics.js';
import {createLandscape} from './landscape.js';
import {DESERT_CACTI,DESERT_JUMPS,desertElevation,desertHalfWidth,desertHasBarrier,desertRampLift,desertRampGrade,desertMoles,moleState} from './desert-features.js';
export const MAX_PLAYERS = 8;
export const LAPS = 3;
export const STEP = 1 / 60;
export const ROAD_WIDTH = 12;
export const TOP_SPEED = 36;
export const SURFACE_HALF_WIDTH = ROAD_WIDTH / 2 + .6;
export const START_BOOST_SECONDS = .8;
export const START_SPIN_SECONDS = 1.1;
export const healthSpeedFactor = health => .8 + .2 * (Math.max(1, Math.min(100, health)) - 1) / 99;
export function launchResult(pressedAt,startAt){
  if(!Number.isFinite(pressedAt))return 'normal';
  const lead=startAt-pressedAt;
  return lead>2000?'spinout':Math.abs(lead-1000)<=20?'boost':'normal';
}
export function applyLaunch(car,pressedAt,startAt){
  car.launchResult=launchResult(pressedAt,startAt);
  if(car.launchResult==='boost')car.boost=START_BOOST_SECONDS;
  if(car.launchResult==='spinout')car.spinout=START_SPIN_SECONDS;
}
// Only the current uninterrupted hold counts. A late or implausible timestamp
// falls back to receipt time; the client never chooses its launch outcome.
export function recordLaunchInput(player,input,at,now,startAt){
  if(input.throttle<=.1||input.reverse){player.accelPressedAt=null;return;}
  if(player.input.throttle>.1&&!player.input.reverse&&now-player.lastInput<=250)return;
  player.accelPressedAt=Number.isFinite(at)&&at>=now-250&&at<=now+50?Math.min(at,now):now;
  player.accelPressedAt=Math.max(startAt-3300,player.accelPressedAt);
}
export const CAR_LENGTH = 4.9;
export const CAR_WIDTH = 2.1;
export const NUDGE_DURATION = .1;
export const TARGET_TRACK_LENGTH = 3466.9092022732743 * .7;
export const START_FRACTION = .012;
export const REVERSE_HOLD_MS = 350;
export const brakeMode = heldMs => ({ brake: heldMs >= 0 && heldMs < REVERSE_HOLD_MS, reverse: heldMs >= REVERSE_HOLD_MS });
export const COLORS = ['#ff514f', '#388bff', '#ffd139', '#44db89', '#b681ff', '#ff893e', '#45dfef', '#f98bc4'];
export const COLOR_NAMES = ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange', 'Cyan', 'Pink'];
export const NEUTRAL = Object.freeze({ steer: 0, throttle: 0, reverse: false, brake: false, fire: false, nudge: 0 });
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function angleDelta(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
const anchors = [[-260,150],[-130,150],[0,150],[85,150],[110,110],[80,65],[110,40],[180,55],[245,150],[280,105],[270,35],[240,-30],[280,-90],[275,-140],[200,-165],[80,-165],[-40,-165],[-160,-165],[-230,-140],[-235,-100],[-195,-65],[-225,-25],[-280,-60],[-305,0],[-260,50],[-285,100]];
function spline(p0, p1, p2, p3, t) {
  return p1 + .5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}
export const TRACKS = Object.freeze({
  coast:{id:'coast',name:'Saltwater Circuit',description:'Coastal causeways · technical turns',grip:1},
  ice:{id:'ice',name:'Glacier Run',description:'2.03 km of ice · split lanes · exposed straights',grip:.12},
  desert:{id:'desert',name:'Redrock Overpass',description:'Mountain bridge · four jumps · mole flats',grip:.85},
});
export let BOOST_PADS;
export let activeTrack=TRACKS.coast,TRACK,SEGMENTS,TRACK_LENGTH,PLAZAS,OBSTACLES,MOLES,PICKUP_ROW_COUNT,PICKUP_LOCATIONS;
const trackCache=new Map(),landscapeCache=new Map();
export function getLandscape(){if(!landscapeCache.has(activeTrack.id))landscapeCache.set(activeTrack.id,createLandscape({id:activeTrack.id,segments:SEGMENTS,trackLength:TRACK_LENGTH,trackAt,nearestTrack,hasBarrier}));return landscapeCache.get(activeTrack.id);}
export function terrainAt(x,z,ceiling=Infinity){const land=getLandscape().surface.sample(x,z,ceiling);return land||(activeTrack.id!=='coast'&&ceiling>=-4?{y:-4,nx:0,ny:1,nz:0}:null);}
const arcDistance=(a,b)=>Math.abs(((a-b+.5)%1+1)%1-.5)*TRACK_LENGTH;
function icePoints(){
  // Each straight is 914.4m: exactly 60% of the former 1,524m.
  const corners=[[-475.2,-40],[475.2,-40],[475.2,40],[-475.2,40]],points=[];
  for(let i=0;i<4;i++){
    const prev=corners[(i+3)%4],p=corners[i],next=corners[(i+1)%4];
    const before=Math.hypot(prev[0]-p[0],prev[1]-p[1]),after=Math.hypot(next[0]-p[0],next[1]-p[1]);
    const a=[p[0]+(prev[0]-p[0])*18/before,p[1]+(prev[1]-p[1])*18/before],b=[p[0]+(next[0]-p[0])*18/after,p[1]+(next[1]-p[1])*18/after];
    for(let j=0;j<18;j++){const t=j/18;points.push({x:(1-t)**2*a[0]+2*(1-t)*t*p[0]+t*t*b[0],z:(1-t)**2*a[1]+2*(1-t)*t*p[1]+t*t*b[1]});}
    const q=next,len=Math.hypot(q[0]-p[0],q[1]-p[1]),end=[q[0]-(q[0]-p[0])*18/len,q[1]-(q[1]-p[1])*18/len],n=Math.ceil((len-36)/2);
    for(let j=0;j<n;j++)points.push({x:b[0]+(end[0]-b[0])*j/n,z:b[1]+(end[1]-b[1])*j/n});
  }
  return points;
}
function desertPoints(){
  // Crossing at t=0 is a 20m bridge; crossing at pi is the road beneath it.
  const points=Array.from({length:1500},(_,i)=>{const t=i/1500*Math.PI*2;return {x:270*Math.sin(t),z:170*Math.sin(2*t),y:20*Math.max(0,Math.cos(t))**4};});
  const lengths=points.map((p,i)=>Math.hypot(p.x-points[(i+1)%points.length].x,p.z-points[(i+1)%points.length].z)),total=lengths.reduce((a,b)=>a+b,0);
  let distance=0;for(let i=0;i<points.length;i++){points[i].y=desertElevation(distance/total,points[i].y,total);distance+=lengths[i];}
  return points;
}
export function iceSplit(x){
  if(activeTrack.id!=='ice')return 0;
  const t=clamp((115-Math.abs(x))/35,0,1);return 4*t*t*(3-2*t);
}
// Each side can independently be guarded; inner refers to the split's gap edge.
export function hasBarrier(fraction,side=0,inner=false){
  if(activeTrack.id==='ice'){
    const p=trackAt(fraction);
    if(inner)return iceSplit(p.x)>.3&&(side<0?p.x>-55&&p.x<30:p.x>-30&&p.x<55);
    if(Math.abs(p.x)>457.2+1e-6)return true; // only the curved/square U-turn itself
    if(!side)return hasBarrier(fraction,-1)||hasBarrier(fraction,1);
    return side<0?p.x>-100&&p.x<-40:p.x>40&&p.x<100;
  }
  if(inner)return false;
  if(activeTrack.id==='desert')return desertHasBarrier(fraction);
  const section=Math.floor(((fraction%1+1)%1)*24);return ![3,8,14,19].includes(section);
}
export function selectTrack(id='coast'){
  if(!Object.hasOwn(TRACKS,id))throw new Error('Unknown track');
  activeTrack=TRACKS[id];
  if(trackCache.has(id)){
    ({TRACK,SEGMENTS,TRACK_LENGTH,PLAZAS,OBSTACLES,MOLES,PICKUP_ROW_COUNT,PICKUP_LOCATIONS,BOOST_PADS}=trackCache.get(id));return activeTrack;
  }
TRACK = Array.from({ length: 1500 }, (_, i) => {
  const f = i / 1500 * anchors.length, j = Math.floor(f), t = f - j, n = anchors.length;
  return { x: spline(anchors[(j+n-1)%n][0], anchors[j][0], anchors[(j+1)%n][0], anchors[(j+2)%n][0], t), z: spline(anchors[(j+n-1)%n][1], anchors[j][1], anchors[(j+1)%n][1], anchors[(j+2)%n][1], t) };
});
// Preserve the requested 30% length reduction while authoring turns independently.
if(activeTrack.id==='ice')TRACK=icePoints().map(p=>({...p,y:1}));
if(activeTrack.id==='desert')TRACK=desertPoints();
const rawLength=TRACK.reduce((sum,p,i)=>sum+Math.hypot(p.x-TRACK[(i+1)%TRACK.length].x,p.z-TRACK[(i+1)%TRACK.length].z),0);
if(activeTrack.id==='coast')for(const p of TRACK){p.x*=TARGET_TRACK_LENGTH/rawLength;p.z*=TARGET_TRACK_LENGTH/rawLength;}
let length = 0;
SEGMENTS = TRACK.map((p, i) => {
  const q = TRACK[(i + 1) % TRACK.length], dx = q.x-p.x, dz = q.z-p.z, len = Math.hypot(dx,dz);
  const s = { y:0, ...p, dy:(q.y||0)-(p.y||0), dx, dz, len, start: length, nx: -dz/len, nz: dx/len };
  length += len; return s;
});
TRACK_LENGTH = length;
// Smooth widening around bends and three passing plazas, shared by rendering and physics.
PLAZAS=activeTrack.id==='coast'?[.10,.30,.70]:[];

for(let i=0;i<SEGMENTS.length;i++){
  const s=SEGMENTS[i],before=SEGMENTS[(i+SEGMENTS.length-10)%SEGMENTS.length],after=SEGMENTS[(i+10)%SEGMENTS.length];
  const bend=Math.abs(angleDelta(Math.atan2(after.dz,after.dx),Math.atan2(before.dz,before.dx)));
  let halfWidth=6+Math.min(3,bend*3.5);
  for(const f of PLAZAS){const d=arcDistance(s.start/TRACK_LENGTH,f);if(d<65)halfWidth=Math.max(halfWidth,6+6*(1+Math.cos(Math.PI*d/65))/2);}
  let clearance=Infinity;
  for(let j=0;j<SEGMENTS.length;j+=3){const q=SEGMENTS[j];if(arcDistance(s.start/TRACK_LENGTH,q.start/TRACK_LENGTH)>45)clearance=Math.min(clearance,Math.hypot(s.x-q.x,s.z-q.z));}
  s.halfWidth=activeTrack.id==='ice'?(9+Math.max(6*clamp((Math.abs(s.x)-420)/40,0,1),5*clamp((155-Math.abs(s.x))/50,0,1))):activeTrack.id==='desert'?desertHalfWidth(s.start/TRACK_LENGTH,TRACK_LENGTH):Math.max(6,Math.min(halfWidth,(clearance-3)/2));
}
for(let i=0;i<SEGMENTS.length;i++)SEGMENTS[i].nextHalfWidth=SEGMENTS[(i+1)%SEGMENTS.length].halfWidth;
OBSTACLES=PLAZAS.flatMap((fraction,index)=>[-8,8].map((offset,i)=>{
  const f=fraction+offset/TRACK_LENGTH,p=trackAt(f);
  return {id:`island-${index}-${i}`,fraction:f,x:p.x,z:p.z,radius:1.65,height:1.5};
}));
if(activeTrack.id==='desert')OBSTACLES=DESERT_CACTI.map(({fraction,side},i)=>{const p=trackAt(fraction),lateral=side*(p.halfWidth-1.5);return {id:`cactus-${i}`,kind:'cactus',fraction,x:p.x+p.nx*lateral,z:p.z+p.nz*lateral,y:p.y,radius:.65,height:7,angle:p.angle};});
MOLES=activeTrack.id==='desert'?desertMoles(TRACK_LENGTH).map(m=>{const p=trackAt(m.fraction);return {...m,x:p.x+p.nx*m.lateral,y:p.y,z:p.z+p.nz*m.lateral,angle:p.angle};}):[];
PICKUP_ROW_COUNT = Math.round(TRACK_LENGTH/(TOP_SPEED*10));
PICKUP_LOCATIONS = Array.from({length:PICKUP_ROW_COUNT},(_,row)=>{
  let fraction=START_FRACTION+(90+row*TRACK_LENGTH/PICKUP_ROW_COUNT)/TRACK_LENGTH,p=trackAt(fraction);
  if(OBSTACLES.some(o=>Math.hypot(o.x-p.x,o.z-p.z)<14)){fraction+=20/TRACK_LENGTH;p=trackAt(fraction);}
  const count=p.halfWidth>=8?4:3,edge=p.halfWidth-CAR_WIDTH/2-.8;
  return Array.from({length:count},(_,lane)=>{let offset=-edge+2*edge*lane/(count-1);if(iceSplit(p.x)>0&&Math.abs(offset)<iceSplit(p.x)+1.8)offset=Math.sign(offset||1)*(iceSplit(p.x)+1.8);return {...p,x:p.x+p.nx*offset,z:p.z+p.nz*offset,row,lane,fraction};});
}).flat();
  BOOST_PADS=boostLayout({id,trackAt,nearestTrack,length:TRACK_LENGTH,carWidth:CAR_WIDTH,obstacles:OBSTACLES});
  trackCache.set(id,{TRACK,SEGMENTS,TRACK_LENGTH,PLAZAS,OBSTACLES,MOLES,PICKUP_ROW_COUNT,PICKUP_LOCATIONS,BOOST_PADS});
  return activeTrack;
}
export function trackAt(fraction) {
  const d = ((fraction % 1 + 1) % 1) * TRACK_LENGTH;
  const s = SEGMENTS.find(s => s.start+s.len >= d) || SEGMENTS.at(-1);
  const t = (d-s.start)/s.len;
  return { y:s.y+s.dy*t, grade:s.dy/s.len, x:s.x+s.dx*t, z:s.z+s.dz*t, angle:Math.atan2(s.dz,s.dx), nx:s.nx, nz:s.nz, halfWidth:s.halfWidth+(s.nextHalfWidth-s.halfWidth)*t };
}
export function nearestTrack(x,z,hint=null) {
  let bestScore=Infinity;
  let best = { distance: Infinity };
  for (const s of SEGMENTS) {
    const t = clamp(((x-s.x)*s.dx+(z-s.z)*s.dz)/(s.len*s.len),0,1);
    const px=s.x+s.dx*t, pz=s.z+s.dz*t, d=Math.hypot(x-px,z-pz);
    const fraction=(s.start+s.len*t)/TRACK_LENGTH;
    const routePenalty=activeTrack.id==='desert'&&hint!==null?Math.max(0,arcDistance(fraction,hint)-50)*2:0;
    if(d+routePenalty<bestScore){const rampLift=activeTrack.id==='desert'?desertRampLift(fraction,TRACK_LENGTH):0,rampGrade=activeTrack.id==='desert'?desertRampGrade(fraction,TRACK_LENGTH):0;bestScore=d+routePenalty;best={y:s.y+s.dy*t+rampLift,grade:s.dy/s.len+rampGrade,x:px,z:pz,distance:d,fraction:(s.start+s.len*t)/TRACK_LENGTH,nx:s.nx,nz:s.nz,halfWidth:s.halfWidth+(s.nextHalfWidth-s.halfWidth)*t};}
  }
  return best;
}
export const roadHalfWidth=fraction=>trackAt(fraction).halfWidth;
export const surfaceHalfWidth=fraction=>roadHalfWidth(fraction)+.6;
export function constrainObstacles(car){
  if(car.falling)return;
  const c=Math.cos(car.angle),s=Math.sin(car.angle);
  for(const o of OBSTACLES){
    if(car.y>(o.y||0)+o.height||car.y+1.4<(o.y||0))continue;
    if(Math.hypot(car.x-o.x,car.z-o.z)>o.radius+CAR_LENGTH)continue;
    const ox=(o.x-car.x)*c+(o.z-car.z)*s,oz=-(o.x-car.x)*s+(o.z-car.z)*c;
    const qx=clamp(ox,-CAR_LENGTH/2,CAR_LENGTH/2),qz=clamp(oz,-CAR_WIDTH/2,CAR_WIDTH/2);
    let dx=qx-ox,dz=qz-oz,d=Math.hypot(dx,dz),depth=o.radius-d;
    if(depth<=0)continue;
    if(d<1e-6){const ex=CAR_LENGTH/2-Math.abs(ox),ez=CAR_WIDTH/2-Math.abs(oz);if(ex<ez){dx=ox>0?-1:1;dz=0;depth=o.radius+ex;}else{dx=0;dz=oz>0?-1:1;depth=o.radius+ez;}d=1;}
    const nx=(dx*c-dz*s)/d,nz=(dx*s+dz*c)/d;
    car.x+=nx*(depth+.002);car.z+=nz*(depth+.002);
    const impact=-(car.vx*nx+car.vz*nz);
    if(impact>0){const speedBefore=Math.hypot(car.vx,car.vz);car.vx+=nx*impact*1.15;car.vz+=nz*impact*1.15;car.impactTime=.4;if(car.wallCooldown<=0&&impact>4){damageCar(car,wallDamage(speedBefore,Math.hypot(car.vx,car.vz)));car.wallCooldown=.2;}}
  }
}
// Timed hazards share the explicit simulation clock with instanced visuals.
// Retracted holes are completely driveable; airborne cars clear raised heads.
export function collideDesertMoles(car,raceSeconds=car.raceTime||0,{damage=true}={}){
  const impacts=[];if(activeTrack.id!=='desert'||car.falling||car.eliminated&&!car.wrecked)return impacts;
  const c=Math.cos(car.angle),s=Math.sin(car.angle);
  for(const mole of MOLES){
    if(Math.hypot(car.x-mole.x,car.z-mole.z)>mole.radius+CAR_LENGTH)continue;
    const state=moleState(mole,raceSeconds);if(!state.active||car.y>mole.y+mole.height*state.rise+.1||car.y+1.4<mole.y)continue;
    const ox=(mole.x-car.x)*c+(mole.z-car.z)*s,oz=-(mole.x-car.x)*s+(mole.z-car.z)*c;
    const qx=clamp(ox,-CAR_LENGTH/2,CAR_LENGTH/2),qz=clamp(oz,-CAR_WIDTH/2,CAR_WIDTH/2);
    let dx=qx-ox,dz=qz-oz,d=Math.hypot(dx,dz),depth=mole.radius-d;
    if(depth<=0)continue;
    if(d<1e-6){const ex=CAR_LENGTH/2-Math.abs(ox),ez=CAR_WIDTH/2-Math.abs(oz);if(ex<ez){dx=ox>0?-1:1;dz=0;depth=mole.radius+ex;}else{dx=0;dz=oz>0?-1:1;depth=mole.radius+ez;}d=1;}
    const nx=(dx*c-dz*s)/d,nz=(dx*s+dz*c)/d;car.x+=nx*(depth+.002);car.z+=nz*(depth+.002);
    const impact=-(car.vx*nx+car.vz*nz);if(impact<=0)continue;
    car.vx+=nx*impact*1.15;car.vz+=nz*impact*1.15;car.impactTime=Math.max(car.impactTime||0,.5);
    const amount=Math.min(18,3+impact*.25),canDamage=(car.moleCooldown||0)<=0&&impact>4;
    if(canDamage){if(damage)damageCar(car,amount);car.moleCooldown=.65;}
    impacts.push({id:mole.id,speed:impact,damage:canDamage&&damage?amount:0});
  }
  return impacts;
}
export function spawnCar(slot=0,startFraction=START_FRACTION) {
  const fraction = startFraction - (6 + Math.floor(slot/2)*5.5)/TRACK_LENGTH;
  const p=trackAt(fraction), side=(slot%2===0?-1:1)*(2.3+iceSplit(p.x)*1.05);
  return { raceTime:0,moleCooldown:0,steering:0,padBoostRemaining:0,padBoostFrom:0,gridSlot:slot,tased:0,tasePhase:0,nudgeTime:0,nudgeCooldown:0,nudgeHeld:0,nudgeHits:[], x:p.x+p.nx*side,z:p.z+p.nz*side,angle:p.angle,vx:0,vz:0,progress:fraction-START_FRACTION,trackFraction:fraction,lap:1,item:null,boost:0,spinout:0,launchResult:null,stun:0,finished:false,finishTime:null,eliminated:false,eliminatedAt:null,health:100,shield:0,ammo:0,fireCooldown:0,firing:null,groundY:p.y,y:p.y,vy:0,roll:0,pitch:Math.atan(p.grade||0),rollVelocity:0,pitchVelocity:0,yawVelocity:0,impactTime:0,wallCooldown:0,contactCooldown:0,wrecked:false,overturned:false,falling:false };
}
export function sanitizeInput(raw) {
  return { steer: Number.isFinite(raw?.steer)?clamp(raw.steer,-1,1):0,throttle:Number.isFinite(raw?.throttle)?clamp(raw.throttle,0,1):0,reverse:raw?.reverse===true,brake:raw?.brake===true,fire:raw?.fire===true,nudge:raw?.nudge===-1?-1:raw?.nudge===1?1:0 };
}
export function damageLevel(health){return clamp(Math.floor((100-health)/20),0,4);}
export const healthHandlingFactor=health=>.4+.6*(clamp(health,1,100)-1)/99;
export function advanceNudge(car,dt){
  if(car.eliminated||car.finished||car.overturned||car.falling||car.y-(car.groundY||0)>.05){car.nudgeTime=0;return;}
  if(car.nudgeTime>0){
    const step=Math.min(dt,car.nudgeTime),distance=CAR_WIDTH*step/NUDGE_DURATION;
    car.x-=Math.sin(car.nudgeAngle)*car.nudgeDirection*distance;car.z+=Math.cos(car.nudgeAngle)*car.nudgeDirection*distance;
    car.nudgeTime=Math.max(0,car.nudgeTime-step);car.nudgeMoved=true;
  }

}
// Only active nudges check contacts; each target can be hit once per press.
export function resolveNudges(cars,{damage=true}={}){
  for(const a of cars){
    if(!a.nudgeMoved||a.eliminated||a.y-(a.groundY||0)>.05)continue;
    const nx=-Math.sin(a.nudgeAngle)*a.nudgeDirection,nz=Math.cos(a.nudgeAngle)*a.nudgeDirection;
    for(const b of cars){
      if(a===b||Math.abs(a.y-b.y)>1.3||b.eliminated||b.finished||b.falling||b.y-(b.groundY||0)>.05||b.shield>0||a.nudgeHits.includes(b.gridSlot))continue;
      const contact=carContact(a,b);if((b.x-a.x)*nx+(b.z-a.z)*nz<=0||!contact)continue;
      a.nudgeHits=[...a.nudgeHits,b.gridSlot];if(damage)damageCar(b,8);
      if(!b.eliminated){
        // The powered sidestep contributes contact velocity. Apply a rigid-body
        // impulse at the contact patch: quarter hits turn a car, door hits slide it.
        const inertia=(CAR_LENGTH**2+CAR_WIDTH**2)/12;
        const ax=contact.x-a.x,az=contact.z-a.z,bx=contact.x-b.x,bz=contact.z-b.z;
        const ta=ax*nz-az*nx,tb=bx*nz-bz*nx;
        const va=(a.vx-a.yawVelocity*az)*nx+(a.vz+a.yawVelocity*ax)*nz+CAR_WIDTH/NUDGE_DURATION;
        const vb=(b.vx-b.yawVelocity*bz)*nx+(b.vz+b.yawVelocity*bx)*nz;
        const impulse=clamp((va-vb)*1.12/(2+(ta*ta+tb*tb)/inertia),0,13);
        // Powered shove stability absorbs half the initiating car's recoil.
        a.vx-=nx*impulse*.5;a.vz-=nz*impulse*.5;b.vx+=nx*impulse;b.vz+=nz*impulse;
        a.yawVelocity+=(clamp(a.yawVelocity-ta*impulse/inertia,-3,3)-a.yawVelocity)*.5;b.yawVelocity=clamp(b.yawVelocity+tb*impulse/inertia,-3,3);
        a.impactTime=Math.max(a.impactTime,.11);b.impactTime=Math.max(b.impactTime,.65);
        a.contactCooldown=b.contactCooldown=.2;
      }
    }
  }
}
export function damageCar(car,amount){
  if(car.wrecked||car.eliminated||car.finished||car.shield>0)return false;
  car.health=Math.max(0,car.health-Math.max(0,amount));
  if(car.health<=0){
    car.wrecked=true;car.eliminated=true;car.item=null;car.ammo=0;car.firing=null;car.shield=0;
    if(!car.falling){car.vy=Math.max(car.vy,10);car.y=Math.max(car.y,(car.groundY||0)+.1);}car.rollVelocity+=5;car.pitchVelocity+=6;
    car.vx+=Math.cos(car.angle)*12;car.vz+=Math.sin(car.angle)*12;car.impactTime=2;
  }
  return true;
}
export function launchCar(car,up,side=0,fore=0){
  if(car.shield>0||car.wrecked||car.eliminated)return;
  car.y=Math.max(car.y,(car.groundY||0)+.08);car.vy=Math.max(car.vy,up);
  car.rollVelocity=clamp(car.rollVelocity+side*up*.65,-10,10);
  car.pitchVelocity=clamp(car.pitchVelocity+fore*up*.45,-10,10);
  car.yawVelocity+=side*.8;car.impactTime=1.5;
}
function verticalStep(car,dt){
  if(car.edgeBalance&&!car.falling)return;
  const floor=car.groundY||0;
  if(car.y>floor+.001||car.vy>0||car.falling){
    car.vy-=22*dt;car.y+=car.vy*dt;car.roll+=car.rollVelocity*dt;car.pitch+=car.pitchVelocity*dt;
    car.rollVelocity*=Math.exp(-.22*dt);car.pitchVelocity*=Math.exp(-.22*dt);
    if(car.falling)return;
    if(car.y<=floor){
      car.y=floor;car.vy=0;
      const upsideDown=Math.cos(car.roll)*Math.cos(car.pitch)<-.15;
      car.overturned=upsideDown;car.roll=upsideDown?Math.PI:0;car.pitch=0;car.rollVelocity=0;car.pitchVelocity=0;
      const landingDrag=car.rampFlight&&!upsideDown?.98:car.wrecked?.5:.18;
      car.vx*=landingDrag;car.vz*=landingDrag;car.rampFlight=false;car.impactTime=.8;
    }
  }
}
export function wallDamage(speedBefore,speedAfter){return Math.max(0,speedBefore-speedAfter-1.5)*.3;}
export function roadSurfaceAt(x,z,hint){
  const t=nearestTrack(x,z,hint),gap=iceSplit(t.x),lateral=Math.abs((x-t.x)*t.nx+(z-t.z)*t.nz);
  return t.distance<=t.halfWidth+.6&&(gap<.01||lateral>=gap)?t:null;
}
function supportRoad(car,t){
  if(car.falling||car.y>t.y+.5&&!car.edgeBalance)return;
  // Interior driving retains the existing cheap path. Only edge contacts sample
  // individual tyres, never the scenery mesh or a second physics engine.
  const lateral=Math.abs((car.x-t.x)*t.nx+(car.z-t.z)*t.nz),gap=iceSplit(t.x),extent=CAR_LENGTH/2;
  if(t.distance+extent<t.halfWidth+.6&&(gap<.01||lateral-extent>gap)){car.supportedWheels=4;car.edgeBalance=false;return;}
  const support=wheelSupports(car,(x,z)=>roadSurfaceAt(x,z,car.trackFraction));car.supportedWheels=support.length;
  car.edgeBalance=support.length>0&&support.length<4;
  if(!support.length||car.edgeBalance&&car.y<t.y-.4){
    car.falling=true;car.edgeBalance=false;car.offRoadTime=0;car.vy=Math.min(car.vy,car.edgeVy||0);
    // Releasing the contact pivot carries its angular COM velocity into the fall.
    car.vx+=(-Math.sin(car.angle)*car.rollVelocity-Math.cos(car.angle)*car.pitchVelocity)*.5;
    car.vz+=(Math.cos(car.angle)*car.rollVelocity-Math.sin(car.angle)*car.pitchVelocity)*.5;
  }
}
export function constrainRoad(car){
  const t=nearestTrack(car.x,car.z,car.trackFraction);
  if(car.falling)return t;
  const oldFloor=car.groundY||0;car.groundY=t.y;
  if(!car.edgeBalance&&car.y<=oldFloor+.001&&car.vy<=0)car.y=t.y;
  // Barriers still stop grounded cars; exposed edges use individual tyre support.
  if(activeTrack.id==='ice'){
    const lateral=(car.x-t.x)*t.nx+(car.z-t.z)*t.nz,side=lateral<0?-1:1,gap=iceSplit(t.x);
    const extent=Math.abs(Math.cos(car.angle)*t.nx+Math.sin(car.angle)*t.nz)*CAR_LENGTH/2+Math.abs(-Math.sin(car.angle)*t.nx+Math.cos(car.angle)*t.nz)*CAR_WIDTH/2;
    let corrected=Math.abs(lateral),normal=0;
    if(corrected>t.halfWidth+.6||(gap>.6&&corrected<gap-.6)){supportRoad(car,t);return t;}
    if(car.y-t.y<1.4){
      if(hasBarrier(t.fraction,side)&&corrected>t.halfWidth-extent){corrected=t.halfWidth-extent;normal=-side;}
      if(gap>.3&&hasBarrier(t.fraction,side,true)&&corrected<gap+extent){corrected=gap+extent;normal=side;}
      if(normal){car.x+=t.nx*(side*corrected-lateral);car.z+=t.nz*(side*corrected-lateral);
        const impact=-(car.vx*t.nx+car.vz*t.nz)*normal;if(impact>0){const speed=Math.hypot(car.vx,car.vz);car.vx+=t.nx*normal*impact*1.12;car.vz+=t.nz*normal*impact*1.12;car.impactTime=.3;if(car.wallCooldown<=0&&impact>4){damageCar(car,wallDamage(speed,Math.hypot(car.vx,car.vz)));car.wallCooldown=.2;}}
      }
    }
    supportRoad(car,t);
    return t;
  }
  if(t.distance>t.halfWidth+.6){supportRoad(car,t);return t;}
  const extent=Math.abs(Math.cos(car.angle)*t.nx+Math.sin(car.angle)*t.nz)*CAR_LENGTH/2+Math.abs(-Math.sin(car.angle)*t.nx+Math.cos(car.angle)*t.nz)*CAR_WIDTH/2;
  const limit=t.halfWidth-extent;
  if(car.y-t.y<1.4&&hasBarrier(t.fraction)&&t.distance>limit){
    const nx=(car.x-t.x)/(t.distance||1),nz=(car.z-t.z)/(t.distance||1);
    car.x=t.x+nx*limit;car.z=t.z+nz*limit;
    const impact=car.vx*nx+car.vz*nz;
    if(impact>0){const speedBefore=Math.hypot(car.vx,car.vz);car.vx-=nx*impact*1.12;car.vz-=nz*impact*1.12;car.impactTime=Math.max(car.impactTime,.3);
      if(car.wallCooldown<=0&&impact>4){damageCar(car,wallDamage(speedBefore,Math.hypot(car.vx,car.vz)));car.wallCooldown=.2;}
    }
  }
  constrainObstacles(car);supportRoad(car,t);
  return t;
}
export function stepCar(car, input, dt=STEP) {
  if(car.eliminated&&!car.wrecked){car.vx=0;car.vz=0;return;}
  for(const key of ['moleCooldown','tased','boost','stun','shield','impactTime','wallCooldown','contactCooldown','nudgeCooldown'])car[key]=Math.max(0,(car[key]||0)-dt);
  car.tasePhase=(car.tasePhase||0)+dt;
  const padSpeed=boostSpeed(car,dt,TOP_SPEED);
  verticalStep(car,dt);
  if(car.falling&&car.y< -20){car.vx=0;car.vz=0;return;}
  car.nudgeMoved=false;
  const direction=input.nudge===-1?-1:input.nudge===1?1:0;
  if(direction&&!car.nudgeHeld&&car.nudgeCooldown<=0&&!car.finished&&!car.eliminated&&!car.overturned&&!car.falling&&car.y-(car.groundY||0)<.05){car.nudgeTime=NUDGE_DURATION;car.nudgeCooldown=.8;car.nudgeDirection=direction;car.nudgeAngle=car.angle;car.nudgeHits=[];}
  car.nudgeHeld=direction;
  const spinStep=Math.min(car.spinout||0,dt);car.spinout=Math.max(0,(car.spinout||0)-dt);
  if(spinStep)car.angle+=Math.PI*2*spinStep/START_SPIN_SECONDS;
  // Steering rack inertia is simulation state, replicated with the car so
  // prediction/replay has the same gradual turn-in and release as the server.
  const icy=activeTrack.id==='ice',targetSteer=car.finished?0:input.steer;
  if(icy)car.steering=targetSteer;
  else{
    const current=car.steering||0,releasing=Math.abs(targetSteer)<Math.abs(current)&&targetSteer*current>=0;
    car.steering=current+(targetSteer-current)*(1-Math.exp(-dt/(releasing?.16:.11)));
  }
  const uncontrolled=spinStep>0||car.wrecked||car.overturned||car.y-(car.groundY||0)>.05||car.falling;
  if(uncontrolled){
    const drag=car.y-(car.groundY||0)>.05||car.falling?.15:car.wrecked?2.4:3;
    car.vx*=Math.exp(-drag*dt);car.vz*=Math.exp(-drag*dt);car.angle+=car.yawVelocity*dt;
  }else{
    if(car.finished)input=NEUTRAL;
    let c=Math.cos(car.angle),s=Math.sin(car.angle);
    let forward=car.vx*c+car.vz*s,lateral=-car.vx*s+car.vz*c;
    const speedFactor=healthSpeedFactor(car.health),maxSpeed=Math.max(TOP_SPEED*speedFactor*(car.boost>0?1.1:1),padSpeed??0);
    const force=car.stun>0?0:input.reverse?-24*speedFactor:forward>=maxSpeed&&car.impactTime>0?0:input.throttle*25.2*speedFactor*(car.boost>0?1.35:1);
    const steering=clamp(car.steering+(car.tased>0?(Math.sin(car.tasePhase*19)+.5*Math.sin(car.tasePhase*31))*.3:0),-1,1);
    forward+=force*dt;forward*=Math.exp(-(input.brake?1.7:Math.abs(force)>0?.64+Math.abs(steering)*.23:1.5)*dt);
    // External impacts may exceed engine top speed; they decay instead of being erased.
    if(car.impactTime<=0)forward=clamp(forward,-14.4*speedFactor,maxSpeed);
    if(padSpeed!==null)forward=Math.max(forward,padSpeed);
    const handling=healthHandlingFactor(car.health)*(car.tased>0?.28:1)*(car.edgeBalance?Math.max(.35,(car.supportedWheels||0)/4):1);
    lateral*=Math.exp(-(car.impactTime>0?.65:input.brake?1.5:(icy?9.5:8.2)*handling*activeTrack.grip)*dt);
    const turn=steering*(input.brake?2.9:2.05)*(.8+.2*handling)*clamp(Math.abs(forward)/7,0,1)*Math.sign(forward);
    car.angle+=(turn+car.yawVelocity)*dt;
    const nc=Math.cos(car.angle),ns=Math.sin(car.angle),grip=(input.brake?.2:icy?.65:.58)*handling*activeTrack.grip;
    c=c*(1-grip)+nc*grip;s=s*(1-grip)+ns*grip;
    car.vx=c*forward-s*lateral;car.vz=s*forward+c*lateral;
  }
  if(activeTrack.id==='desert')applyDesertWind(car,(car.raceTime||0)+dt,dt);
  car.yawVelocity*=Math.exp(-3*dt);car.x+=car.vx*dt;car.z+=car.vz*dt;
  advanceNudge(car,dt);
  const track=constrainRoad(car);
  if(car.edgeBalance&&!car.falling){balanceOnWheels(car,wheelSupports(car,(x,z)=>roadSurfaceAt(x,z,car.trackFraction)),dt);supportRoad(car,nearestTrack(car.x,car.z,car.trackFraction));}
  if(car.falling){
    car.offRoadTime=(car.offRoadTime||0)+dt;collideTerrain(car,terrainAt,dt);
    // A fall remains a lost race, but its wreck keeps colliding and tumbling.
    if(!car.wrecked&&(car.offRoadTime>1.2||activeTrack.id==='coast'&&car.y< -2.1)){car.shield=0;damageCar(car,100);}
  }
  if(!car.edgeBalance&&!car.falling&&!car.overturned&&!car.wrecked&&car.y<=car.groundY+.001&&car.vy<=0){
    // Match the actual road normal in the same YXZ body basis as the renderer.
    // Airborne impact rotations remain entirely ballistic.
    const grade=track.grade||0,along=grade*(Math.cos(car.angle)*track.nz-Math.sin(car.angle)*track.nx),across=grade*(-Math.sin(car.angle)*track.nz-Math.cos(car.angle)*track.nx),blend=1-Math.exp(-dt*14);
    car.pitch+=(Math.atan2(along,Math.sqrt(1+across*across))-car.pitch)*blend;
    car.roll+=(Math.atan(-across)-car.roll)*blend;
  }
  let diff=track.fraction-car.trackFraction;if(diff>.5)diff-=1;if(diff<-.5)diff+=1;
  if(track.distance<track.halfWidth+5&&!car.falling&&!car.eliminated)car.progress+=clamp(diff,-.01,.01);
  if(activeTrack.id==='desert'&&!uncontrolled&&Math.hypot(car.vx,car.vz)>12){
    for(const ramp of DESERT_JUMPS)if(car.trackFraction<ramp.fraction&&track.fraction>=ramp.fraction&&diff>0&&diff<.01){
      car.y=Math.max(car.y,trackAt(ramp.fraction).y+ramp.height+.08);car.vy=8+Math.hypot(car.vx,car.vz)*.15;car.rampFlight=true;
    }
  }
  car.trackFraction=track.fraction;car.lap=clamp(Math.floor(Math.max(0,car.progress))+1,1,LAPS);
}
export function carContact(a,b){
  const fa={x:Math.cos(a.angle),z:Math.sin(a.angle)},sa={x:-fa.z,z:fa.x},fb={x:Math.cos(b.angle),z:Math.sin(b.angle)},sb={x:-fb.z,z:fb.x};
  const dx=b.x-a.x,dz=b.z-a.z;let depth=Infinity,nx=0,nz=0;
  for(const axis of [fa,sa,fb,sb]){
    const ra=Math.abs(fa.x*axis.x+fa.z*axis.z)*CAR_LENGTH/2+Math.abs(sa.x*axis.x+sa.z*axis.z)*CAR_WIDTH/2;
    const rb=Math.abs(fb.x*axis.x+fb.z*axis.z)*CAR_LENGTH/2+Math.abs(sb.x*axis.x+sb.z*axis.z)*CAR_WIDTH/2;
    const d=dx*axis.x+dz*axis.z,overlap=ra+rb-Math.abs(d);if(overlap<=0)return null;
    if(overlap<depth){depth=overlap;nx=axis.x*(d<0?-1:1);nz=axis.z*(d<0?-1:1);}
  }
  // Centre of the overlapping contact face, rather than an arbitrary support
  // corner. Nearly parallel bumpers must not produce a huge false spin impulse.
  const tx=-nz,tz=nx;
  const radius=(f,s,x,z)=>Math.abs(f.x*x+f.z*z)*CAR_LENGTH/2+Math.abs(s.x*x+s.z*z)*CAR_WIDTH/2;
  const at=a.x*tx+a.z*tz,bt=b.x*tx+b.z*tz,ar=radius(fa,sa,tx,tz),br=radius(fb,sb,tx,tz);
  const tangent=(Math.max(at-ar,bt-br)+Math.min(at+ar,bt+br))/2;
  const normal=(a.x*nx+a.z*nz+radius(fa,sa,nx,nz)+b.x*nx+b.z*nz-radius(fb,sb,nx,nz))/2;
  return {depth,nx,nz,x:nx*normal+tx*tangent,z:nz*normal+tz*tangent};
}
export function collideCars(cars,{road=false,damage=true}={}){
  for(let pass=0;pass<6;pass++){for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
    const a=cars[i],b=cars[j];if((a.eliminated&&!a.wrecked)||(b.eliminated&&!b.wrecked)||Math.abs(a.y-b.y)>1.3||a.falling||b.falling)continue;
    const hit=carContact(a,b);if(!hit)continue;const {nx,nz}=hit;
    const ma=a.wrecked?.4:1,mb=b.wrecked?.4:1,inertia=(CAR_LENGTH**2+CAR_WIDTH**2)/12;
    const ax=hit.x-a.x,az=hit.z-a.z,bx=hit.x-b.x,bz=hit.z-b.z;
    const va=(a.vx-a.yawVelocity*az)*nx+(a.vz+a.yawVelocity*ax)*nz,vb=(b.vx-b.yawVelocity*bz)*nx+(b.vz+b.yawVelocity*bx)*nz;
    const speed=va-vb,ta=ax*nz-az*nx,tb=bx*nz-bz*nx;
    const push=(hit.depth+.002)/(ma+mb);a.x-=nx*push*ma;a.z-=nz*push*ma;b.x+=nx*push*mb;b.z+=nz*push*mb;
    if(speed>0){const impulse=speed*1.08/(ma+mb+ta*ta*ma/inertia+tb*tb*mb/inertia);
      a.vx-=nx*impulse*ma;a.vz-=nz*impulse*ma;b.vx+=nx*impulse*mb;b.vz+=nz*impulse*mb;
      a.yawVelocity=clamp(a.yawVelocity-ta*impulse*ma/inertia,-3,3);b.yawVelocity=clamp(b.yawVelocity+tb*impulse*mb/inertia,-3,3);
      // A little contact friction makes rubbing doors and clipping a rear
      // quarter transfer sideways motion, while retaining deliberate drift.
      const tx=-nz,tz=nx,tangentSpeed=(b.vx-a.vx)*tx+(b.vz-a.vz)*tz;
      const friction=clamp(-tangentSpeed/(ma+mb),-impulse*.25,impulse*.25);
      a.vx-=tx*friction*ma;a.vz-=tz*friction*ma;b.vx+=tx*friction*mb;b.vz+=tz*friction*mb;
      a.impactTime=b.impactTime=.65;
      if(damage&&pass===0&&speed>7){if(a.contactCooldown<=0){damageCar(a,(speed-7)*.35);a.contactCooldown=.2;}if(b.contactCooldown<=0){damageCar(b,(speed-7)*.35);b.contactCooldown=.2;}}
    }
  }
    if(road)for(const car of cars)if(!car.eliminated||car.wrecked)constrainRoad(car);
  }
}
// Swept ray against the oriented chassis: fast bullets cannot tunnel between snapshots.
export function rayCar(x,z,dx,dz,car,padding=0){
  const c=Math.cos(car.angle),s=Math.sin(car.angle),ox=(x-car.x)*c+(z-car.z)*s,oz=-(x-car.x)*s+(z-car.z)*c,rx=dx*c+dz*s,rz=-dx*s+dz*c;
  let lo=0,hi=1;
  for(const [o,d,extent]of [[ox,rx,CAR_LENGTH/2+padding],[oz,rz,CAR_WIDTH/2+padding]]){
    if(Math.abs(d)<1e-9){if(Math.abs(o)>extent)return null;continue;}
    let a=(-extent-o)/d,b=(extent-o)/d;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;
  }
  return lo;
}
export function botInput(car){
  const p=trackAt(car.trackFraction+Math.max(7,Math.hypot(car.vx,car.vz)*.35)/TRACK_LENGTH);
  for(const f of PLAZAS){const d=arcDistance(car.trackFraction,f);if(d<48){const side=car.botLane||1,offset=side*5*Math.min(1,(48-d)/18);p.x+=p.nx*offset;p.z+=p.nz*offset;}}
  if(activeTrack.id==='ice'&&Math.abs(p.x)<175){
    const side=car.botLane||(car.gridSlot%2?-1:1),offset=side*8*clamp((175-Math.abs(p.x))/45,0,1);p.x+=p.nx*offset;p.z+=p.nz*offset;
  }
  const target=Math.atan2(p.z-car.z,p.x-car.x);
  const error=angleDelta(target,car.angle);
  const ahead=trackAt(car.trackFraction+24/TRACK_LENGTH),bend=Math.abs(angleDelta(ahead.angle,car.angle));const desired=clamp(36-bend*(activeTrack.id==='ice'?65:20),activeTrack.id==='ice'?8:13,36);
  return {steer:clamp(error*2.5,-1,1),throttle:Math.hypot(car.vx,car.vz)>desired?0:1,reverse:false,brake:Math.abs(error)>1.1,fire:false};
}

selectTrack();
