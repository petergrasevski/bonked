import {cameraFrame} from './chase.js';
import {skyGroundAt} from './sky-ground.js';
import {PULSE_RADIUS,pulsePush} from './shockwave.js';
export const SKY_DELAY=600,SKY_COOLDOWN=3000;
export function sanitizeSkyAim(aim){return aim&&Number.isFinite(aim.x)&&Number.isFinite(aim.z)?{x:aim.x,z:aim.z}:null;}
export function boundedSkyAim(aim,frame){
  const radius=Math.min(500,Math.max(120,(frame.spread||0)+70)),dx=aim.x-frame.x,dz=aim.z-frame.z,d=Math.hypot(dx,dz),scale=d>radius?radius/d:1;
  return {x:frame.x+dx*scale,z:frame.z+dz*scale};
}
export function resetSkyBeams(room){
  room.skyBeams=[];for(const p of room.players.values()){p.skyAim=null;p.skyTarget=null;p.skyCooldownUntil=0;p.skyFireLatch=false;}
}
export function updateSkyBeams(room,now){
  room.skyBeams??=[];if(room.phase!=='racing'){room.skyBeams=[];return;}
  let frame;
  for(const p of room.players.values()){
    if(!p.car.eliminated||p.bot||p.ws===null){p.skyTarget=null;continue;}
    frame??=cameraFrame(room.chase,[...room.players.values()].map(p=>p.car));
    const fresh=!p.skyTarget,aim=boundedSkyAim(sanitizeSkyAim(p.skyAim)||frame,frame);
    p.skyTarget={...aim,y:skyGroundAt(aim.x,aim.z).y};p.skyCooldownUntil??=0;
    const fire=!!(p.simInput||p.input)?.fire;
    if(!fresh&&fire&&!p.skyFireLatch&&now>=p.skyCooldownUntil){
      room.skyBeams.push({id:++room.serial,owner:p.id,color:p.color,...p.skyTarget,at:now,impactAt:now+SKY_DELAY,until:now+SKY_DELAY+650});p.skyCooldownUntil=now+SKY_COOLDOWN;
    }
    p.skyFireLatch=fire;
  }
  for(const beam of room.skyBeams)if(!beam.hit&&now>=beam.impactAt){
    beam.hit=true;
    for(const p of room.players.values()){
      const c=p.car;if(c.eliminated||c.finished||c.falling||c.shield>0||Math.abs(c.y-beam.y)>=3)continue;
      const dx=c.x-beam.x,dz=c.z-beam.z,d=Math.hypot(dx,dz);if(d>=PULSE_RADIUS)continue;
      const k=pulsePush(d);c.vx+=dx/(d||1)*k;c.vz+=dz/(d||1)*k;c.impactTime=Math.max(c.impactTime||0,.8);
    }
    room.effects.push({id:++room.serial,kind:'pulse',x:beam.x,y:beam.y,z:beam.z,color:beam.color,radius:PULSE_RADIUS,duration:650,until:now+650});
    room.sounds.push({id:++room.serial,kind:'pulse',x:beam.x,y:beam.y,z:beam.z,at:now});
  }
  room.skyBeams=room.skyBeams.filter(b=>b.until>now);
}
