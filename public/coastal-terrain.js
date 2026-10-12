import * as THREE from 'three';
import {trackAt,TRACK_LENGTH,SEGMENTS,hasBarrier,activeTrack} from '../shared/game.js';
const TAU=Math.PI*2;
function geometry(v){
  // Inner banks can fold tightly around hairpins; keep their exposed faces upward.
  for(let i=0;i<v.length;i+=9){const ax=v[i+3]-v[i],az=v[i+5]-v[i+2],bx=v[i+6]-v[i],bz=v[i+8]-v[i+2];if(az*bx-ax*bz<0)for(let k=0;k<3;k++){const tmp=v[i+3+k];v[i+3+k]=v[i+6+k];v[i+6+k]=tmp;}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));const uv=[];for(let i=0;i<v.length;i+=3)uv.push(v[i]/7,v[i+2]/7);g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;}
function quad(v,a,b,c,d){v.push(...a,...b,...c,...a,...c,...d);}
const contour=(a,seed)=>1+.045*Math.sin(a*3+seed)+.024*Math.cos(a*7-seed);
export function connectedLandGeometry(fraction,x,z,radius){
  const road=trackAt(fraction),side=((x-road.x)*road.nx+(z-road.z)*road.nz)>0?1:-1;
  const distance=Math.hypot(x-road.x,z-road.z),near=road.halfWidth+9,far=distance+radius+6;
  const center=(far-near)/2,across=(far+near)/2,along=radius+22,seed=fraction*81;
  const point=(a,r,y)=>{const s=contour(a,seed),u=Math.cos(a)*along*r*s,v=(center+Math.sin(a)*across*r*s)*side;return [road.x+Math.cos(road.angle)*u+road.nx*v,y,road.z+Math.sin(road.angle)*u+road.nz*v];};
  const levels=[[[1.07,-3.8],[1,-2.05],[.91,-.72]],[[.91,-.72],[.79,-.27]],[[.79,-.27],[.5,-.18],[0,-.14]]];
  const bands=levels.map(rings=>{const v=[];for(let k=1;k<rings.length;k++)for(let i=0;i<64;i++){const a=i/64*TAU,b=(i+1)/64*TAU,[ra,ya]=rings[k-1],[rb,yb]=rings[k];const points=[point(a,ra,ya),point(a,rb,yb),point(b,rb,yb),point(b,ra,ya)];if(side>0)quad(v,...points);else quad(v,points[0],points[3],points[2],points[1]);}return geometry(v);});
  return {bands,shoreline:Array.from({length:64},(_,i)=>point(i/64*TAU,1,-2.05)),roadAnchor:{x:road.x,z:road.z},featureAnchor:{x,z},radius};
}
export function addConnectedLand(w,landmark,x,z,radius){
  const land=connectedLandGeometry(landmark.fraction,x,z,radius);
  const colors=landmark.kind==='volcano'?[0x443f42,0x736957,0x625c51]:[0x777568,0x938d7c,0x89956a];
  land.bands.forEach((geo,i)=>{const mesh=w.mesh(geo,colors[i]);mesh.userData.sceneryKind='connected-land';mesh.userData.landmark=landmark.kind;});
  const {bands,...description}=land;(w.coastalLandforms??=[]).push({kind:landmark.kind,...description});return land;
}
export function buildCoastalBeaches(w){
  if(activeTrack.id!=='coast')return;
  const bands=[[],[]];
  for(const side of [-1,1])for(let i=0;i<SEGMENTS.length;i++){
    const a=SEGMENTS[i],b=SEGMENTS[(i+1)%SEGMENTS.length];if(hasBarrier((a.start+a.len*.5)/TRACK_LENGTH,side))continue;
    const point=(p,t)=>{const width=5.5+1.1*Math.sin(p.start*.071)+.65*Math.cos(p.start*.133),offset=p.halfWidth+.59+width*t;return [p.x+p.nx*offset*side,p.y-.19-2.9*Math.pow(t,.8),p.z+p.nz*offset*side];};
    for(const [band,lo,hi]of [[0,0,.42],[1,.42,1]]){const points=[point(a,lo),point(b,lo),point(b,hi),point(a,hi)];if(side>0)quad(bands[band],points[0],points[3],points[2],points[1]);else quad(bands[band],...points);}
  }
  bands.forEach((v,i)=>{const mesh=w.mesh(geometry(v),i?0x736957:0x938d7c);mesh.userData.sceneryKind='coastal-beach';});
}
