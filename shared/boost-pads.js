import {DESERT_MOLE_ZONE,DESERT_NARROW} from './desert-features.js';
// Keep the boost burning after contact, but scale recovery thrust by retained energy.
export function softenPadBoostImpact(car,speedBefore,speedAfter){
  if(!(car.padBoostRemaining>0)||speedBefore<1||speedAfter>=speedBefore)return;
  const retained=Math.max(.1,Math.min(1,speedAfter/speedBefore));
  car.padBoostPower=Math.max(.1,(car.padBoostPower??1)*retained*retained);
}
export const PAD_RAMP=.4,PAD_DECAY=2,PAD_DURATION=PAD_RAMP+PAD_DECAY,PAD_COOLDOWN=1;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function boostSpeed(car,dt,topSpeed){
  if(!(car.padBoostRemaining>0))return null;
  car.padBoostRemaining=Math.max(0,car.padBoostRemaining-dt);
  car.padBoostPower=Math.min(1,(car.padBoostPower??1)+dt*.12);
  const age=PAD_DURATION-car.padBoostRemaining,peak=topSpeed*1.5;
  return age<=PAD_RAMP?car.padBoostFrom+(peak-car.padBoostFrom)*Math.min(1,age/PAD_RAMP):peak+(topSpeed-peak)*smooth((age-PAD_RAMP)/PAD_DECAY);
}
// Layout only; each room owns independent copies of the readyAt timestamps.
export function boostLayout({id,trackAt,nearestTrack,length,carWidth,obstacles=[],segments=[]}){
  const pads=[],width=carWidth*1.5,padLength=5,gap=width+.25;
  const add=(fraction,lateral)=>{const p=trackAt(fraction);if(Math.abs(lateral)+width/2>p.halfWidth-.15)return;const x=p.x+p.nx*lateral,z=p.z+p.nz*lateral;
    if(obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+4))return;
    const surface=padRoadTriangles(segments,fraction,length);
    pads.push({...p,y:samplePadRoad(surface,x,z)??p.y,surface,id:`${id}-boost-${pads.length}`,fraction,lateral,x,z,width,length:padLength,readyAt:0});};
  const row=f=>{const p=trackAt(f),count=Math.floor((p.halfWidth*2-.5)/gap);for(let i=0;i<count;i++)add(f,(i-(count-1)/2)*gap);};
  const pair=(f,side=1)=>{const p=trackAt(f);add(f,side*(p.halfWidth-width/2-.35));add(f,side*(p.halfWidth-width/2-.35-gap));};
  if(id==='coast'){
    // Find long, gently curving runs, excluding intersections with the plazas.
    const runs=[];let start=null;const step=5;
    for(let d=0;d<=length;d+=step){const a=trackAt((d-12)/length),b=trackAt((d+12)/length),angle=Math.abs(Math.atan2(Math.sin(b.angle-a.angle),Math.cos(b.angle-a.angle))),straight=d<length&&angle<.13;
      if(straight&&start===null)start=d;
      if(!straight&&start!==null){if(d-start>=85)runs.push([start,d]);start=null;}}
    runs.forEach(([a,b],i)=>{if(a+12>90)pair((a+12)/length,i%2?1:-1);pair((a+b)/2/length,i%2?1:-1);});
  }else if(id==='ice'){
    const fs=[[-152.4,-40],[152.4,-40],[152.4,40],[-152.4,40]].map(([x,z])=>nearestTrack(x,z).fraction);
    pair(fs[0],1);const p=trackAt(fs[1]);for(const side of [-1,1])add(fs[1],side*(p.halfWidth-width/2-.35));
    add(fs[2],-gap/2);add(fs[2],gap/2);row(fs[3]);
  }else if(id==='desert'){
    const zone=DESERT_MOLE_ZONE,start=zone.center-zone.length/2/length;
    for(const t of [.25,.5])for(const shift of [0,6,-6,10,-10]){const f=start+(zone.length*t+shift)/length,p=trackAt(f),before=pads.length;add(f,-p.halfWidth+width/2+.6);if(pads.length>before)break;}
    pair(.163,-1);pair(.19,1);pair(.377,-1);
    row((DESERT_NARROW.narrowStart+DESERT_NARROW.narrowEnd)/2);
  }
  return pads;
}
export function collectBoostPad(car,pads,raceTime,previous=car){
  if(car.eliminated||car.finished||car.falling||car.overturned||car.padBoostRemaining>0||car.boost>0)return null;
  for(const pad of pads){
    if(raceTime+1e-9<pad.readyAt)continue;
    const c=Math.cos(pad.angle),s=Math.sin(pad.angle),ox=previous.x-pad.x,oz=previous.z-pad.z,dx=car.x-previous.x,dz=car.z-previous.z;
    const interval=[0,1];let touches=true;
    // Swept tyre footprint catches pads at boosted speeds, but cannot collect
    // one on a different overpass deck or while flying above the road.
    for(const [origin,delta,half]of [[ox*c+oz*s,dx*c+dz*s,pad.length/2+1.45],[-ox*s+oz*c,-dx*s+dz*c,pad.width/2+.9]]){
      if(Math.abs(delta)<1e-9){if(Math.abs(origin)>half)touches=false;continue;}
      let a=(-half-origin)/delta,b=(half-origin)/delta;if(a>b)[a,b]=[b,a];interval[0]=Math.max(interval[0],a);interval[1]=Math.min(interval[1],b);
    }
    if(!touches||interval[0]>interval[1])continue;
    const t=interval[0],x=previous.x+dx*t,z=previous.z+dz*t,y=(previous.y??car.y)+(car.y-(previous.y??car.y))*t,roadY=samplePadRoad(pad.surface,x,z)??pad.y+((x-pad.x)*c+(z-pad.z)*s)*(pad.grade||0);
    if(Math.abs(y-roadY)>.55)continue;
    car.padBoostFrom=Math.max(0,car.vx*Math.cos(car.angle)+car.vz*Math.sin(car.angle));car.padBoostRemaining=PAD_DURATION;car.padBoostPower=1;pad.readyAt=raceTime+PAD_COOLDOWN;return pad;
  }
  return null;
}

export function boostExhaustStrength(remaining){
  if(!(remaining>0))return 0;
  return remaining>PAD_DECAY?.25+.75*Math.min(1,(PAD_DURATION-remaining)/PAD_RAMP):smooth(remaining/PAD_DECAY);
}

// Retain the actual road ribbon triangles around each pad. This keeps decals
// and pickup height checks on the same curved, sloped deck, even at overpasses.
export function padRoadTriangles(segments,fraction,length){
  const triangles=[];
  for(let i=0;i<segments.length;i++){
    const a=segments[i],b=segments[(i+1)%segments.length],distance=Math.abs(((a.start/length-fraction+1.5)%1)-.5)*length;
    if(distance>20+a.len)continue;
    const points=[[a.x-a.nx*a.halfWidth,a.y,a.z-a.nz*a.halfWidth],[a.x+a.nx*a.halfWidth,a.y,a.z+a.nz*a.halfWidth],[b.x-b.nx*b.halfWidth,b.y,b.z-b.nz*b.halfWidth],[b.x+b.nx*b.halfWidth,b.y,b.z+b.nz*b.halfWidth]];
    triangles.push([points[0],points[1],points[2]],[points[1],points[3],points[2]]);
  }
  return triangles;
}
export function samplePadRoad(triangles,x,z){
  for(const [a,b,c] of triangles||[]){
    const bx=b[0]-a[0],bz=b[2]-a[2],cx=c[0]-a[0],cz=c[2]-a[2],dx=x-a[0],dz=z-a[2],det=bx*cz-bz*cx;
    if(Math.abs(det)<1e-9)continue;
    const u=(dx*cz-dz*cx)/det,v=(bx*dz-bz*dx)/det;
    if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)return a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]);
  }
  return null;
}
