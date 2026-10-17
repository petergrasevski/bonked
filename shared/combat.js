import {shotgunRays,weaponBasis,weaponDirection,weaponMuzzle,rayCar3D,sweepTrackWalls,MUZZLE_HEIGHT} from './weapon-geometry.js';
import { activeTrack, CAR_LENGTH, TOP_SPEED, TRACK_LENGTH, angleDelta, clamp, damageCar, weaponImpact, rayCar, PICKUP_LOCATIONS, nearestTrack, trackAt, roadSurfaceAt, terrainAt } from './game.js';
import {PULSE_RADIUS,pulsePush} from './shockwave.js';
export const WEAPONS = {
  pulse:{name:'Pulse',icon:'◎',ammo:1,hint:'two shockwaves, one second apart'},
  rocket:{name:'Homing rocket',icon:'➤',ammo:1,hint:'locks onto the next car ahead'},
  machinegun:{name:'Machine gun',icon:'⋮',ammo:30,continuous:true,hint:'hold to fire · 30 rounds'},
  shield:{name:'Shield',icon:'◈',ammo:1,hint:'eight seconds of protection'},
  railgun:{name:'Railgun',icon:'↗',ammo:1,hint:'one piercing shot straight ahead'},
  mine:{name:'Mines',icon:'✹',ammo:3,hint:'tap to drop · three mines'},
  chain:{name:'Ball & chain',icon:'●',ammo:1,hint:'swing it into another car'},
  flame:{name:'Flamethrower',icon:'♨',ammo:3,continuous:true,hint:'hold to burn · three seconds of fuel'},
  plasma:{name:'Plasma cannon',icon:'◉',ammo:12,continuous:true,hint:'hold to fire · 12 plasma rounds'},
  taser:{name:'Taser',icon:'ϟ',ammo:5,continuous:true,hint:'hold to arc · 5 seconds · nearby cars'},
  shotgun:{name:'Shotgun',icon:'↔',ammo:4,hint:'fires from both sides · four shells'},
};
export const WEAPON_IDS=Object.keys(WEAPONS);
export const FLAME_RANGE=(CAR_LENGTH*2+1)*1.5;
export const TASER_RADIUS=CAR_LENGTH*1.75;
export const DAMAGE={taser:15,pulse:8,rocket:42,machinegun:2,railgun:75,mine:28,chain:45,flame:12,plasma:8,shotgunPellet:12};
export function initCombat(room){room.serial??=0;room.arcs=[];room.sounds=[];room.projectiles=[];room.effects=[];room.mines=[];room.chains=[];room.pulses=[];}
export function giveWeapon(car,id){if(!WEAPONS[id])throw Error('Unknown weapon');car.item=id;car.ammo=WEAPONS[id].ammo;car.fireCooldown=0;}
const randomWeapon=random=>WEAPON_IDS[Math.floor(random()*WEAPON_IDS.length)];
export function createPickups(random=Math.random){return PICKUP_LOCATIONS.map((p,id)=>({id,x:p.x,y:p.y,z:p.z,item:randomWeapon(random),readyAt:0}));}
export function collectPickup(car,pickups,now,random=Math.random){
  if(car.item||car.finished||car.eliminated||car.y-(car.groundY||0)>=1||car.overturned||car.falling)return null;
  const pickup=pickups.filter(p=>now>=p.readyAt&&Math.abs(car.y-(p.y||0))<1&&Math.hypot(car.x-p.x,car.z-p.z)<3).sort((a,b)=>Math.hypot(car.x-a.x,car.z-a.z)-Math.hypot(car.x-b.x,car.z-b.z))[0];
  if(!pickup)return null;
  giveWeapon(car,pickup.item);pickup.readyAt=now+2000;pickup.item=randomWeapon(random);
  return pickup;
}
const players=room=>[...room.players.values()];
const targets=(room,owner)=>players(room).filter(p=>p.id!==owner&&!p.car.finished&&(!p.car.eliminated||p.car.wrecked)&&!p.car.falling);
function eventId(room,kind){const event=room.shotEvent;if(!event)return ++room.serial;const n=event.counts[kind]||0;event.counts[kind]=n+1;return `${event.key}:${kind}:${n}`;}
function effect(room,kind,x,z,now,extra={}){if(room.visualOnly&&!room.shotEvent)return;room.effects.push({id:eventId(room,'effect-'+kind),kind,x,z,until:now+(extra.duration||500),color:extra.color||'#ff993d',...extra});if(room.effects.length>160)room.effects.shift();}
function sound(room,kind,car,now){if(room.visualOnly&&!room.shotEvent)return;room.sounds??=[];room.sounds.push({id:eventId(room,'sound-'+kind),kind,owner:car.owner??players(room).find(p=>p.car===car)?.id??null,x:car.x,y:car.y||0,z:car.z,at:now});if(room.sounds.length>96)room.sounds.shift();}
function clearArenaSight(a,b){if(activeTrack.id!=='cafe')return true;const origin={x:a.x,y:(a.y||0)+1,z:a.z},delta={x:b.x-a.x,y:(b.y||0)-(a.y||0),z:b.z-a.z};return sweepTrackWalls(origin,delta,.05)===null;}
export function awardArenaKill(room,victim,owner,now){
  const attacker=room.players.get(owner);
  if(room.visualOnly||room.gameType!=='battle-arena'||!victim?.car.eliminated||victim.car.killScored||!attacker||attacker.id===victim.id)return false;
  victim.car.killScored=true;attacker.score=(attacker.score||0)+1;attacker.roundKills=(attacker.roundKills||0)+1;
  effect(room,'kill-score',attacker.car.x,attacker.car.z,now,{owner:attacker.id,victim:victim.id,y:attacker.car.y||0,at:now,duration:1100,color:attacker.color});
  return true;
}
function hit(room,p,amount,now,kick={}){
  if(room.visualOnly)return false; // Only the server can award damage or weapon impulses.
  const c=p.car,protectedByShield=c.shield>0,wasWreck=c.wrecked,healthBefore=c.health;
  const damaged=damageCar(c,amount);
  if(protectedByShield)effect(room,'shield-hit',c.x,c.z,now,{y:c.y,color:'#66dcff',duration:160});
  if(!damaged)return false;
  weaponImpact(c,kick,healthBefore);
  if(!wasWreck&&c.wrecked){
    awardArenaKill(room,p,kick.owner,now);
    c.eliminatedAt=now-room.startAt;c.explosionShown=true;sound(room,'explosion',c,now);effect(room,'explosion',c.x,c.z,now,{y:c.y,duration:1100});}
  else if(amount>=8)effect(room,'hit',c.x,c.z,now,{y:c.y,duration:220});
  return true;
}
function pulse(room,owner,now){
  const c=room.players.get(owner)?.car;if(!c||c.eliminated)return;
  effect(room,'pulse',c.x,c.z,now,{y:c.y,duration:650,color:'#b681ff',radius:PULSE_RADIUS});
  for(const p of targets(room,owner)){const dx=p.car.x-c.x,dz=p.car.z-c.z,d=Math.hypot(dx,dz);if(clearArenaSight(c,p.car)&&d<PULSE_RADIUS&&Math.abs(p.car.y-c.y)<3){const k=pulsePush(d);hit(room,p,DAMAGE.pulse,now,{owner,x:dx/(d||1)*k,z:dz/(d||1)*k,fixedImpulse:true});}}
}
function projectile(room,p,kind,angle,now){
  const c=p.car,speed=kind==='plasma'?TOP_SPEED*1.5:kind==='machinegun'?350:65,d=weaponDirection(c),muzzle=weaponMuzzle(c);
  const target=kind==='rocket'?targets(room,p.id).filter(t=>!t.car.eliminated&&(activeTrack.id==='cafe'||t.car.progress>c.progress)).sort((a,b)=>activeTrack.id==='cafe'?Math.hypot(a.car.x-c.x,a.car.z-c.z)-Math.hypot(b.car.x-c.x,b.car.z-c.z):a.car.progress-b.car.progress)[0]?.id:null;
  const shot={id:eventId(room,kind),kind,owner:p.id,target,...muzzle,angle:Math.atan2(d.z,d.x),pitch:Math.atan2(d.y,Math.hypot(d.x,d.z)),vx:d.x*speed,vy:d.y*speed,vz:d.z*speed,speed,until:now+(kind==='machinegun'?400:4000)};
  if(kind==='rocket'){
    const route=nearestTrack(c.x,c.z,c.trackFraction);
    // Only attach actual road launches to its route; detached arenas keep free homing.
    if(activeTrack.id!=='cafe'&&route.distance<route.halfWidth+3){
      const near=nearestTrack(shot.x,shot.z,route.fraction);shot.trackFraction=near.fraction;shot.routeY=near.y;
      shot.lane=(c.x-route.x)*route.nx+(c.z-route.z)*route.nz;
      const start=weaponMuzzle(c,0,0),delta={x:shot.x-start.x,y:shot.y-start.y,z:shot.z-start.z},wall=sweepTrackWalls(start,delta);
      if(wall!==null){shot.x=start.x+delta.x*wall;shot.y=start.y+delta.y*wall;shot.z=start.z+delta.z*wall;shot.until=0;effect(room,'explosion',shot.x,shot.z,now,{y:shot.y,duration:650});sound(room,'explosion',shot,now);return;}
    }
  }
  room.projectiles.push(shot);
}
function rayHits(room,p,offset,range,padding=0){
  const origin=weaponMuzzle(p.car,offset,0),d=weaponDirection(p.car,offset),delta={x:d.x*range,y:d.y*range,z:d.z*range};
  const wall=activeTrack.id==='cafe'?sweepTrackWalls(origin,delta):null;
  return targets(room,p.id).map(target=>({target,t:rayCar3D(origin,delta,target.car,padding)})).filter(h=>h.t!==null&&(wall===null||h.t<wall)).sort((a,b)=>a.t-b.t);
}
function beam(room,kind,c,offset,range,now,extra){
  const origin=weaponMuzzle(c,offset,0),d=weaponDirection(c,offset);
  if(activeTrack.id==='cafe'){const wall=sweepTrackWalls(origin,{x:d.x*range,y:d.y*range,z:d.z*range});if(wall!==null)range*=wall;}
  effect(room,kind,origin.x,origin.z,now,{y:origin.y,toX:origin.x+d.x*range,toY:origin.y+d.y*range,toZ:origin.z+d.z*range,...extra});
}
function rocketDelta(shot,room,dt){
  const target=room.players.get(shot.target)?.car;
  if(shot.trackFraction!==undefined){
    const route=nearestTrack(shot.x,shot.z,shot.trackFraction);shot.trackFraction=route.fraction;
    let ahead=trackAt(route.fraction+12/TRACK_LENGTH),lane=shot.lane??0;
    if(target&&!target.eliminated){
      const targetRoute=nearestTrack(target.x,target.z,target.trackFraction),distance=((targetRoute.fraction-route.fraction+1)%1)*TRACK_LENGTH;
      const targetLane=(target.x-targetRoute.x)*targetRoute.nx+(target.z-targetRoute.z)*targetRoute.nz;
      lane+=(clamp(targetLane,-ahead.halfWidth+.6,ahead.halfWidth-.6)-lane)*(1-Math.exp(-dt*2.5));
      if(distance<12)ahead={...ahead,x:target.x+target.vx*.08,z:target.z+target.vz*.08,nx:0,nz:0};
    }
    shot.lane=lane;
    const desired=Math.atan2(ahead.z+ahead.nz*lane-shot.z,ahead.x+ahead.nx*lane-shot.x);
    shot.angle+=clamp(angleDelta(desired,shot.angle),-3.8*dt,3.8*dt);
    const x=Math.cos(shot.angle)*shot.speed*dt,z=Math.sin(shot.angle)*shot.speed*dt,next=nearestTrack(shot.x+x,shot.z+z,route.fraction);
    // Ground-following lift, with ballistic continuity over the small launch ramps.
    const floor=next.y+MUZZLE_HEIGHT,freeY=shot.y+(shot.flightVy??shot.vy??0)*dt-11*dt*dt,newY=Math.max(floor,freeY);
    const y=newY-shot.y;shot.flightVy=newY>floor+.001?(shot.flightVy??shot.vy??0)-22*dt:y/dt;
    shot.trackFraction=next.fraction;shot.routeY=next.y;return {x,y,z};
  }
  if(target&&!target.eliminated){
    const dx=target.x+target.vx*.1-shot.x,dz=target.z+target.vz*.1-shot.z,dy=target.y+MUZZLE_HEIGHT-shot.y;
    shot.angle+=clamp(angleDelta(Math.atan2(dz,dx),shot.angle),-3.8*dt,3.8*dt);
    shot.pitch=(shot.pitch||0)+clamp(Math.atan2(dy,Math.hypot(dx,dz))-(shot.pitch||0),-3.8*dt,3.8*dt);
  }
  const cp=Math.cos(shot.pitch||0);return {x:Math.cos(shot.angle)*cp*shot.speed*dt,y:Math.sin(shot.pitch||0)*shot.speed*dt,z:Math.sin(shot.angle)*cp*shot.speed*dt};
}
export function pressWeapon(room,p,now){
  const c=p.car,id=c.item;
  if(room.phase!=='racing'||!id||c.eliminated||c.finished||c.overturned||c.fireCooldown>0)return false;
  if(id==='flame'||id==='taser')return false; // Fuel and damage are integrated only while held.
  c.weaponShot=(c.weaponShot||0)+1;room.shotEvent={key:`weapon:${p.id}:${c.weaponShot}`,counts:{}};
  sound(room,id,c,now);
  if(id==='pulse'){pulse(room,p.id,now);room.pulses.push({owner:p.id,at:now+1000,key:room.shotEvent.key+':echo'});}
  if(id==='shield'){c.shield=8;effect(room,'shield-hit',c.x,c.z,now,{y:c.y,color:'#66dcff'});}
  if(['rocket','machinegun','plasma'].includes(id))projectile(room,p,id,c.angle,now);
  if(id==='railgun'){
    for(const {target,t}of rayHits(room,p,0,150,.25)){const origin=weaponMuzzle(c,0,0),direction=weaponDirection(c);hit(room,target,DAMAGE.railgun,now,{owner:p.id,x:Math.cos(c.angle)*8,z:Math.sin(c.angle)*8,up:7,point:{x:origin.x+direction.x*150*t,y:origin.y+direction.y*150*t,z:origin.z+direction.z*150*t}});}
    beam(room,'rail',c,0,150,now,{color:'#98ecff',duration:1800});
  }
  if(id==='mine'){
    const x=c.x-Math.cos(c.angle)*3.5,z=c.z-Math.sin(c.angle)*3.5,road=activeTrack.id==='cafe'?{...terrainAt(x,z,c.y+.7),nx:0,nz:1,fraction:0}:nearestTrack(x,z,c.trackFraction??null);
    // Sample the actual drop point, on the owner's deck of a stacked crossing.
    room.mines.push({id:eventId(room,'mine'),owner:p.id,x,y:road.y+.025,z,angle:Math.atan2(-road.nx,road.nz),pitch:Math.atan(road.grade||0),trackFraction:road.fraction,armAt:now+100,until:now+180000});
    if(room.mines.length>90)room.mines.shift();
  }
  if(id==='chain'){
    room.chains=room.chains.filter(b=>b.owner!==p.id);
    const anchor=weaponMuzzle(c,Math.PI,CAR_LENGTH/2),x=anchor.x-Math.cos(c.angle)*CAR_LENGTH*1.5,z=anchor.z-Math.sin(c.angle)*CAR_LENGTH*1.5,road=activeTrack.id==='cafe'?terrainAt(x,z,c.y+.7):nearestTrack(x,z,c.trackFraction);
    room.chains.push({id:eventId(room,'chain'),owner:p.id,y:road.y+.98,x,z,vx:c.vx,vy:0,vz:c.vz,trackFraction:road.fraction,length:CAR_LENGTH*1.5,anchorX:anchor.x,anchorY:anchor.y,anchorZ:anchor.z});
  }
  if(id==='shotgun'){
    const hits=new Map();
    for(const {origin,direction,side,barrel} of shotgunRays(c)){
      const delta={x:direction.x*16,y:direction.y*16,z:direction.z*16};
      const wall=activeTrack.id==='cafe'?sweepTrackWalls(origin,delta,.1):null;
      const first=targets(room,p.id).map(target=>({target,t:rayCar3D(origin,delta,target.car,.1)})).filter(h=>h.t!==null&&(wall===null||h.t<wall)).sort((a,b)=>a.t-b.t)[0];
      if(first)hits.set(first.target,(hits.get(first.target)||0)+DAMAGE.shotgunPellet);
      const t=first?.t??wall??1;
      effect(room,'shotgun',origin.x,origin.z,now,{y:origin.y,toX:origin.x+delta.x*t,toY:origin.y+delta.y*t,toZ:origin.z+delta.z*t,color:'#ffd990',duration:170,side,barrel});
    }
    for(const [target,amount]of hits){const dx=target.car.x-c.x,dz=target.car.z-c.z,d=Math.hypot(dx,dz)||1;hit(room,target,amount,now,{owner:p.id,x:dx/d*18,z:dz/d*18});}
  }
  c.ammo--;c.fireCooldown=id==='machinegun'?.075:id==='plasma'?.23:id==='shotgun'?.3:.2;
  if(c.ammo<=0){c.item=null;c.ammo=0;}
  room.shotEvent=null;
  return true;
}
export function updateCombat(room,dt,now){
  room.arcs=room.visualOnly?room.arcs.filter(a=>a.owner!==room.predictionOwner):[];room.sounds=(room.sounds||[]).filter(s=>now-s.at<1500);
  if(!room.visualOnly)for(const p of room.players.values())p.car.tased=0;
  for(const p of room.players.values()){
    if(room.visualOnly&&p.id!==room.predictionOwner)continue;
    const c=p.car;c.firing=null;c.fireCooldown=Math.max(0,c.fireCooldown-dt);
    const held=!!(p.simInput||p.input).fire&&!c.eliminated&&!c.finished&&!c.overturned;
    const pressed=held&&!p.fireLatch;p.fireLatch=held;
    if(!c.item)continue;
    if(c.item==='taser'&&held){
      const used=Math.min(dt,c.ammo);c.ammo=Math.max(0,c.ammo-used);c.firing='taser';
      for(const q of targets(room,p.id)){
        if(!clearArenaSight(c,q.car)||q.car.eliminated||q.car.shield>0||Math.abs(q.car.y-c.y)>2.5||Math.hypot(q.car.x-c.x,q.car.z-c.z)>TASER_RADIUS)continue;
        hit(room,q,DAMAGE.taser*used,now,{owner:p.id});if(!room.visualOnly&&!q.car.eliminated)q.car.tased=.08;
        room.arcs.push({owner:p.id,target:q.id});
      }
      if(c.ammo<=.00001){c.item=null;c.ammo=0;}
    }else if(c.item==='flame'&&held){
      const used=Math.min(dt,c.ammo);c.ammo-=used;c.firing='flame';
      for(const q of targets(room,p.id)){
        const origin=weaponMuzzle(c,0,0),b=weaponBasis(c),dx=q.car.x-origin.x,dy=q.car.y+.7-origin.y,dz=q.car.z-origin.z,along=dx*b.forward.x+dy*b.forward.y+dz*b.forward.z,side=Math.abs(dx*b.side.x+dy*b.side.y+dz*b.side.z),vertical=Math.abs(dx*b.up.x+dy*b.up.y+dz*b.up.z);
        if(clearArenaSight(c,q.car)&&along>0&&along<FLAME_RANGE&&side<1.2+along*.24&&vertical<1.2+along*.12)hit(room,q,DAMAGE.flame*used,now,{owner:p.id});
      }
      if(c.ammo<=.00001){c.item=null;c.ammo=0;}
    }else if(pressed||(held&&WEAPONS[c.item]?.continuous))pressWeapon(room,p,now);
  }
  for(const scheduled of room.pulses)if(now>=scheduled.at){room.shotEvent={key:scheduled.key||`pulse:${scheduled.owner}:${scheduled.at}`,counts:{}};pulse(room,scheduled.owner,now);const c=room.players.get(scheduled.owner)?.car;if(c&&!c.eliminated)sound(room,'pulse',c,now);scheduled.done=true;room.shotEvent=null;}
  room.pulses=room.pulses.filter(p=>!p.done);
  for(const shot of room.projectiles){
    if(shot.until<=now)continue;
    const delta=shot.kind==='rocket'?rocketDelta(shot,room,dt):{x:(shot.vx??Math.cos(shot.angle)*shot.speed)*dt,y:(shot.vy||0)*dt,z:(shot.vz??Math.sin(shot.angle)*shot.speed)*dt};
    const hits=targets(room,shot.owner).map(p=>({p,t:rayCar3D(shot,delta,p.car,shot.kind==='plasma'?.55:.1)})).filter(h=>h.t!==null).sort((a,b)=>a.t-b.t);
    const wall=(activeTrack.id==='cafe'||shot.kind==='rocket'&&shot.trackFraction!==undefined)?sweepTrackWalls(shot,delta):null;
    const target=hits[0],hitWall=wall!==null&&wall<=(target?.t??1),t=hitWall?wall:target?.t??1;
    const oldX=shot.x,oldY=shot.y,oldZ=shot.z;shot.x+=delta.x*t;shot.y+=delta.y*t;shot.z+=delta.z*t;
    shot.vx=delta.x/dt;shot.vy=delta.y/dt;shot.vz=delta.z/dt;shot.pitch=Math.atan2(delta.y,Math.hypot(delta.x,delta.z));
    if(shot.kind==='machinegun')effect(room,'tracer',oldX,oldZ,now,{y:oldY,toX:shot.x,toY:shot.y,toZ:shot.z,duration:80,color:'#ffe7a3'});
    if(target||hitWall){
      sound(room,shot.kind==='rocket'?'explosion':'impact',shot,now);
      if(!hitWall)hit(room,target.p,DAMAGE[shot.kind],now,{owner:shot.owner,x:Math.cos(shot.angle)*(shot.kind==='rocket'?12:1),z:Math.sin(shot.angle)*(shot.kind==='rocket'?12:1),up:shot.kind==='rocket'?8:0,point:{x:shot.x,y:shot.y,z:shot.z}});
      shot.until=0;if(shot.kind==='rocket')effect(room,'explosion',shot.x,shot.z,now,{y:shot.y,duration:650});
    }
  }
  room.projectiles=room.projectiles.filter(p=>p.until>now).slice(-180);
  for(const mine of room.mines){if(now<mine.armAt)continue;for(const p of targets(room,null)){
    const c=p.car,along=(c.x-mine.x)*Math.cos(mine.angle||0)+(c.z-mine.z)*Math.sin(mine.angle||0),surfaceY=(mine.y||0)+along*Math.tan(mine.pitch||0);
    if(Math.abs(c.y-surfaceY)>1.4||c.eliminated||Math.hypot(c.x-mine.x,c.z-mine.z)>3)continue;
    const dx=mine.x-c.x,dz=mine.z-c.z;
    hit(room,p,DAMAGE.mine,now,{owner:mine.owner,mine:true,x:-dx*.65,z:-dz*.65,point:{x:mine.x,y:mine.y,z:mine.z}});mine.until=0;sound(room,'explosion',mine,now);effect(room,'explosion',mine.x,mine.z,now,{y:mine.y,duration:850});break;
  }}room.mines=room.mines.filter(m=>m.until>now);
  for(const ball of room.chains){
    const owner=room.players.get(ball.owner),c=owner?.car;if(!c||c.eliminated){ball.dead=true;continue;}
    const anchor=weaponMuzzle(c,Math.PI,CAR_LENGTH/2),previous={x:ball.x,y:ball.y,z:ball.z};
    ball.vx*=Math.exp(-.6*dt);ball.vz*=Math.exp(-.6*dt);ball.vy=(ball.vy||0)-22*dt;
    ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;ball.y+=ball.vy*dt;
    // Alternate ground and 3D rope constraints. Route hints keep the ball on
    // the owner's overpass deck; its own contact point determines its height.
    for(let pass=0;pass<8;pass++){
      const road=roadSurfaceAt(ball.x,ball.z,c.trackFraction),ground=road||terrainAt(ball.x,ball.z,Math.max(ball.y,anchor.y)+2);
      if(ground&&ball.y<ground.y+.98){ball.y=ground.y+.98;ball.vy=Math.max(0,ball.vy);}
      const dx=ball.x-anchor.x,dy=ball.y-anchor.y,dz=ball.z-anchor.z,d=Math.hypot(dx,dy,dz)||1;
      if(d<=ball.length+.00001)break;
      const nx=dx/d,ny=dy/d,nz=dz/d,correction=d-ball.length;ball.x-=nx*correction;ball.y-=ny*correction;ball.z-=nz*correction;
      if(pass===0){const separating=(ball.vx-c.vx)*nx+(ball.vy-(c.vy||0))*ny+(ball.vz-c.vz)*nz;if(separating>0){ball.vx-=nx*separating;ball.vy-=ny*separating;ball.vz-=nz*separating;c.vx+=nx*separating*.12;c.vz+=nz*separating*.12;}ball.vx-=nx*correction/dt*.5;ball.vz-=nz*correction/dt*.5;}
    }
    ball.anchorX=anchor.x;ball.anchorY=anchor.y;ball.anchorZ=anchor.z;
    ball.renderVx=(ball.x-previous.x)/dt;ball.renderVy=(ball.y-previous.y)/dt;ball.renderVz=(ball.z-previous.z)/dt;
    for(const p of targets(room,ball.owner)){if(rayCar3D(previous,{x:ball.x-previous.x,y:ball.y-previous.y,z:ball.z-previous.z},p.car,.95)!==null){
      const dx=p.car.x-ball.x,dz=p.car.z-ball.z,d=Math.hypot(dx,dz)||1;
      hit(room,p,DAMAGE.chain,now,{owner:ball.owner,x:dx/d*16,z:dz/d*16,up:7,point:{x:ball.x,y:ball.y,z:ball.z}});ball.dead=true;sound(room,'explosion',ball,now);effect(room,'explosion',ball.x,ball.z,now,{y:ball.y,duration:700});break;
    }}
  }room.chains=room.chains.filter(b=>!b.dead);
  room.effects=room.effects.filter(e=>e.until>now);
}
