import {angleDelta,stepCar,collideCars,resolveNudges,NEUTRAL} from './game.js';
// All cars advance on one timeline, using the actual replicated steering input.
// Linear extrapolation loses the turn rate and snaps back at every snapshot.
export function predictFleet(local,others,input,dt){
  const fleet=[local,...others],before=fleet.map(car=>({x:car.x,y:car.y,z:car.z,angle:car.angle,pitch:car.pitch||0,roll:car.roll||0,progress:car.progress||0}));
  for(const car of fleet)stepCar(car,car===local?input:car.input||NEUTRAL,dt);
  resolveNudges(fleet,{damage:false});
  collideCars(fleet,{road:true,damage:false});
  // Measure the final poses: nudges and contact resolution move the chassis too.
  // Their displacement must not alternate with motionless 120 Hz render frames.
  for(let i=0;i<fleet.length;i++){
    const car=fleet[i],old=before[i];car.renderVx=(car.x-old.x)/dt;car.renderVz=(car.z-old.z)/dt;
    car.renderTurn=angleDelta(car.angle,old.angle)/dt;car.renderRise=(car.y-old.y)/dt;
    car.renderPitch=((car.pitch||0)-old.pitch)/dt;car.renderRoll=((car.roll||0)-old.roll)/dt;
    car.renderProgress=((car.progress||0)-old.progress)/dt;
  }
}
