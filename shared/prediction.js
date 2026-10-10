import {angleDelta,stepCar,collideCars,resolveNudges,NEUTRAL} from './game.js';
// All cars advance on one timeline, using the actual replicated steering input.
// Linear extrapolation loses the turn rate and snaps back at every snapshot.
export function predictFleet(local,others,input,dt){
  for(const car of [local,...others]){
    const angle=car.angle,y=car.y;stepCar(car,car===local?input:car.input||NEUTRAL,dt);
    car.renderTurn=angleDelta(car.angle,angle)/dt;car.renderRise=(car.y-y)/dt;
  }
  resolveNudges([local,...others],{damage:false});
  collideCars([local,...others],{road:true,damage:false});
}
