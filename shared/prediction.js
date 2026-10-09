import {stepCar,collideCars,constrainRoad} from './game.js';
// Predict every chassis on the same tick. Mixing a current local car with
// remote cars rendered 90ms in the past can visually swallow an entire bumper.
export function predictFleet(local,others,input,dt){
  stepCar(local,input,dt);
  for(const car of others){
    if(car.eliminated&&!car.wrecked)continue;
    car.x+=car.vx*dt;car.z+=car.vz*dt;car.angle+=(car.yawVelocity||0)*dt;
    if(car.y>0||car.vy>0){car.vy-=22*dt;car.y=Math.max(0,car.y+car.vy*dt);car.roll+=car.rollVelocity*dt;car.pitch+=car.pitchVelocity*dt;}
    constrainRoad(car);
  }
  collideCars([local,...others],{road:true,damage:false});
}
