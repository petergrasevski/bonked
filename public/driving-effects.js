import {bodyOffset,WHEEL_POINTS} from '../shared/edge-physics.js';
export function burnoutActive(car,phase,input=car.input){
  return phase==='countdown'&&!car.eliminated&&!car.wrecked&&!car.falling&&(input?.throttle||0)>.1&&!input?.reverse;
}
export function drivingEmitters(car,phase,input=car.input){
  const emitters=[];
  const add=(x,y,z,kind)=>{const p=bodyOffset(car,x,y,z);emitters.push({x:car.x+p.x,y:car.y+p.y,z:car.z+p.z,kind});};
  if(burnoutActive(car,phase,input))for(const [x,z]of WHEEL_POINTS.slice(0,2))add(x,.12,z,'burnout');
  if(phase==='racing'&&!car.eliminated&&car.scrape?.remaining>0)add(car.scrape.x,.45,car.scrape.z,'spark');
  return emitters;
}
