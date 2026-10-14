// Store contact offsets in chassis space so interpolated cars emit at their skin.
export function recordScrape(car,nx,nz,{x,z,speed}={}){
  const c=Math.cos(car.angle),s=Math.sin(car.angle),fx=nx*c+nz*s,fz=-nx*s+nz*c;
  if(x===undefined){
    const lx=Math.abs(fx)<1e-5?0:Math.sign(fx)*2.45,lz=Math.abs(fz)<1e-5?0:Math.sign(fz)*1.05;
    x=car.x+lx*c-lz*s;z=car.z+lx*s+lz*c;
  }
  speed??=Math.hypot(car.vx,car.vz);
  if(speed<2)return;
  const contact={x:(x-car.x)*c+(z-car.z)*s,z:-(x-car.x)*s+(z-car.z)*c,speed,remaining:.1};
  if(!car.scrape||car.scrape.speed<=speed)car.scrape=contact;
}
export function interruptPadBoost(car,impact){if(impact>1)car.padBoostRemaining=0;}
