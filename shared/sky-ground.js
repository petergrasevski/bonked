import {activeTrack,SEGMENTS,TRACK_LENGTH,iceSplit,getLandscape} from './game.js';
import {TerrainSurface} from './landscape.js';
import {desertRampLift} from './desert-features.js';
const cache=new Map();
export const skyFloor=()=>activeTrack.id==='coast'?-2.05:activeTrack.id==='factory'?-8:-4;
// Reuse the terrain's spatial index; index road decks once per circuit too.
export function skySurfaces(){
  if(!cache.has(activeTrack.id)){
    const road=new TerrainSurface(),vertices=[];
    for(let i=0;i<SEGMENTS.length;i++){
      const a=SEGMENTS[i],b=SEGMENTS[(i+1)%SEGMENTS.length];
      const at=(p,offset)=>[p.x+p.nx*offset,p.y+(activeTrack.id==='desert'?desertRampLift(p.start/TRACK_LENGTH,TRACK_LENGTH):0),p.z+p.nz*offset];
      for(const side of [-1,1]){const p=at(a,side*iceSplit(a.x)),q=at(a,side*(a.halfWidth+.6)),s=at(b,side*iceSplit(b.x)),t=at(b,side*(b.halfWidth+.6));vertices.push(...p,...q,...s,...q,...t,...s);}
    }
    road.add(vertices);cache.set(activeTrack.id,[road,getLandscape().surface]);
  }
  return cache.get(activeTrack.id);
}
export function skyGroundAt(x,z){
  let ground={y:skyFloor(),nx:0,ny:1,nz:0};
  for(const surface of skySurfaces()){const hit=surface.sample(x,z);if(hit&&hit.y>ground.y)ground=hit;}
  return ground;
}
function triangleHit(t,x,z){
  const a=((t.bz-t.cz)*(x-t.cx)+(t.cx-t.bx)*(z-t.cz))/t.den,b=((t.cz-t.az)*(x-t.cx)+(t.ax-t.cx)*(z-t.cz))/t.den;
  return a>=-1e-6&&b>=-1e-6&&a+b<=1+1e-6;
}
// Traverse 12m terrain cells, not scene meshes. Only the local spectator casts.
export function skyRayGround(origin,direction){
  if(direction.y>=-.001)return null;
  let best=(skyFloor()-origin.y)/direction.y;if(best<0||best>2500)best=2500;
  let x=Math.floor(origin.x/12),z=Math.floor(origin.z/12),t=0;
  const sx=Math.sign(direction.x),sz=Math.sign(direction.z),dx=sx?12/Math.abs(direction.x):Infinity,dz=sz?12/Math.abs(direction.z):Infinity;
  let tx=sx?((x+(sx>0?1:0))*12-origin.x)/direction.x:Infinity,tz=sz?((z+(sz>0?1:0))*12-origin.z)/direction.z:Infinity;
  const surfaces=skySurfaces();
  for(let cell=0;cell<500&&t<=best;cell++){
    for(const surface of surfaces)for(const id of surface.cells.get(x+','+z)||[]){const tri=surface.triangles[id],den=tri.nx*direction.x+tri.ny*direction.y+tri.nz*direction.z;if(Math.abs(den)<1e-8)continue;
      const hit=(tri.nx*(tri.ax-origin.x)+tri.ny*(tri.ay-origin.y)+tri.nz*(tri.az-origin.z))/den;
      if(hit>=0&&hit<best&&triangleHit(tri,origin.x+direction.x*hit,origin.z+direction.z*hit))best=hit;
    }
    if(tx<tz){t=tx;tx+=dx;x+=sx;}else{t=tz;tz+=dz;z+=sz;}
  }
  const px=origin.x+direction.x*best,pz=origin.z+direction.z*best;return {x:px,y:skyGroundAt(px,pz).y,z:pz};
}
export function skyPatch(x,z){
  const cx=Math.floor(x/12),cz=Math.floor(z/12),vertices=[],y=skyFloor()+.065;
  for(const surface of skySurfaces()){
    const seen=new Set();for(let a=cx-1;a<=cx+1;a++)for(let b=cz-1;b<=cz+1;b++)for(const id of surface.cells.get(a+','+b)||[]){if(seen.has(id))continue;seen.add(id);const t=surface.triangles[id];vertices.push(t.ax,t.ay+.065,t.az,t.bx,t.by+.065,t.bz,t.cx,t.cy+.065,t.cz);}
  }
  const l=(cx-1)*12,r=(cx+2)*12,b=(cz-1)*12,t=(cz+2)*12;vertices.push(l,y,b,r,y,b,l,y,t,r,y,b,r,y,t,l,y,t);return vertices;
}
