import {activeTrack,trackAt,TRACK_LENGTH,getLandscape,volcanoRecoverableAt} from './game.js';
import {VOLCANO_RUNOFFS} from './volcano-terrain.js';

// Trace the first unsafe point outward from the road, using the authoritative
// recovery predicate. This follows both the outer lip and the tapered ends of
// each usable shelf; decorative plants never enter the collision index.
export function volcanoRecoveryBoundary(spacing=1.25){
  if(activeTrack.id!=='volcano')return [];
  const surface=getLandscape().surface,points=[];
  for(const center of VOLCANO_RUNOFFS){
    const count=Math.ceil(.13*TRACK_LENGTH/spacing);
    for(let i=0;i<=count;i++){
      const fraction=center-.065+.13*i/count,p=trackAt(fraction);
      const at=extra=>{const offset=p.halfWidth+extra,x=p.x-p.nx*offset,z=p.z-p.nz*offset,s=surface.sample(x,z);return s?{x,z,y:s.y,trackFraction:fraction}:null;};
      const safe=extra=>{const car=at(extra);return car&&volcanoRecoverableAt(car);};
      let lo=.45,hi=.75;
      while(hi<45&&safe(hi)){lo=hi;hi+=.5;}
      if(hi>=45)continue;
      for(let j=0;j<9;j++){const mid=(lo+hi)/2;if(safe(mid))lo=mid;else hi=mid;}
      if(lo<1.5)continue;
      const car=at((lo+hi)/2);if(car)points.push({...car,extra:(lo+hi)/2,nx:-p.nx,nz:-p.nz});
    }
  }
  const filled=[];
  const at=(fraction,extra)=>{const p=trackAt(fraction),x=p.x-p.nx*(p.halfWidth+extra),z=p.z-p.nz*(p.halfWidth+extra),hit=surface.sample(x,z);return hit?{x,z,y:hit.y,trackFraction:fraction,extra,nx:-p.nx,nz:-p.nz}:null;};
  for(const p of points){
    const previous=filled.at(-1);
    if(previous&&p.trackFraction-previous.trackFraction<.005){
      const steps=Math.ceil(Math.hypot(p.x-previous.x,p.z-previous.z)/spacing);
      // Cross-section slopes can change sharply at triangle boundaries. Trace
      // those connecting edges along the track too, rather than leaving gaps.
      for(let j=1;j<steps;j++){
        const extra=previous.extra+(p.extra-previous.extra)*j/steps;
        let lo=previous.trackFraction,hi=p.trackFraction;
        const first=at(lo,extra),last=at(hi,extra);
        if(!first||!last)continue;
        const startsSafe=volcanoRecoverableAt(first);
        if(startsSafe===volcanoRecoverableAt(last))continue;
        for(let k=0;k<12;k++){const mid=(lo+hi)/2,point=at(mid,extra);if(point&&volcanoRecoverableAt(point)===startsSafe)lo=mid;else hi=mid;}
        const point=at((lo+hi)/2,extra);if(point)filled.push(point);
      }
    }
    filled.push(p);
  }
  return filled;
}

// Stable variation keeps reloads identical and avoids an evenly spaced hedge.
export function volcanoShrubStyle(index){
  let seed=(index+1)*2654435761>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  return {kind:Math.floor(random()*3),height:.7+random()*1.05,width:.85+random()*1.1,angle:random()*Math.PI*2,color:Math.floor(random()*5),clusters:4+Math.floor(random()*4),seed:random()};
}
