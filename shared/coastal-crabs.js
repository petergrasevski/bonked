// Authored beach openings and deterministic kinematic hazards. Cars never write
// to crab state: the server, prediction and renderer sample the same race clock.
export const COAST_BEACH_SECTIONS=Object.freeze([3,8,14,19]);
export const CRAB_PERIOD=6,CRAB_CROSSING_SECONDS=1;
export function coastalCrabs(trackAt){
  return COAST_BEACH_SECTIONS.flatMap((section,beach)=>[.3,.5,.7].map((offset,index)=>{
    const fraction=(section+offset)/24,p=trackAt(fraction);
    return {id:`beach-crab-${beach}-${index}`,fraction,...p,radius:1.35,height:1.5,phase:beach*1.37+index*2,side:index%2?1:-1};
  }));
}
export function crabState(crab,seconds=0){
  const t=Math.max(0,Number.isFinite(seconds)?seconds:0)+crab.phase,cycle=Math.floor(t/CRAB_PERIOD),age=t-cycle*CRAB_PERIOD;
  const speed=2*(crab.halfWidth+crab.radius)/CRAB_CROSSING_SECONDS,approach=6/speed,duration=CRAB_CROSSING_SECONDS+2*approach;
  const side=crab.side*(cycle%2?-1:1),moving=age<duration;
  const lateral=side*(crab.halfWidth+crab.radius+6-speed*Math.min(age,duration));
  const shore=Math.max(0,Math.abs(lateral)-crab.halfWidth-crab.radius)/6;
  return {x:crab.x+crab.nx*lateral,z:crab.z+crab.nz*lateral,y:crab.y-shore*1.8,angle:crab.angle,
    vx:moving?-side*crab.nx*speed:0,vz:moving?-side*crab.nz*speed:0,moving,visible:moving,age,side};
}
export function collideCrabs(car,crabs,seconds,{length=4.9,width=2.1}={}){
  if(car.falling||car.finished||car.eliminated)return;
  const c=Math.cos(car.angle),s=Math.sin(car.angle);
  for(const crab of crabs){
    const pose=crabState(crab,seconds);
    if(!pose.moving||car.y>pose.y+crab.height||car.y+1.4<pose.y||Math.hypot(car.x-pose.x,car.z-pose.z)>crab.radius+length)continue;
    const ox=(pose.x-car.x)*c+(pose.z-car.z)*s,oz=-(pose.x-car.x)*s+(pose.z-car.z)*c;
    const qx=Math.max(-length/2,Math.min(length/2,ox)),qz=Math.max(-width/2,Math.min(width/2,oz));
    let dx=qx-ox,dz=qz-oz,d=Math.hypot(dx,dz),depth=crab.radius-d;
    if(depth<=0)continue;
    if(d<1e-6){const ex=length/2-Math.abs(ox),ez=width/2-Math.abs(oz);if(ex<ez){dx=ox>0?-1:1;dz=0;depth=crab.radius+ex;}else{dx=0;dz=oz>0?-1:1;depth=crab.radius+ez;}d=1;}
    const nx=(dx*c-dz*s)/d,nz=(dx*s+dz*c)/d;
    car.x+=nx*(depth+.002);car.z+=nz*(depth+.002);
    // Infinite-mass moving surface: transfer its velocity along the contact
    // normal, while preserving the car's tangential motion. No health damage.
    const impact=-((car.vx-pose.vx)*nx+(car.vz-pose.vz)*nz);
    if(impact>0){car.vx+=nx*impact;car.vz+=nz*impact;car.impactTime=Math.max(car.impactTime||0,.25);}
  }
}
