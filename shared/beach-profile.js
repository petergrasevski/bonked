import {isCoastalBeach} from './coastal-barriers.js';
// Shared between the visible coast, its collision mesh and the ocean swash.
// The bank meets the sandy road at its top, then curves down to the seabed.
export const BEACH_STEPS=12;
export const SEA_LEVEL=-2.1;
export function beachWidth(p){return 8.4+1.1*Math.sin(p.start*.071)+.65*Math.cos(p.start*.133);}
export function beachPoint(p,t,side){
  const offset=p.halfWidth+.59+beachWidth(p)*t;
  const drop=2.9*t*t*(3-2*t),shoulder=Math.min(1,t*3);
  // Feather the old 20cm step into the first third of dry sand. Keep the
  // lower bank and waterline unchanged, with zero added slope at both ends.
  const lift=.2*(1-shoulder*shoulder*(3-2*shoulder));
  return [p.x+p.nx*offset*side,p.y-.19-drop+lift,p.z+p.nz*offset*side];
}
export function beachSegments(ctx){
  const pairs=[];
  for(const side of [-1,1])for(let i=0;i<ctx.segments.length;i++){
    const a=ctx.segments[i],b=ctx.segments[(i+1)%ctx.segments.length];
    // Bumper openings on asphalt keep the sheer causeway edge; only the
    // original beach sections grow sand banks.
    if(isCoastalBeach((a.start+a.len*.5)/ctx.trackLength))pairs.push({a,b,side});
  }
  return pairs;
}
export function createBeachBands(ctx){
  const bands=[[],[]];
  for(const {a,b,side}of beachSegments(ctx))for(let j=0;j<BEACH_STEPS;j++){
    const t=j/BEACH_STEPS,nt=(j+1)/BEACH_STEPS;
    const points=[beachPoint(a,t,side),beachPoint(b,t,side),beachPoint(b,nt,side),beachPoint(a,nt,side)];
    const band=bands[j<8?0:1];for(const k of [0,1,2,0,2,3])band.push(...points[k]);
  }
  return bands;
}
// Intersect the actual piecewise-linear mesh rather than a different render-only
// spline, so foam and shallow water stay on the visible shoreline around corners.
export function beachShorePoint(p,side,y=SEA_LEVEL,surface=null){
  for(let j=0;j<BEACH_STEPS;j++){
    const a=beachPoint(p,j/BEACH_STEPS,side),b=beachPoint(p,(j+1)/BEACH_STEPS,side);
    if(a[1]>=y&&b[1]<=y){
      const t=(a[1]-y)/(a[1]-b[1]),point=a.map((v,k)=>v+(b[k]-v)*t);
      if(!surface)return point;
      // Inner hairpin banks can overlap. Follow the topmost collision surface
      // out to the water rather than drawing foam below the neighbouring bank.
      const sample=d=>surface.sample(point[0]+p.nx*d*side,point[2]+p.nz*d*side)?.y??(y-1);
      if(sample(0)<=y+1e-7)return point;
      let lo=0,hi=.25;while(hi<beachWidth(p)+2&&sample(hi)>y){lo=hi;hi+=.25;}
      if(hi>=beachWidth(p)+2)return null;
      for(let k=0;k<22;k++){const mid=(lo+hi)/2;if(sample(mid)>y)lo=mid;else hi=mid;}
      return [point[0]+p.nx*hi*side,y,point[2]+p.nz*hi*side];
    }
  }
  return null;
}
