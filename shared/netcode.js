import {angleDelta,TRACK_LENGTH,trackAt} from './game.js';
const poseFields=['x','z','y','angle','pitch','roll','progress'];
const rateFields=['renderVx','renderVz','renderRise','renderTurn','renderPitch','renderRoll','renderProgress'];
function motionRates(car,retained){
  const rate=(key,fallback=0)=>car[key]??retained?.[key]??fallback;
  let progress=rate('renderProgress',null);
  if(progress===null){const road=Number.isFinite(car.trackFraction)?trackAt(car.trackFraction):null;progress=((car.vx||0)*(road?road.nz:Math.cos(car.angle))+(car.vz||0)*(road?-road.nx:Math.sin(car.angle)))/TRACK_LENGTH;}
  return {x:rate('renderVx',car.vx||0),z:rate('renderVz',car.vz||0),y:rate('renderRise',car.vy||0),angle:rate('renderTurn',car.yawVelocity||0),pitch:rate('renderPitch',car.pitchVelocity||0),roll:rate('renderRoll',car.rollVelocity||0),progress};
}
// Preserve displayed position AND velocity across authority corrections. A
// critically damped spring removes the error without a new speed kick at 20 Hz.
// Only visual offsets change: authoritative/predicted physics stays untouched.
export class RenderCorrections {
  constructor(){this.errors=new Map();this.velocities=new Map();this.rates=new Map();}
  reset(){this.errors.clear();this.velocities.clear();this.rates.clear();}
  reconcile(before,after,remainder=0){
    const old=new Map(before.map(p=>[p.id,p]));
    for(const car of after){
      const previous=old.get(car.id),e=this.errors.get(car.id)||{},velocity=this.velocities.get(car.id)||{},retained=this.rates.get(car.id);
      if(!previous||previous.eliminated!==car.eliminated||Math.hypot(previous.x-car.x,previous.z-car.z)>12||Math.abs((previous.progress||0)-(car.progress||0))*TRACK_LENGTH>12){this.errors.delete(car.id);this.velocities.delete(car.id);this.rates.delete(car.id);continue;}
      // A fully acknowledged snapshot may have no replay ticks. Retain measured
      // slope/rotation/progress rates until the next prediction tick.
      const rates={};for(const key of rateFields)rates[key]=car[key]??previous[key]??retained?.[key];
      const oldMotion=motionRates(previous,retained),newMotion=motionRates(car,rates),error={},nextVelocity={};
      for(const key of poseFields){
        const delta=['angle','pitch','roll'].includes(key)?angleDelta(previous[key]||0,car[key]||0):(previous[key]||0)-(car[key]||0),rateDelta=oldMotion[key]-newMotion[key];
        // Reconciliation can arrive halfway between ticks. Preserve that
        // fractional pose too, rather than jumping when derivatives change.
        error[key]=(e[key]||0)+delta+rateDelta*remainder;
        nextVelocity[key]=(velocity[key]||0)+rateDelta;
      }
      this.errors.set(car.id,error);this.velocities.set(car.id,nextVelocity);this.rates.set(car.id,rates);
    }
    for(const id of this.rates.keys())if(!after.some(p=>p.id===id)){this.errors.delete(id);this.velocities.delete(id);this.rates.delete(id);}
  }
  render(car,dt,remainder=0){
    const e=this.errors.get(car.id),velocity=this.velocities.get(car.id),omega=18,decay=Math.exp(-dt*omega);
    if(e)for(const key of poseFields){
      const x=e[key]||0,v=velocity?.[key]||0,c=v+omega*x;
      e[key]=(x+c*dt)*decay;if(velocity)velocity[key]=(v-omega*c*dt)*decay;
    }
    const motion=motionRates(car,this.rates.get(car.id)),pose={...car};
    // Progress drives the camera: use the same smoothing clock as the chassis.
    for(const key of poseFields)pose[key]=(car[key]||0)+(e?.[key]||0)+motion[key]*remainder;
    return pose;
  }
}
