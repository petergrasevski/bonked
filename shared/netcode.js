import {angleDelta,TRACK_LENGTH,trackAt} from './game.js';
const poseFields=['x','z','y','angle','pitch','roll','progress'];
const rateFields=['renderVx','renderVz','renderRise','renderTurn','renderPitch','renderRoll','renderProgress'];
// Preserve the displayed pose when authority corrects a prediction. Decay only
// the visual error; never feed it back into authoritative/predicted physics.
export class RenderCorrections {
  constructor(){this.errors=new Map();this.rates=new Map();}
  reset(){this.errors.clear();this.rates.clear();}
  reconcile(before,after){
    const old=new Map(before.map(p=>[p.id,p]));
    for(const car of after){
      const previous=old.get(car.id),e=this.errors.get(car.id)||{};
      if(!previous||previous.eliminated!==car.eliminated||Math.hypot(previous.x-car.x,previous.z-car.z)>12||Math.abs((previous.progress||0)-(car.progress||0))*TRACK_LENGTH>12){this.errors.delete(car.id);this.rates.delete(car.id);continue;}
      const error={};for(const key of poseFields){const delta=['angle','pitch','roll'].includes(key)?angleDelta(previous[key]||0,car[key]||0):(previous[key]||0)-(car[key]||0);error[key]=(e[key]||0)+delta;}
      this.errors.set(car.id,error);
      // A fully acknowledged snapshot may have no replay ticks. Retain the last
      // measured derivatives until the next simulation tick instead of dropping
      // climb/rotation/progress interpolation to zero for one display frame.
      const rates={};for(const key of rateFields)rates[key]=car[key]??previous[key]??this.rates.get(car.id)?.[key];this.rates.set(car.id,rates);
    }
    for(const id of this.errors.keys())if(!after.some(p=>p.id===id)){this.errors.delete(id);this.rates.delete(id);}
  }
  render(car,dt,remainder=0){
    const e=this.errors.get(car.id),decay=Math.exp(-dt*10),retained=this.rates.get(car.id);
    if(e)for(const key of poseFields)e[key]*=decay;
    const rate=(key,fallback=0)=>car[key]??retained?.[key]??fallback;
    let progressRate=rate('renderProgress',null);
    if(progressRate===null){const road=Number.isFinite(car.trackFraction)?trackAt(car.trackFraction):null;progressRate=((car.vx||0)*(road?road.nz:Math.cos(car.angle))+(car.vz||0)*(road?-road.nx:Math.sin(car.angle)))/TRACK_LENGTH;}
    // The camera is driven by progress, so it needs the same corrections and
    // fractional tick motion as the visible chassis, including slope rotations.
    return {...car,
      x:car.x+(e?.x||0)+rate('renderVx',car.vx||0)*remainder,
      z:car.z+(e?.z||0)+rate('renderVz',car.vz||0)*remainder,
      y:(car.y||0)+(e?.y||0)+rate('renderRise',car.vy||0)*remainder,
      angle:car.angle+(e?.angle||0)+rate('renderTurn',car.yawVelocity||0)*remainder,
      pitch:(car.pitch||0)+(e?.pitch||0)+rate('renderPitch',car.pitchVelocity||0)*remainder,
      roll:(car.roll||0)+(e?.roll||0)+rate('renderRoll',car.rollVelocity||0)*remainder,
      progress:(car.progress||0)+(e?.progress||0)+progressRate*remainder};
  }
}
