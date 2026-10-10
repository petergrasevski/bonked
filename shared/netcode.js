import {angleDelta} from './game.js';
// Preserve the displayed pose when authority corrects a prediction. Decay only
// the visual error; never feed it back into authoritative/predicted physics.
export class RenderCorrections {
  constructor(){this.errors=new Map();}
  reset(){this.errors.clear();}
  reconcile(before,after){
    const old=new Map(before.map(p=>[p.id,p]));
    for(const car of after){
      const previous=old.get(car.id),e=this.errors.get(car.id)||{x:0,z:0,y:0,angle:0};
      if(!previous||previous.eliminated!==car.eliminated||Math.hypot(previous.x-car.x,previous.z-car.z)>12){this.errors.delete(car.id);continue;}
      this.errors.set(car.id,{x:e.x+previous.x-car.x,z:e.z+previous.z-car.z,y:e.y+(previous.y||0)-(car.y||0),angle:e.angle+angleDelta(previous.angle,car.angle)});
    }
    for(const id of this.errors.keys())if(!after.some(p=>p.id===id))this.errors.delete(id);
  }
  render(car,dt,remainder=0){
    const e=this.errors.get(car.id),decay=Math.exp(-dt*10);
    if(e)for(const key of ['x','z','y','angle'])e[key]*=decay;
    // Fractional tick motion keeps 90/120Hz displays from repeating a 60Hz pose.
    return {...car,x:car.x+(e?.x||0)+car.vx*remainder,z:car.z+(e?.z||0)+car.vz*remainder,y:(car.y||0)+(e?.y||0)+(car.renderRise||0)*remainder,angle:car.angle+(e?.angle||0)+(car.renderTurn??car.yawVelocity??0)*remainder};
  }
}
