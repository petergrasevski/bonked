import { CAR_LENGTH, TOP_SPEED, angleDelta, clamp, damageCar, launchCar, rayCar, PICKUP_LOCATIONS } from './game.js';
export const WEAPONS = {
  pulse:{name:'Pulse',icon:'◎',ammo:1,hint:'two shockwaves, one second apart'},
  rocket:{name:'Homing rocket',icon:'➤',ammo:1,hint:'locks onto the next car ahead'},
  machinegun:{name:'Machine gun',icon:'⋮',ammo:30,continuous:true,hint:'hold to fire · 30 rounds'},
  shield:{name:'Shield',icon:'◈',ammo:1,hint:'eight seconds of protection'},
  railgun:{name:'Railgun',icon:'↗',ammo:1,hint:'one piercing shot straight ahead'},
  mine:{name:'Mines',icon:'✹',ammo:3,hint:'tap to drop · three mines'},
  chain:{name:'Ball & chain',icon:'●',ammo:1,hint:'swing it into another car'},
  flame:{name:'Flamethrower',icon:'♨',ammo:5,continuous:true,hint:'hold to burn · five seconds of fuel'},
  plasma:{name:'Plasma cannon',icon:'◉',ammo:12,continuous:true,hint:'hold to fire · 12 plasma rounds'},
  shotgun:{name:'Side shotgun',icon:'↔',ammo:4,hint:'fires from both sides · four shells'},
};
export const WEAPON_IDS=Object.keys(WEAPONS);
export const DAMAGE={pulse:8,rocket:42,machinegun:2,railgun:75,mine:28,chain:45,flame:12,plasma:8,shotgunPellet:7};
export function initCombat(room){room.serial??=0;room.projectiles=[];room.effects=[];room.mines=[];room.chains=[];room.pulses=[];}
export function giveWeapon(car,id){if(!WEAPONS[id])throw Error('Unknown weapon');car.item=id;car.ammo=WEAPONS[id].ammo;car.fireCooldown=0;}
const randomWeapon=random=>WEAPON_IDS[Math.floor(random()*WEAPON_IDS.length)];
export function createPickups(random=Math.random){return PICKUP_LOCATIONS.map((p,id)=>({id,x:p.x,z:p.z,item:randomWeapon(random),readyAt:0}));}
export function collectPickup(car,pickups,now,random=Math.random){
  if(car.item||car.finished||car.eliminated||car.y>=1||car.overturned||car.falling)return null;
  const pickup=pickups.find(p=>now>=p.readyAt&&Math.hypot(car.x-p.x,car.z-p.z)<3);
  if(!pickup)return null;
  giveWeapon(car,pickup.item);pickup.readyAt=now+6000;pickup.item=randomWeapon(random);
  return pickup;
}
const players=room=>[...room.players.values()];
const targets=(room,owner)=>players(room).filter(p=>p.id!==owner&&!p.car.finished&&(!p.car.eliminated||p.car.wrecked)&&!p.car.falling);
function effect(room,kind,x,z,now,extra={}){room.effects.push({id:++room.serial,kind,x,z,until:now+(extra.duration||500),color:extra.color||'#ff993d',...extra});if(room.effects.length>160)room.effects.shift();}
function hit(room,p,amount,now,kick={}){
  const c=p.car,protectedByShield=c.shield>0,wasWreck=c.wrecked;
  const damaged=damageCar(c,amount);
  if(protectedByShield)effect(room,'shield-hit',c.x,c.z,now,{color:'#66dcff',duration:160});
  if(!damaged)return false;
  c.vx+=kick.x||0;c.vz+=kick.z||0;c.impactTime=Math.max(c.impactTime,.8);
  if(kick.up)launchCar(c,kick.up,kick.side||0,kick.fore||0);
  if(!wasWreck&&c.wrecked){c.eliminatedAt=now-room.startAt;c.explosionShown=true;effect(room,'explosion',c.x,c.z,now,{duration:1100});}
  else if(amount>=8)effect(room,'hit',c.x,c.z,now,{duration:220});
  return true;
}
function pulse(room,owner,now){
  const c=room.players.get(owner)?.car;if(!c||c.eliminated)return;
  effect(room,'pulse',c.x,c.z,now,{duration:650,color:'#b681ff',radius:16});
  for(const p of targets(room,owner)){const dx=p.car.x-c.x,dz=p.car.z-c.z,d=Math.hypot(dx,dz);if(d<16&&p.car.y<3){const k=22*(1-d/16)+8;hit(room,p,DAMAGE.pulse,now,{x:dx/(d||1)*k,z:dz/(d||1)*k});}}
}
function projectile(room,p,kind,angle,now){
  const c=p.car,speed=kind==='plasma'?TOP_SPEED*1.5:kind==='machinegun'?350:65;
  const target=kind==='rocket'?targets(room,p.id).filter(t=>!t.car.eliminated&&t.car.progress>c.progress).sort((a,b)=>a.car.progress-b.car.progress)[0]?.id:null;
  room.projectiles.push({id:++room.serial,kind,owner:p.id,target,x:c.x+Math.cos(angle)*(CAR_LENGTH/2+.5),z:c.z+Math.sin(angle)*(CAR_LENGTH/2+.5),y:c.y+.7,angle,speed,until:now+(kind==='machinegun'?400:4000)});
}
function rayHits(room,p,angle,range,padding=0){
  const c=p.car,dx=Math.cos(angle)*range,dz=Math.sin(angle)*range;
  return targets(room,p.id).filter(t=>Math.abs(t.car.y-c.y)<1.6).map(target=>({target,t:rayCar(c.x,c.z,dx,dz,target.car,padding)})).filter(h=>h.t!==null).sort((a,b)=>a.t-b.t);
}
export function pressWeapon(room,p,now){
  const c=p.car,id=c.item;
  if(room.phase!=='racing'||!id||c.eliminated||c.finished||c.overturned||c.fireCooldown>0)return false;
  if(id==='flame')return false; // Fuel and damage are integrated only while held.
  if(id==='pulse'){pulse(room,p.id,now);room.pulses.push({owner:p.id,at:now+1000});}
  if(id==='shield'){c.shield=8;effect(room,'shield-hit',c.x,c.z,now,{color:'#66dcff'});}
  if(['rocket','machinegun','plasma'].includes(id))projectile(room,p,id,c.angle,now);
  if(id==='railgun'){
    for(const {target}of rayHits(room,p,c.angle,150,.25))hit(room,target,DAMAGE.railgun,now,{x:Math.cos(c.angle)*8,z:Math.sin(c.angle)*8});
    effect(room,'rail',c.x,c.z,now,{toX:c.x+Math.cos(c.angle)*150,toZ:c.z+Math.sin(c.angle)*150,color:'#98ecff',duration:1800});
  }
  if(id==='mine'){
    room.mines.push({id:++room.serial,owner:p.id,x:c.x-Math.cos(c.angle)*3.5,z:c.z-Math.sin(c.angle)*3.5,armAt:now+650,until:now+180000});
    if(room.mines.length>90)room.mines.shift();
  }
  if(id==='chain'){
    room.chains=room.chains.filter(b=>b.owner!==p.id);
    room.chains.push({id:++room.serial,owner:p.id,x:c.x-Math.cos(c.angle)*CAR_LENGTH*2,z:c.z-Math.sin(c.angle)*CAR_LENGTH*2,vx:c.vx,vz:c.vz,length:CAR_LENGTH*1.5});
  }
  if(id==='shotgun'){
    const hits=new Map();
    for(const side of [-1,1]){
      const a=c.angle+Math.PI/2*side;
      for(let i=-2;i<=2;i++){const angle=a+i*.09,h=rayHits(room,p,angle,16,.1)[0];if(h)hits.set(h.target,(hits.get(h.target)||0)+DAMAGE.shotgunPellet);}
      effect(room,'shotgun',c.x,c.z,now,{toX:c.x+Math.cos(a)*16,toZ:c.z+Math.sin(a)*16,color:'#ffd990',duration:170});
    }
    for(const [target,amount]of hits){const dx=target.car.x-c.x,dz=target.car.z-c.z,d=Math.hypot(dx,dz)||1;hit(room,target,amount,now,{x:dx/d*18,z:dz/d*18});}
  }
  c.ammo--;c.fireCooldown=id==='machinegun'?.075:id==='plasma'?.23:id==='shotgun'?.6:.2;
  if(c.ammo<=0){c.item=null;c.ammo=0;}
  return true;
}
export function updateCombat(room,dt,now){
  for(const p of room.players.values()){
    const c=p.car;c.firing=null;c.fireCooldown=Math.max(0,c.fireCooldown-dt);
    const held=!!(p.simInput||p.input).fire&&!c.eliminated&&!c.finished&&!c.overturned;
    const pressed=held&&!p.fireLatch;p.fireLatch=held;
    if(!c.item)continue;
    if(c.item==='flame'&&held){
      const used=Math.min(dt,c.ammo);c.ammo-=used;c.firing='flame';
      for(const q of targets(room,p.id)){
        const dx=q.car.x-c.x,dz=q.car.z-c.z,along=dx*Math.cos(c.angle)+dz*Math.sin(c.angle),side=Math.abs(-dx*Math.sin(c.angle)+dz*Math.cos(c.angle));
        if(along>0&&along<CAR_LENGTH*2+1&&side<1.2+along*.24&&Math.abs(q.car.y-c.y)<2)hit(room,q,DAMAGE.flame*used,now);
      }
      if(c.ammo<=.00001){c.item=null;c.ammo=0;}
    }else if(pressed||(held&&WEAPONS[c.item]?.continuous))pressWeapon(room,p,now);
  }
  for(const scheduled of room.pulses)if(now>=scheduled.at){pulse(room,scheduled.owner,now);scheduled.done=true;}
  room.pulses=room.pulses.filter(p=>!p.done);
  for(const shot of room.projectiles){
    if(shot.kind==='rocket'&&shot.target){const target=room.players.get(shot.target)?.car;if(target&&!target.eliminated){const desired=Math.atan2(target.z+target.vz*.1-shot.z,target.x+target.vx*.1-shot.x);shot.angle+=clamp(angleDelta(desired,shot.angle),-3.8*dt,3.8*dt);}}
    const dx=Math.cos(shot.angle)*shot.speed*dt,dz=Math.sin(shot.angle)*shot.speed*dt;
    const hits=targets(room,shot.owner).filter(p=>Math.abs(p.car.y+.6-shot.y)<1.4).map(p=>({p,t:rayCar(shot.x,shot.z,dx,dz,p.car,shot.kind==='plasma'?.55:.1)})).filter(h=>h.t!==null).sort((a,b)=>a.t-b.t);
    const target=hits[0];const oldX=shot.x,oldZ=shot.z;shot.x+=dx*(target?.t??1);shot.z+=dz*(target?.t??1);
    if(shot.kind==='machinegun')effect(room,'tracer',oldX,oldZ,now,{toX:shot.x,toZ:shot.z,duration:80,color:'#ffe7a3'});
    if(target){hit(room,target.p,DAMAGE[shot.kind],now,{x:Math.cos(shot.angle)*(shot.kind==='rocket'?12:1),z:Math.sin(shot.angle)*(shot.kind==='rocket'?12:1)});shot.until=0;if(shot.kind==='rocket')effect(room,'explosion',shot.x,shot.z,now,{duration:650});}
  }
  room.projectiles=room.projectiles.filter(p=>p.until>now).slice(-180);
  for(const mine of room.mines){if(now<mine.armAt)continue;for(const p of targets(room,null)){
    const c=p.car;if(c.y>1.4||c.eliminated||Math.hypot(c.x-mine.x,c.z-mine.z)>3)continue;
    const dx=mine.x-c.x,dz=mine.z-c.z,side=-dx*Math.sin(c.angle)+dz*Math.cos(c.angle),fore=dx*Math.cos(c.angle)+dz*Math.sin(c.angle);
    hit(room,p,DAMAGE.mine,now,{up:15,side:side+.35*Math.sin(c.angle),fore:fore+Math.hypot(c.vx,c.vz)*.09,x:-dx*3,z:-dz*3});mine.until=0;effect(room,'explosion',mine.x,mine.z,now,{duration:850});break;
  }}room.mines=room.mines.filter(m=>m.until>now);
  for(const ball of room.chains){
    const owner=room.players.get(ball.owner),c=owner?.car;if(!c||c.eliminated){ball.dead=true;continue;}
    const anchorX=c.x-Math.cos(c.angle)*CAR_LENGTH/2,anchorZ=c.z-Math.sin(c.angle)*CAR_LENGTH/2;
    const previousX=ball.x,previousZ=ball.z;
    ball.vx*=Math.exp(-.6*dt);ball.vz*=Math.exp(-.6*dt);ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;
    const dx=ball.x-anchorX,dz=ball.z-anchorZ,d=Math.hypot(dx,dz)||1;
    if(d>ball.length){
      const nx=dx/d,nz=dz/d,correction=d-ball.length;ball.x-=nx*correction;ball.z-=nz*correction;
      const separating=(ball.vx-c.vx)*nx+(ball.vz-c.vz)*nz;
      if(separating>0){ball.vx-=nx*separating;ball.vz-=nz*separating;c.vx+=nx*separating*.12;c.vz+=nz*separating*.12;}
      ball.vx-=nx*correction/dt*.5;ball.vz-=nz*correction/dt*.5;
    }
    ball.anchorX=anchorX;ball.anchorZ=anchorZ;
    for(const p of targets(room,ball.owner)){if(p.car.y>1.7)continue;if(rayCar(previousX,previousZ,ball.x-previousX,ball.z-previousZ,p.car,.8)!==null){
      const dx=p.car.x-ball.x,dz=p.car.z-ball.z,d=Math.hypot(dx,dz)||1,side=-dx*Math.sin(p.car.angle)+dz*Math.cos(p.car.angle);
      hit(room,p,DAMAGE.chain,now,{x:dx/d*16,z:dz/d*16,up:7,side:side*.4,fore:.4});ball.dead=true;effect(room,'explosion',ball.x,ball.z,now,{duration:700});break;
    }}
  }room.chains=room.chains.filter(b=>!b.dead);
  room.effects=room.effects.filter(e=>e.until>now);
}
