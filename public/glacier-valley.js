import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const TAU=Math.PI*2;
const random=(a,b=0)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
const vec=p=>new THREE.Vector3(...p);
function geo(vertices){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const uv=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]/12,vertices[i+2]/12);g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;}
const tri=(v,a,b,c)=>v.push(...a,...b,...c);
const quad=(v,a,b,c,d)=>{tri(v,a,b,c);tri(v,a,c,d);};
export const GLACIER_RESORTS=Object.freeze([{x:-250,side:1,name:'North Ridge',color:0xb0443c},{x:250,side:-1,name:'Summit House',color:0x326b87}]);
const RIVER_SEGMENTS=440,RIVER_HALF_LENGTH=440;
export function glacierRiverAt(x){
  // Broad asymmetric S-bends remain inside the 80m valley. Ease back toward
  // its center near both end turns, rather than repeating identical waves.
  const u=Math.max(0,Math.min(1,(RIVER_HALF_LENGTH-Math.abs(x))/70)),ease=u*u*(3-2*u),de=u>0&&u<1?-Math.sign(x)*6*u*(1-u)/70:0;
  const raw=12*Math.sin(x*.034+.4)+4.2*Math.sin(x*.018-.8)+2*Math.sin(x*.076+.7);
  // The split lanes widen through the middle: pull bends inward there.
  const c=Math.max(0,Math.min(1,(Math.abs(x)-140)/75)),scale=.56+.28*c*c*(3-2*c),ds=c>0&&c<1?Math.sign(x)*.28*6*c*(1-c)/75:0,bend=raw*scale;
  const slope=((.408*Math.cos(x*.034+.4)+.0756*Math.cos(x*.018-.8)+.152*Math.cos(x*.076+.7))*scale+raw*ds)*ease+bend*de;
  const length=Math.hypot(1,slope),taper=Math.max(0,Math.min(1,(RIVER_HALF_LENGTH-Math.abs(x))/25));
  return {z:bend*ease,width:(4.8+.6*Math.sin(x*.021+.7)+.32*Math.cos(x*.047))*Math.sqrt(taper),tx:1/length,tz:slope/length,nx:-slope/length,nz:1/length};
}
export function glacierRiverPoint(x,across,bankOffset=0){const p=glacierRiverAt(x),offset=across*(p.width+bankOffset);return [x+p.nx*offset,-3.25,p.z+p.nz*offset];}
export function createRiverGeometry(){
  const vertices=[],across=[],flowUV=[],flowDirection=[],distances=[0];
  const step=RIVER_HALF_LENGTH*2/RIVER_SEGMENTS;
  for(let i=1;i<=RIVER_SEGMENTS;i++){const x=-RIVER_HALF_LENGTH+i*step,previous=glacierRiverAt(x-step),current=glacierRiverAt(x);distances.push(distances[i-1]+Math.hypot(step,current.z-previous.z));}
  for(let i=0;i<RIVER_SEGMENTS;i++)for(let j=0;j<6;j++){
    const a=-1+j/3,b=a+1/3;
    // Upward winding, with streamwise UV measured in meters along the bends.
    for(const [row,t] of [[i,a],[i,b],[i+1,b],[i,a],[i+1,b],[i+1,a]]){
      const x=-RIVER_HALF_LENGTH+row*step,p=glacierRiverAt(x);vertices.push(...glacierRiverPoint(x,t));across.push(t);flowUV.push(distances[row],t*p.width);flowDirection.push(p.tx,p.tz);
    }
  }
  const g=geo(vertices);g.setAttribute('riverAcross',new THREE.Float32BufferAttribute(across,1));g.setAttribute('flowUV',new THREE.Float32BufferAttribute(flowUV,2));g.setAttribute('flowDirection',new THREE.Float32BufferAttribute(flowDirection,2));return g;
}
export function createRiverBanks(){
  const banks=[],step=RIVER_HALF_LENGTH*2/RIVER_SEGMENTS;
  for(let i=0;i<RIVER_SEGMENTS;i++)for(const side of [-1,1]){
    const a=-RIVER_HALF_LENGTH+i*step,b=a+step,point=(x,outer)=>{const p=glacierRiverPoint(x,side,outer?2.3+.3*Math.sin(x*.047):.05);p[1]=outer?-2.45:-3.15;return p;},aa=point(a,false),ab=point(a,true),ba=point(b,false),bb=point(b,true);
    if(side===1)quad(banks,aa,ab,bb,ba);else quad(banks,aa,ba,bb,ab);
  }
  return geo(banks);
}
function riverMaterial(){return new THREE.ShaderMaterial({fog:true,uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),time:{value:0}},
  vertexShader:`uniform float time;attribute float riverAcross;attribute vec2 flowUV,flowDirection;varying vec3 riverPosition;varying float across;varying vec2 streamUV,streamDirection;
    #include <fog_pars_vertex>
    void main(){vec3 p=position;p.y+=sin(flowUV.x*.72+flowUV.y*.37-time*2.3)*.035+sin(flowUV.x*.29-flowUV.y*.81-time*1.4)*.022;
      riverPosition=p;across=riverAcross;streamUV=flowUV;streamDirection=flowDirection;vec4 mvPosition=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader:`uniform float time;varying vec3 riverPosition;varying float across;varying vec2 streamUV,streamDirection;
    #include <fog_pars_fragment>
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
    void main(){
      vec3 viewDelta=cameraPosition-riverPosition;float distanceToEye=length(viewDelta);vec3 V=viewDelta/max(distanceToEye,.001);
      vec2 p=streamUV;float velocity=2.1+(1.-across*across)*.9;vec2 advected=p-vec2(time*velocity,0.);
      float q0=p.x*.72+p.y*.37-time*2.3,q1=p.x*.29-p.y*.81-time*1.4;
      float q2=advected.x*2.37+advected.y*1.41,q3=advected.x*4.7-advected.y*3.13;
      float detail=1.-smoothstep(45.,170.,distanceToEye);
      // Exact derivatives of the summed waves give moving normals; no normal
      // texture, reflection camera, offscreen buffer or post-processing pass.
      vec2 slope=vec2(.72,.37)*cos(q0)*.035+vec2(.29,-.81)*cos(q1)*.022;
      slope+=(vec2(2.37,1.41)*cos(q2)*.019+vec2(4.7,-3.13)*cos(q3)*.006)*detail;
      vec2 tangent=normalize(streamDirection),normalAcross=vec2(-tangent.y,tangent.x),horizontal=tangent*slope.x+normalAcross*slope.y;
      vec3 N=normalize(vec3(-horizontal.x,1.,-horizontal.y));
      float ndv=max(dot(N,V),.0),fresnel=.035+.965*pow(1.-ndv,5.);vec3 reflected=reflect(-V,N);
      vec3 sky=mix(vec3(.66,.76,.82),vec3(.27,.43,.59),smoothstep(.03,.95,reflected.y));
      float ridge=.12+.075*sin(reflected.x*9.+reflected.z*7.)+.035*sin(reflected.x*23.-reflected.z*11.);
      float mountainReflection=1.-smoothstep(ridge-.025,ridge+.045,reflected.y);
      sky=mix(sky,mix(vec3(.23,.32,.39),vec3(.61,.73,.81),smoothstep(-.03,ridge,reflected.y)),mountainReflection*.62);
      float edge=pow(abs(across),2.5),depth=1.-edge;
      vec3 water=mix(vec3(.095,.37,.41),vec3(.018,.115,.19),depth);
      float bed=noise(vec2(p.x*.16,p.y*.48));water+=vec3(.045,.09,.08)*(bed-.35)*edge;
      vec3 color=mix(water,sky,clamp(fresnel*.86+.15,0.,.9));
      vec3 L=normalize(vec3(-45.,60.,-38.)),H=normalize(L+V);float light=max(dot(N,H),0.);
      color+=vec3(.64,.79,.91)*(pow(light,180.)*.75+pow(light,24.)*.09);
      float eddy=sin(advected.x*.105+sin(p.y*.58))*sin(p.y*1.17+advected.x*.049);
      float patches=noise(vec2(advected.x*.22+eddy*.6,p.y*1.28+sin(p.x*.035)*.7));
      float crest=pow(max(0.,sin(q0)*.75+sin(q1)*.25),9.);
      float foam=smoothstep(.69,.86,patches)*(.08+crest*.35);
      float shoreFoam=smoothstep(.88,1.,abs(across))*smoothstep(.30,.78,patches)*.42;
      color=mix(color,vec3(.78,.91,.94),min(.64,foam+shoreFoam));gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`});}

function mountain(w,x,z,radius,height,seed){
  const g=new THREE.Group();g.position.set(x,-4,z);g.userData.sceneryKind='mountain';g.userData.radius=radius*1.1;w.static.add(g);
  const rings=[1,.85,.64,.42,.23,.10,0],snow=[],rock=[],N=32;
  const point=(r,j)=>{const a=j/N*TAU,fold=1+.055*Math.sin(a*5+seed)+.04*Math.sin(a*9-seed),ridge=Math.sin(a*5+seed)*Math.sin(Math.PI*r)*height*.055;return [Math.cos(a)*r*radius*fold,Math.pow(1-r,1.35)*height+ridge,Math.sin(a)*r*radius*fold];};
  for(let r=1;r<rings.length;r++)for(let j=0;j<N;j++){
    const a=point(rings[r-1],j),b=point(rings[r],j),c=point(rings[r],j+1),d=point(rings[r-1],j+1);
    // Broken exposed bands give ridgelines definition without textures or added passes.
    const v=r>1&&Math.sin(j*.8+seed+r*.7)>.50?rock:snow;quad(v,a,b,c,d);
  }
  w.mesh(geo(snow),0xd3e5ed,0,0,0,g);w.mesh(geo(rock),0x8197a6,0,0,0,g);return g;
}
function skiRun(w,peak,resort){
  peak.updateMatrixWorld(true);const terrain=new THREE.Raycaster(),start=new THREE.Vector3(resort.x+5,0,resort.side*80),end=new THREE.Vector3(resort.x+39,0,resort.side*165),length=start.distanceTo(end),normal=new THREE.Vector3(-(end.z-start.z)/length,0,(end.x-start.x)/length),snow=[];
  const point=(t,side)=>{const p=start.clone().lerp(end,t),width=5.5-Math.sin(t*Math.PI)*1.2;p.addScaledVector(normal,side*width);terrain.set(new THREE.Vector3(p.x,150,p.z),new THREE.Vector3(0,-1,0));const hit=terrain.intersectObject(peak)[0];p.y=(hit?.point.y??-4)+.11;return [p.x,p.y,p.z];};
  for(let i=0;i<36;i++){const a=i/36,b=(i+1)/36,pa=point(a,-1),pb=point(a,1),qa=point(b,-1),qb=point(b,1);quad(snow,pa,pb,qb,qa);}
  const mat=w.mat(0xe1f4fa);mat.side=THREE.DoubleSide;const trail=w.mesh(geo(snow),mat);trail.userData.sceneryKind='ski-run';
  for(let i=1;i<9;i++)for(const side of [-1,1]){const p=point(i/10,side);w.cylinder(p[0],p[1]+.55,p[2],.045,.045,1.1,0x334b5d,5);const marker=w.box(p[0],p[1]+.94,p[2],.5,.32,.05,resort.color);marker.rotation.y=Math.atan2(end.x-start.x,end.z-start.z);}
}
function lodge(w,x,z,side,color){
  const g=new THREE.Group();g.position.set(x,-3.9,z);g.rotation.y=side===1?Math.PI:0;g.userData.sceneryKind='ski-lodge';w.static.add(g);
  w.box(0,2.8,0,17,5.6,10,0x765949,g);w.box(0,.4,0,18,.8,11,0x8197a6,g);
  for(let row=0;row<9;row++)w.box(0,.85+row*.52,5.08,17.2,.13,.13,0xa48566,g);
  const roof=[];quad(roof,[-10,5.5,-6],[10,5.5,-6],[10,8.2,0],[-10,8.2,0]);quad(roof,[-10,8.2,0],[10,8.2,0],[10,5.5,6],[-10,5.5,6]);
  const roofMat=w.mat(0xe1f4fa);roofMat.side=THREE.DoubleSide;w.mesh(geo(roof),roofMat,0,0,0,g);
  const windows=w.mat(0xffcd86);windows.emissive.setHex(0xf3a658);windows.emissiveIntensity=.42;
  for(let floor=0;floor<2;floor++)for(let i=-2;i<=2;i++){
    w.box(i*3.1,1.8+floor*2.25,5.12,1.6,1.4,.12,windows,g);w.box(i*3.1,1.8+floor*2.25,5.20,.09,1.5,.05,0x765949,g);w.box(i*3.1,1.8+floor*2.25,5.20,1.7,.10,.05,0x765949,g);
  }
  w.box(0,4.1,5.45,19,.24,2,0xa48566,g);w.box(0,4.75,6.22,19,.12,.12,0x765949,g);for(let i=-6;i<=6;i++)w.box(i*1.45,4.43,6.22,.08,.7,.08,0x765949,g);
  w.box(6,7,-2,1.4,4,1.4,0x8197a6,g);w.box(6,9.15,-2,1.75,.30,1.75,0xe1f4fa,g);
  for(const sign of [-1,1]){const ski=w.box(sign*4.5,.95,5.6,.2,2.1,.10,color,g);ski.rotation.z=sign*.2;}
  const sign=w.box(0,5.85,5.24,7,.72,.18,color,g);sign.userData.sceneryKind='resort-sign';
  // Distinctive ski-and-mountain crest remains legible without text textures.
  for(const sign of [-1,1]){const mark=w.box(sign*.55,5.86,5.35,.08,.59,.04,0xe1f4fa,g);mark.rotation.z=sign*.65;}
  return g;
}
function segment(w,a,b,r,color,parent=w.static){const start=vec(a),end=vec(b),mid=start.clone().add(end).multiplyScalar(.5),mesh=w.mesh(new THREE.CylinderGeometry(r,r,start.distanceTo(end),6),color,mid.x,mid.y,mid.z,parent);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());return mesh;}
function terminal(w,p,color){
  // Open terminals let the chairs pass through without intersecting a solid station.
  w.box(p.x,p.y-4,p.z,7,.18,8,0xe1f4fa);
  for(const x of [-3.2,3.2])for(const z of [-3.6,3.6])w.box(p.x+x,p.y-2,p.z+z,.3,4,.3,0x8197a6);
  w.box(p.x,p.y+.40,p.z,7,.5,8,color);w.box(p.x,p.y+.76,p.z,7.3,.22,8.3,0xe1f4fa);
  const wheel=w.mesh(new THREE.TorusGeometry(1.9,.15,6,20),0x334b5d,p.x,p.y+.15,p.z);wheel.rotation.x=Math.PI/2;
}
function createChairGeometry(){
  const parts=[],add=(g,p)=>{g.translate(...p);parts.push(g.index?g.toNonIndexed():g);};
  add(new THREE.BoxGeometry(2.15,.18,.85),[0,-2.8,0]);add(new THREE.BoxGeometry(2.15,.95,.12),[0,-2.25,.40]);
  for(const side of [-1,1])add(new THREE.BoxGeometry(.08,.8,.8),[side*1.05,-2.3,0]);
  add(new THREE.BoxGeometry(.09,2.25,.09),[0,-1.1,.25]);add(new THREE.BoxGeometry(.65,.10,.10),[.28,0,.25]);
  const g=mergeGeometries(parts);for(const p of parts)p.dispose();return g;
}
export function chairliftPose(lift,distance){
  const {a,b,direction,normal,length,width}=lift,arc=Math.PI*width,total=length*2+arc*2;
  let s=((distance%total)+total)%total,x,y,z,angle;
  if(s<length){const t=s/length;x=a.x+direction.x*s+normal.x*width;z=a.z+direction.z*s+normal.z*width;y=a.y+(b.y-a.y)*t-lift.sag*Math.sin(Math.PI*t);angle=Math.atan2(direction.x,direction.z);}
  else if(s<length+arc){const theta=(s-length)/width,n=Math.cos(theta)*width,d=Math.sin(theta)*width;x=b.x+normal.x*n+direction.x*d;z=b.z+normal.z*n+direction.z*d;y=b.y;angle=Math.atan2(direction.x*Math.cos(theta)-normal.x*Math.sin(theta),direction.z*Math.cos(theta)-normal.z*Math.sin(theta));}
  else if(s<length*2+arc){s-=length+arc;const t=s/length;x=b.x-direction.x*s-normal.x*width;z=b.z-direction.z*s-normal.z*width;y=b.y+(a.y-b.y)*t-lift.sag*Math.sin(Math.PI*t);angle=Math.atan2(-direction.x,-direction.z);}
  else {const theta=(s-length*2-arc)/width,n=-Math.cos(theta)*width,d=-Math.sin(theta)*width;x=a.x+normal.x*n+direction.x*d;z=a.z+normal.z*n+direction.z*d;y=a.y;angle=Math.atan2(-direction.x*Math.cos(theta)+normal.x*Math.sin(theta),-direction.z*Math.cos(theta)+normal.z*Math.sin(theta));}
  return {x,y,z,angle,total};
}
function chairlift(w,resort){
  const a=new THREE.Vector3(resort.x+14,0,resort.side*83),b=new THREE.Vector3(resort.x+42,78,resort.side*165),length=Math.hypot(b.x-a.x,b.z-a.z),direction=new THREE.Vector3((b.x-a.x)/length,0,(b.z-a.z)/length),normal=new THREE.Vector3(-direction.z,0,direction.x);
  const lift={a,b,direction,normal,length,width:1.9,sag:2.5,speed:3.5,count:18};
  const curve=[];const total=chairliftPose(lift,0).total;
  for(let i=0;i<=180;i++){const p=chairliftPose(lift,total*i/180);curve.push(new THREE.Vector3(p.x,p.y,p.z));}
  w.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve),180,.075,4,false),0x334b5d);
  terminal(w,a,resort.color);terminal(w,b,resort.color);
  for(const t of [.22,.47,.72]){
    const point=a.clone().lerp(b,t),ground=-4+74*Math.pow(Math.max(0,1-(1-t)*length/68),1.35),top=point.y-lift.sag*Math.sin(Math.PI*t)-.25;
    segment(w,[point.x,ground,point.z],[point.x,top,point.z],.28,0x8197a6);
    segment(w,[point.x-normal.x*2.8,top,point.z-normal.z*2.8],[point.x+normal.x*2.8,top,point.z+normal.z*2.8],.17,0x334b5d);
    for(const side of [-1,1]){const wheel=w.mesh(new THREE.TorusGeometry(.32,.09,5,10),0x334b5d,point.x+normal.x*side*1.9,top+.05,point.z+normal.z*side*1.9);wheel.rotation.y=Math.atan2(direction.x,direction.z);}
  }
  const chairMaterial=w.mat(resort.color,.42,.3),chairs=new THREE.InstancedMesh(createChairGeometry(),chairMaterial,lift.count);chairs.castShadow=true;chairs.receiveShadow=true;chairs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);chairs.userData.sceneryKind='chairlift';chairs.boundingSphere=new THREE.Sphere(a.clone().add(b).multiplyScalar(.5),a.distanceTo(b)*.5+lift.width+lift.sag+4);w.scene.add(chairs);lift.chairs=chairs;lift.dummy=new THREE.Object3D();lift.total=total;return lift;
}
export function buildGlacierValley(w){
  const river=new THREE.Mesh(createRiverGeometry(),riverMaterial());river.userData.sceneryKind='river';w.scene.add(river);
  w.mesh(createRiverBanks(),0xe1f4fa);
  for(const side of [-1,1]){
    const resort=GLACIER_RESORTS.find(r=>r.side===side);
    for(let i=0;i<15;i++){
      const x=-504+i*72;if(Math.abs(x-(resort.x+42))<96)continue;
      mountain(w,x,side*(169+random(i,side)*23),72+random(i,3)*14,85+random(i,5)*65,i+side*19);
      if(i%2===0)mountain(w,x+15,side*106,33,24+random(i,8)*23,i+2);
    }
    // Mountain at each lift summit provides a continuous slope beneath the cable.
    const peak=mountain(w,resort.x+42,side*165,68,78,side*17);skiRun(w,peak,resort);
    lodge(w,resort.x,side*70,side,resort.color);
  }
  for(const sign of [-1,1])for(let j=0;j<5;j++)mountain(w,sign*(581+random(j,sign)*22),-130+j*65,68+random(j,7)*14,80+random(j,9)*65,j+sign*11);
  const lifts=GLACIER_RESORTS.map(r=>chairlift(w,r)),valley={river,riverMaterial:river.material,lifts};updateGlacierValley(valley,0);return valley;
}
export function updateGlacierValley(valley,now){
  if(!valley)return;valley.riverMaterial.uniforms.time.value=now/1000;
  for(const lift of valley.lifts){
    for(let i=0;i<lift.count;i++){const p=chairliftPose(lift,now/1000*lift.speed+i/lift.count*lift.total),d=lift.dummy;d.position.set(p.x,p.y,p.z);d.rotation.set(0,p.angle,Math.sin(now*.0018+i)*.025);d.updateMatrix();lift.chairs.setMatrixAt(i,d.matrix);}
    lift.chairs.instanceMatrix.needsUpdate=true;
  }
}
