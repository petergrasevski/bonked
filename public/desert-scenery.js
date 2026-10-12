import * as THREE from 'three';
import {trackAt,nearestTrack,TRACK_LENGTH} from '../shared/game.js';
import {DESERT_JUMPS,DESERT_MOUNTAIN,DESERT_MOLE_ZONE} from '../shared/desert-features.js';
const PALETTE={sand:0xdcb76d,stone:0xa66542,light:0xe6b478,clay:0xb97c51,rust:0xd79760,steel:0x4b4440,dark:0x47392d,yellow:0xf9d366};
const tri=(v,a,b,c)=>v.push(...a,...b,...c);
const quad=(v,a,b,c,d)=>{tri(v,a,b,c);tri(v,a,c,d);};
function geometry(vertices){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const uv=[];for(let i=0;i<vertices.length;i+=3)uv.push((vertices[i]+vertices[i+2])/12,vertices[i+1]/5);g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;}
function taggedGroup(w,kind){const g=new THREE.Group();g.userData.sceneryKind=kind;w.static.add(g);return g;}
function segment(w,a,b,r,color,parent=w.static){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),mid=va.clone().add(vb).multiplyScalar(.5),m=w.mesh(new THREE.CylinderGeometry(r,r,va.distanceTo(vb),6),color,mid.x,mid.y,mid.z,parent);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vb.sub(va).normalize());return m;}
const along=(p,offset,y=p.y)=>[p.x+p.nx*offset,y,p.z+p.nz*offset];
function mountainside(w,start,end,index){
  const g=taggedGroup(w,'desert-mountain'),count=Math.ceil((end-start)*TRACK_LENGTH/4),bands=[[],[],[],[]],profiles=p=>[[p.halfWidth+.62,p.y-.20],[p.halfWidth+4,p.y-.75],[p.halfWidth+13,p.y*.72-1.3],[p.halfWidth+24,p.y*.3-3],[p.halfWidth+37,-4.12]];
  const point=(p,j,side,f)=>{const [offset,y]=profiles(p)[j],jitter=j<2?0:Math.sin(f*121+j*1.7)*.9+Math.cos(f*173-j)*.6;return along(p,(offset+jitter)*side,y);};
  for(let i=0;i<count;i++){
    const f=start+(end-start)*i/count,nf=start+(end-start)*(i+1)/count,p=trackAt(f),q=trackAt(nf);
    for(const side of [-1,1])for(let j=0;j<4;j++){const a=point(p,j,side,f),b=point(p,j+1,side,f),c=point(q,j+1,side,nf),d=point(q,j,side,nf);if(side===1)quad(bands[j],a,b,c,d);else quad(bands[j],a,d,c,b);}
  }
  // Canyon-facing cliff exposes layered strata under each end of the high bridge.
  for(const [f,sign]of [[start,-1],[end,1]]){
    const p=trackAt(f),cross=[...Array.from({length:5},(_,j)=>point(p,4-j,-1,f)),...Array.from({length:5},(_,j)=>point(p,j,1,f))];
    for(let i=0;i<cross.length-1;i++){
      const a=cross[i],b=cross[i+1];for(let k=0;k<4;k++){const t=k/4,nt=(k+1)/4,aa=[a[0],a[1]+(-4.12-a[1])*t,a[2]],bb=[b[0],b[1]+(-4.12-b[1])*t,b[2]],cc=[b[0],b[1]+(-4.12-b[1])*nt,b[2]],dd=[a[0],a[1]+(-4.12-a[1])*nt,a[2]];if(sign===1)quad(bands[k],aa,bb,cc,dd);else quad(bands[k],aa,dd,cc,bb);}
    }
  }
  for(let j=0;j<4;j++)w.mesh(geometry(bands[j]),[PALETTE.light,PALETTE.stone,PALETTE.rust,PALETTE.clay][j],0,0,0,g);
  // Tall stepped outcrops frame the climb without covering the road deck.
  for(const [f,side]of [[start+(end-start)*.42,1],[start+(end-start)*.72,-1]]){
    const p=trackAt(f),x=p.x+p.nx*(p.halfWidth+29)*side,z=p.z+p.nz*(p.halfWidth+29)*side,radius=22,height=Math.max(26,p.y+15),vertices=[[],[]],rings=[1,.82,.63,.46,.27,0],N=24;
    const at=(r,j)=>{const a=j/N*Math.PI*2,fold=1+.07*Math.sin(a*5+index)+.045*Math.cos(a*7-index),px=x+Math.cos(a)*r*radius*fold,pz=z+Math.sin(a)*r*radius*fold;let y=-4+Math.pow(1-r,.85)*height;const road=nearestTrack(px,pz);if(road.distance<road.halfWidth+1.5)y=Math.min(y,road.y-.3);return [px,y,pz];};
    for(let k=1;k<rings.length;k++)for(let j=0;j<N;j++)quad(vertices[k%2],at(rings[k-1],j),at(rings[k],j),at(rings[k],j+1),at(rings[k-1],j+1));
    for(let j=0;j<2;j++)w.mesh(geometry(vertices[j]),j?PALETTE.light:PALETTE.stone,0,0,0,g);
  }
  return g;
}
function highBridge(w){
  const {ascentEnd:start,bridgeEnd:end}=DESERT_MOUNTAIN,g=taggedGroup(w,'desert-high-bridge'),count=24,deck=[];
  for(let i=0;i<count;i++){
    const f=start+(end-start)*i/count,nf=start+(end-start)*(i+1)/count,p=trackAt(f),q=trackAt(nf),a=along(p,-p.halfWidth-.7,p.y-.34),b=along(p,p.halfWidth+.7,p.y-.34),c=along(q,q.halfWidth+.7,q.y-.34),d=along(q,-q.halfWidth-.7,q.y-.34);quad(deck,a,b,c,d);
    for(const side of [-1,1]){
      const offset=side*(p.halfWidth+.9),next=side*(q.halfWidth+.9),top=along(p,offset,p.y-.5),ntop=along(q,next,q.y-.5),bottom=along(p,offset,p.y-3.4),nbottom=along(q,next,q.y-3.4);
      segment(w,top,ntop,.20,PALETTE.steel,g);segment(w,bottom,nbottom,.18,PALETTE.steel,g);segment(w,i%2?top:bottom,i%2?nbottom:ntop,.13,PALETTE.rust,g);
    }
  }
  w.mesh(geometry(deck),PALETTE.steel,0,0,0,g);
  const towerFractions=[start+.008,end-.008];
  for(const f of towerFractions){const p=trackAt(f);for(const side of [-1,1]){const foot=along(p,side*(p.halfWidth+1.3),-4),top=along(p,side*(p.halfWidth+1.3),p.y+10);segment(w,foot,top,.52,PALETTE.rust,g);w.box(top[0],top[1]+.18,top[2],1.3,.45,1.3,PALETTE.light,g);}segment(w,along(p,-p.halfWidth-1.3,p.y+8.6),along(p,p.halfWidth+1.3,p.y+8.6),.32,PALETTE.steel,g);}
  // Cable sag and closely spaced droppers make the long, open span recognizable.
  for(const side of [-1,1])for(let i=0;i<40;i++){
    const t=i/40,nt=(i+1)/40,f=towerFractions[0]+(towerFractions[1]-towerFractions[0])*t,nf=towerFractions[0]+(towerFractions[1]-towerFractions[0])*nt,p=trackAt(f),q=trackAt(nf),cable=along(p,side*(p.halfWidth+1.3),p.y+10-7.7*Math.sin(t*Math.PI)),next=along(q,side*(q.halfWidth+1.3),q.y+10-7.7*Math.sin(nt*Math.PI));
    segment(w,cable,next,.12,PALETTE.dark,g);if(i%2===0)segment(w,cable,along(p,side*(p.halfWidth+1.3),p.y+.55),.055,PALETTE.steel,g);
  }
  return g;
}
export function desertRampPoint(ramp,distance,side=0,lift=.035){const p=trackAt(ramp.fraction-(ramp.length-distance)/TRACK_LENGTH);return along(p,side,p.y+ramp.height*Math.max(0,Math.min(1,distance/ramp.length))+lift);}
function jump(w,ramp){
  const g=taggedGroup(w,'desert-jump');g.userData.jumpId=ramp.id;g.userData.fraction=ramp.fraction;const top=[],sides=[],traction=[],chevrons=[],p=trackAt(ramp.fraction),width=p.halfWidth+.38,N=10;
  for(let i=0;i<N;i++){
    const d=ramp.length*i/N,nd=ramp.length*(i+1)/N;quad(top,desertRampPoint(ramp,d,-width),desertRampPoint(ramp,d,width),desertRampPoint(ramp,nd,width),desertRampPoint(ramp,nd,-width));
    for(const side of [-1,1]){const a=desertRampPoint(ramp,d,side*width),b=desertRampPoint(ramp,nd,side*width),aa=[a[0],a[1]-ramp.height*d/ramp.length-.025,a[2]],bb=[b[0],b[1]-ramp.height*nd/ramp.length-.025,b[2]];if(side===1)quad(sides,a,aa,bb,b);else quad(sides,a,b,bb,aa);}
    if(i%2===1)quad(traction,desertRampPoint(ramp,d,-width,.047),desertRampPoint(ramp,d,width,.047),desertRampPoint(ramp,d+.13,width,.047),desertRampPoint(ramp,d+.13,-width,.047));
  }
  w.mesh(geometry(top),w.mat(0x74563a,.97),0,0,0,g);w.mesh(geometry(sides),PALETTE.rust,0,0,0,g);w.mesh(geometry(traction),PALETTE.dark,0,0,0,g);
  for(let i=0;i<18;i++){
    const a=-width+i*width/9,b=a+width/9,lip=[];quad(lip,desertRampPoint(ramp,ramp.length-.8,a,.05),desertRampPoint(ramp,ramp.length-.8,b,.05),desertRampPoint(ramp,ramp.length,b,.05),desertRampPoint(ramp,ramp.length,a,.05));
    const c=desertRampPoint(ramp,ramp.length,a),d=desertRampPoint(ramp,ramp.length,b);quad(lip,c,d,[d[0],d[1]-.55,d[2]],[c[0],c[1]-.55,c[2]]);w.mesh(geometry(lip),i%2?PALETTE.yellow:PALETTE.dark,0,0,0,g);
  }
  for(const center of [-5.3,0,5.3])for(const d of [3.2,6.3]){
    const points=[[d-1.2,center-1.2],[d,center],[d-1.2,center+1.2],[d-.6,center+1.2],[d+.6,center],[d-.6,center-1.2]].map(([x,z])=>desertRampPoint(ramp,x,z,.065));
    for(const [a,b,c]of [[0,1,5],[1,4,5],[1,2,3],[1,3,4]])tri(chevrons,points[a],points[b],points[c]);
  }
  const paint=w.mat(PALETTE.yellow);paint.side=THREE.DoubleSide;w.mesh(geometry(chevrons),paint,0,0,0,g);
  for(const side of [-1,1]){
    for(const d of [0,ramp.length*.5,ramp.length]){const at=desertRampPoint(ramp,d,side*(width+.5));w.cylinder(at[0],at[1]+.48,at[2],.13,.13,.96,PALETTE.rust,6,g);w.box(at[0],at[1]+.94,at[2],.32,.14,.32,PALETTE.yellow,g);}
    segment(w,desertRampPoint(ramp,0,side*(width+.5),.86),desertRampPoint(ramp,ramp.length,side*(width+.5),.86),.09,PALETTE.steel,g);
    const before=trackAt(ramp.fraction-(ramp.length+10)/TRACK_LENGTH),sign=new THREE.Group();sign.position.set(before.x+before.nx*side*(before.halfWidth+2),before.y,before.z+before.nz*side*(before.halfWidth+2));sign.rotation.y=-before.angle;g.add(sign);w.cylinder(0,1.45,0,.08,.1,2.9,PALETTE.steel,6,sign);w.box(0,2.55,0,.14,1.5,2.1,PALETTE.yellow,sign);
    // Ramp pictogram faces approaching drivers, no text or texture needed.
    const icon=[-.09,2.10,-.7,-.09,2.10,.7,-.09,2.93,.7];const m=w.mat(PALETTE.dark);m.side=THREE.DoubleSide;w.mesh(geometry(icon),m,0,0,0,sign);
  }
  return g;
}
function moleGround(w){
  const g=taggedGroup(w,'desert-mole-plateau'),start=DESERT_MOLE_ZONE.center-(DESERT_MOLE_ZONE.length/2+DESERT_MOLE_ZONE.transition)/TRACK_LENGTH,end=DESERT_MOLE_ZONE.center+(DESERT_MOLE_ZONE.length/2+DESERT_MOLE_ZONE.transition)/TRACK_LENGTH,N=100,v=[];
  for(let i=0;i<N;i++){const p=trackAt(start+(end-start)*i/N),q=trackAt(start+(end-start)*(i+1)/N);for(const side of [-1,1]){const a=along(p,side*(p.halfWidth+.62),p.y-.20),b=along(p,side*(p.halfWidth+12),-4.1),c=along(q,side*(q.halfWidth+12),-4.1),d=along(q,side*(q.halfWidth+.62),q.y-.20);if(side===1)quad(v,a,b,c,d);else quad(v,a,d,c,b);}}
  w.mesh(geometry(v),PALETTE.sand,0,0,0,g);return g;
}
export function buildDesertScenery(w){
  const a=mountainside(w,DESERT_MOUNTAIN.start,DESERT_MOUNTAIN.ascentEnd,1),b=mountainside(w,DESERT_MOUNTAIN.bridgeEnd,DESERT_MOUNTAIN.end,2),bridge=highBridge(w),jumps=DESERT_JUMPS.map(r=>jump(w,r)),plateau=moleGround(w);
  return {mountains:[a,b],bridge,jumps,plateau};
}
