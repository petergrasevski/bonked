// One deterministic weather clock per race, used by the server and prediction.
export const STORM_DELAY=15,STORM_DURATION=28,STORM_CLEAR=45,STORM_PERIOD=STORM_DURATION+STORM_CLEAR;
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
export function desertStormAt(seconds){
  const time=Math.max(0,Number.isFinite(seconds)?seconds:0)-STORM_DELAY;
  if(time<0)return {active:false,strength:0,x:-360,z:0,rx:220,rz:150,age:0,cycle:0};
  const cycle=Math.floor(time/STORM_PERIOD),age=time-cycle*STORM_PERIOD,active=age<STORM_DURATION;
  const direction=cycle%2?-1:1;
  return {active,age,cycle,rx:220,rz:150,x:direction*(-340+680*Math.min(1,age/STORM_DURATION)),z:Math.sin(age*.19+cycle*1.7)*55,
    strength:active?smooth(age/2)*smooth((STORM_DURATION-age)/2):0};
}
export function stormCoverage(storm,x,z){
  if(!storm.active)return 0;
  const distance=Math.hypot((x-storm.x)/storm.rx,(z-storm.z)/storm.rz);
  return storm.strength*(1-smooth((distance-.55)/.45));
}
export function stormGustAt(seconds,x,z,angle=0){
  const storm=desertStormAt(seconds),coverage=stormCoverage(storm,x,z),pulse=storm.age%3;
  if(!coverage||pulse>=1)return {x:0,z:0,strength:0};
  // One-second gusts, with two seconds to recover. Smooth edges prevent kicks.
  const envelope=smooth(pulse/.18)*smooth((1-pulse)/.22),kind=(Math.floor(storm.age/3)+storm.cycle)%3;
  const direction=angle+(kind===2?Math.PI:kind===0?Math.PI/2:-Math.PI/2),force=(kind===2?24:18)*coverage*envelope;
  return {x:Math.cos(direction)*force,z:Math.sin(direction)*force,strength:coverage*envelope};
}
export function applyDesertWind(car,seconds,dt){
  if(car.eliminated||car.finished||car.falling||car.overturned)return;
  const wind=stormGustAt(seconds,car.x,car.z,car.angle);
  car.vx+=wind.x*dt;car.vz+=wind.z*dt;
}
