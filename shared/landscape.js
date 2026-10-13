import {createBeachBands} from './beach-profile.js';
import {DESERT_MOUNTAIN,DESERT_MOLE_ZONE} from './desert-features.js';
const tri=(v,a,b,c)=>v.push(...a,...b,...c);
const quad=(v,a,b,c,d)=>{tri(v,a,b,c);tri(v,a,c,d);};
const along=(p,offset,y=p.y)=>[p.x+p.nx*offset,y,p.z+p.nz*offset];
const contour=(a,seed)=>1+.045*Math.sin(a*3+seed)+.024*Math.cos(a*7-seed);
export const COASTAL_LAND=[{kind:'volcano',fraction:.175,radius:17},{kind:'geyser',fraction:.275,radius:11},{kind:'ruins',fraction:.50,radius:11},{kind:'waterfall',fraction:.75,radius:13}];
// A spatially indexed triangle surface is shared by renderer and simulation.
// Only terrain contact uses this grid; normal road driving does no mesh queries.
export class TerrainSurface {
  constructor(){this.cells=new Map();this.triangles=[];}
  add(vertices){
    for(let i=0;i<vertices.length;i+=9){
      const [ax,ay,az,bx,by,bz,cx,cy,cz]=vertices.slice(i,i+9),den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-8)continue;
      let nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay),ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az),nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);if(ny<0){nx=-nx;ny=-ny;nz=-nz;}const len=Math.hypot(nx,ny,nz);
      const t={ax,ay,az,bx,by,bz,cx,cy,cz,den,nx:nx/len,ny:ny/len,nz:nz/len},id=this.triangles.push(t)-1;
      for(let x=Math.floor(Math.min(ax,bx,cx)/12);x<=Math.floor(Math.max(ax,bx,cx)/12);x++)for(let z=Math.floor(Math.min(az,bz,cz)/12);z<=Math.floor(Math.max(az,bz,cz)/12);z++){const key=x+','+z;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(id);}
    }
  }
  sample(x,z,ceiling=Infinity){
    let best=null;for(const id of this.cells.get(Math.floor(x/12)+','+Math.floor(z/12))||[]){const t=this.triangles[id],a=((t.bz-t.cz)*(x-t.cx)+(t.cx-t.bx)*(z-t.cz))/t.den,b=((t.cz-t.az)*(x-t.cx)+(t.ax-t.cx)*(z-t.cz))/t.den,c=1-a-b;if(a< -1e-6||b< -1e-6||c< -1e-6)continue;const y=a*t.ay+b*t.by+c*t.cy;if(y<=ceiling&&(!best||y>best.y))best={y,nx:t.nx,ny:t.ny,nz:t.nz};}return best;
  }
}
function connectedLand(ctx,landmark){
  const {trackAt,nearestTrack}=ctx,road=trackAt(landmark.fraction),{radius}=landmark;let best;
  placement:for(const side of [1,-1])for(let d=road.halfWidth+radius+1.5;d<65;d+=3){const x=road.x+road.nx*d*side,z=road.z+road.nz*d*side,t=nearestTrack(x,z);if(t.distance-t.halfWidth>=radius+1){best={x,z,side};break placement;}}
  best??={x:road.x+road.nx*(road.halfWidth+radius+5),z:road.z+road.nz*(road.halfWidth+radius+5),side:1};
  const {x,z,side}=best,distance=Math.hypot(x-road.x,z-road.z),near=road.halfWidth+9,far=distance+radius+6,center=(far-near)/2,across=(far+near)/2,length=radius+22,seed=landmark.fraction*81;
  const point=(u,v)=>[road.x+Math.cos(road.angle)*u+road.nx*v*side,road.z+Math.sin(road.angle)*u+road.nz*v*side];
  const height=(u,v)=>{const a=Math.atan2((v-center)/across,u/length),r=Math.hypot(u/length,(v-center)/across)/contour(a,seed);if(r>1.07)return null;
    const rings=[[0,-.14],[.5,-.18],[.79,-.27],[.91,-.72],[1,-2.05],[1.07,-3.8]];let y=-3.8;for(let i=1;i<rings.length;i++)if(r<=rings[i][0]){const [ra,ya]=rings[i-1],[rb,yb]=rings[i];y=ya+(yb-ya)*(r-ra)/(rb-ra);break;}
    const [px,pz]=point(u,v),t=nearestTrack(px,pz),edge=Math.max(0,t.distance-t.halfWidth-.6);
    return Math.min(y,t.y-.18-Math.min(1.6,edge*1.8));
  };
  const bands=[[],[],[]],step=1.4,points=new Map();
  const cached=(u,v)=>{const key=u.toFixed(5)+','+v.toFixed(5);if(!points.has(key)){const h=height(u,v),[px,pz]=point(u,v);points.set(key,h===null?null:[px,h,pz]);}return points.get(key);};
  for(let u=-length*1.15;u<length*1.15;u+=step)for(let v=center-across*1.15;v<center+across*1.15;v+=step){
    const ps=[[u,v],[u+step,v],[u+step,v+step],[u,v+step]].map(([a,b])=>cached(a,b));
    for(const ids of [[0,1,2],[0,2,3]])if(ids.every(i=>ps[i])){const vertices=ids.map(i=>ps[i]),y=vertices.reduce((s,p)=>s+p[1],0)/3;tri(bands[y< -2?0:y< -1.7?1:2],...vertices);}
  }
  const shoreline=Array.from({length:64},(_,i)=>{const a=i/64*Math.PI*2,r=contour(a,seed),[px,pz]=point(Math.cos(a)*length*r,center+Math.sin(a)*across*r);return [px,-2.05,pz];});
  return {...landmark,...best,bands,shoreline,roadAnchor:{x:road.x,z:road.z},featureAnchor:{x,z}};
}
function beaches(ctx){return createBeachBands(ctx);}
function mountainTerrain(ctx,start,end,index){
  const {trackAt,nearestTrack,trackLength:TRACK_LENGTH}=ctx;
  // Bury both outer skirt rings below the -4m ground plane, including where
  // the road is level. A ring exactly at -4 creates a shallow, flickering seam.
  const outcrops=[],count=Math.ceil((end-start)*TRACK_LENGTH/4),bands=[[],[],[],[]],profiles=p=>[[p.halfWidth+.62,p.y-.20],[p.halfWidth+2.5,Math.max(-4.8,p.y-3.2)],[p.halfWidth+13,Math.max(-4.8,p.y*.65-3.2)],[p.halfWidth+24,Math.max(-4.8,p.y*.3-4.8)],[p.halfWidth+37,-4.8]];
  const point=(p,j,side,f)=>{const [offset,y]=profiles(p)[j],jitter=j<2?0:Math.sin(f*121+j*1.7)*.9+Math.cos(f*173-j)*.6;return along(p,(offset+jitter)*side,y);};
  for(let i=0;i<count;i++){
    const f=start+(end-start)*i/count,nf=start+(end-start)*(i+1)/count,p=trackAt(f),q=trackAt(nf);
    for(const side of [-1,1])for(let j=0;j<4;j++){const a=point(p,j,side,f),b=point(p,j+1,side,f),c=point(q,j+1,side,nf),d=point(q,j,side,nf);if(side===1)quad(bands[j],a,b,c,d);else quad(bands[j],a,d,c,b);}
  }
  // Canyon-facing cliff exposes layered strata under each end of the high bridge.
  for(const [f,sign]of [[start,-1],[end,1]]){
    const p=trackAt(f),cross=[...Array.from({length:5},(_,j)=>point(p,4-j,-1,f)),...Array.from({length:5},(_,j)=>point(p,j,1,f))];
    for(let i=0;i<cross.length-1;i++){
      const a=cross[i],b=cross[i+1];for(let k=0;k<4;k++){const t=k/4,nt=(k+1)/4,aa=[a[0],a[1]+(-4.8-a[1])*t,a[2]],bb=[b[0],b[1]+(-4.8-b[1])*t,b[2]],cc=[b[0],b[1]+(-4.8-b[1])*nt,b[2]],dd=[a[0],a[1]+(-4.8-a[1])*nt,a[2]];if(sign===1)quad(bands[k],aa,bb,cc,dd);else quad(bands[k],aa,dd,cc,bb);}
    }
  }

  // Tall stepped outcrops frame the climb without covering the road deck.
  for(const [f,side]of [[start+(end-start)*.42,1],[start+(end-start)*.72,-1]]){
    const p=trackAt(f),x=p.x+p.nx*(p.halfWidth+29)*side,z=p.z+p.nz*(p.halfWidth+29)*side,radius=22,height=Math.max(26,p.y+15),vertices=[[],[]],rings=[1,.82,.63,.46,.27,0],N=24;
    const at=(r,j)=>{const a=j/N*Math.PI*2,fold=1+.07*Math.sin(a*5+index)+.045*Math.cos(a*7-index),px=x+Math.cos(a)*r*radius*fold,pz=z+Math.sin(a)*r*radius*fold;let y=-4.8+Math.pow(1-r,.85)*(height+.8);const road=nearestTrack(px,pz);if(road.distance<road.halfWidth+1.5)y=Math.min(y,road.y-.3);return [px,y,pz];};
    for(let k=1;k<rings.length;k++)for(let j=0;j<N;j++)quad(vertices[k%2],at(rings[k-1],j),at(rings[k],j),at(rings[k],j+1),at(rings[k-1],j+1));
    outcrops.push(vertices);
  }
  return {bands,outcrops};
}

function molePlateau(ctx){
  const {trackAt,trackLength}=ctx,zone=DESERT_MOLE_ZONE,start=zone.center-(zone.length/2+zone.transition)/trackLength,end=zone.center+(zone.length/2+zone.transition)/trackLength,v=[];
  for(let i=0;i<100;i++){const p=trackAt(start+(end-start)*i/100),q=trackAt(start+(end-start)*(i+1)/100);for(const side of [-1,1]){const a=along(p,side*(p.halfWidth+.62),p.y-.20),b=along(p,side*(p.halfWidth+12),-4.8),c=along(q,side*(q.halfWidth+12),-4.8),d=along(q,side*(q.halfWidth+.62),q.y-.20);if(side===1)quad(v,a,b,c,d);else quad(v,a,d,c,b);}}
  return v;
}
export function createLandscape(ctx){
  const surface=new TerrainSurface(),result={surface,lands:[],beaches:[],mountains:[],plateau:[]};
  if(ctx.id==='coast'){result.lands=COASTAL_LAND.map(l=>connectedLand(ctx,l));result.beaches=beaches(ctx);for(const l of result.lands)for(const band of l.bands)surface.add(band);for(const band of result.beaches)surface.add(band);}
  if(ctx.id==='desert'){result.plateau=molePlateau(ctx);surface.add(result.plateau);const m=DESERT_MOUNTAIN;result.mountains=[mountainTerrain(ctx,m.start,m.ascentEnd,1),mountainTerrain(ctx,m.bridgeEnd,m.end,2)];for(const m of result.mountains){for(const b of m.bands)surface.add(b);for(const o of m.outcrops)for(const b of o)surface.add(b);}}
  return result;
}
