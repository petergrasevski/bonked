import {buildFactoryMachinery} from './factory-machinery.js';
import {buildFactoryInterior,mergeMovingGroup} from './factory-interior.js';
import {createSteamVents} from './volcano-effects.js';
import {rotorAngle,rotorWallSegments} from '../shared/factory-rotors.js';
import * as THREE from 'three';
import {activeTrack,trackAt,SEGMENTS,TRACK_LENGTH,getLandscape,OBSTACLES} from '../shared/game.js';
import {FACTORY_BELTS,FACTORY_TABLES,FACTORY_PRESSES,VOLCANO_HOT,beltDirection,beltTravel,volcanoLavaBounds,FACTORY_TIP,circuitDistance} from '../shared/extra-circuits.js';

export const CIRCUIT_PALETTES={
  factory:{road:0x53616a,edge:0xd9a546,ground:0x313b3c,wall:0x304654,light:0xffc66c},
  volcano:{road:0x4a4448,edge:0xe59c62,ground:0x29272e,wall:0x39323b,light:0xff742c},
};
const TAU=Math.PI*2;
function group(w,x,y,z,angle=0){const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=-angle;w.static.add(g);return g;}
function glow(w,color){return w.mat(color,.5,.1).clone();}
function emissive(w,color,strength=.6){const m=glow(w,color);m.emissive=new THREE.Color(color);m.emissiveIntensity=strength;return m;}
function roadPatch(w,fraction,length,lo,hi,material,lift=.04){
  const vertices=[],uv=[],count=Math.ceil(length/2);
  for(let i=0;i<count;i++){
    const p=trackAt(fraction+(i/count-.5)*length/TRACK_LENGTH),q=trackAt(fraction+((i+1)/count-.5)*length/TRACK_LENGTH);
    const organic=material.userData.lavaZone;
    const bounds=r=>volcanoLavaBounds(r.fraction??((fraction+(i/count-.5)*length/TRACK_LENGTH)%1+1)%1,TRACK_LENGTH)?.[0]||[.69,.69];
    const a=organic?bounds({...p,fraction:fraction+(i/count-.5)*length/TRACK_LENGTH}):[lo,hi],b=organic?bounds({...q,fraction:fraction+((i+1)/count-.5)*length/TRACK_LENGTH}):[lo,hi];
    const points=[[p,a[0],i],[p,a[1],i],[q,b[0],i+1],[q,b[1],i+1]];
    for(const index of [0,1,2,1,3,2]){const [r,l,j]=points[index];vertices.push(r.x+r.nx*r.halfWidth*l,r.y+lift,r.z+r.nz*r.halfWidth*l);uv.push(j/count*length,l);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();
  return w.mesh(geo,material,0,0,0,w.scene);
}
function animatedSurface(color,kind){
  const time={value:0},direction={value:1},travel={value:0},m=new THREE.MeshStandardMaterial({color,roughness:kind==='lava'?.48:.65,metalness:kind==='belt'?.5:.05,side:THREE.DoubleSide});
  m.onBeforeCompile=shader=>{
    shader.uniforms.circuitTravel=travel;shader.uniforms.circuitTime=time;shader.uniforms.circuitDirection=direction;
    shader.vertexShader='#define USE_UV\n'+shader.vertexShader;
    shader.fragmentShader='#define USE_UV\nuniform float circuitTime,circuitDirection,circuitTravel;\nfloat lavaHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat lavaNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(lavaHash(i),lavaHash(i+vec2(1,0)),f.x),mix(lavaHash(i+vec2(0,1)),lavaHash(i+vec2(1,1)),f.x),f.y);}\nfloat lavaFbm(vec2 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=lavaNoise(p)*a;p=p*2.03+vec2(7.1,3.4);a*=.5;}return n;}\n\n'+shader.fragmentShader;
    const fragment=kind==='belt'?`
      float tread=step(.82,fract(vUv.x*.7-circuitTravel*2.));
      diffuseColor.rgb*=mix(.45,.9,tread);
      float blend=circuitDirection*.5+.5;
      float across=(abs(vUv.y)-.53)/.35;
      float cell=mod(vUv.x-circuitTravel*5.,9.);
      float arrow=1.-smoothstep(.5,.85,abs(cell-4.+abs(across)*2.5*circuitDirection));
      float rail=step(.86,abs(across));
      vec3 ink=mix(vec3(.17,.62,1.),vec3(1.,.72,.13),blend);
      diffuseColor.rgb=mix(diffuseColor.rgb,ink,max(arrow,rail*.65));
    `:`
      vec2 flow=vec2(vUv.x*.19-circuitTime*.45,vUv.y*7.);
      vec2 warp=vec2(lavaFbm(flow*.65+vec2(0.,circuitTime*.08)),lavaFbm(flow*.65+vec2(8.,-circuitTime*.11)));
      float crust=lavaFbm(flow+warp*3.1);
      float veins=1.-smoothstep(.02,.085,abs(crust-.5));
      float hot=pow(veins,5.),embers=lavaNoise(flow*12.+warp)*.15;
      vec3 lavaColor=mix(vec3(.075,.035,.028),vec3(1.,.15,.008),smoothstep(.15,.75,veins));
      lavaColor=mix(lavaColor,vec3(1.,.48,.02),hot*.65);lavaColor+=vec3(.12,.025,.001)*embers;
      diffuseColor.rgb=lavaColor;
    `;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n'+fragment);
    if(kind==='lava')shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=lavaColor*.45;');
  };
  m.customProgramCacheKey=()=>`circuit-${kind}-v2`;
  return {material:m,time,direction,travel};
}
export function circuitRoadMaterial(w,id){
  const palette=CIRCUIT_PALETTES[id],canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle=`#${palette.road.toString(16).padStart(6,'0')}`;ctx.fillRect(0,0,256,256);
  // Deterministic fine grain, steel seams, basalt fractures, or limestone slabs.
  for(let i=0;i<1700;i++){const x=(Math.sin(i*127.1)*43758.54)%1*256,y=(Math.sin(i*311.7)*17371.13)%1*256;ctx.fillStyle=i%2?'#ffffff09':'#00000012';ctx.fillRect(Math.abs(x),Math.abs(y),1+i%3,1);}
  ctx.strokeStyle=id==='factory'?'#182a3380':id==='volcano'?'#1d192380':'#344f4690';ctx.lineWidth=2;
  for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(0,i*64);ctx.lineTo(256,i*64);ctx.stroke();if(id!=='volcano')for(let j=0;j<2;j++){ctx.beginPath();ctx.moveTo(j*128+(i%2)*64,i*64);ctx.lineTo(j*128+(i%2)*64,(i+1)*64);ctx.stroke();}}
  if(id==='factory'){ctx.fillStyle='#afbac1';for(const x of [6,250])for(const y of [6,70,134,198])ctx.fillRect(x-1,y-1,3,3);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;w.textures.set(`${id}-road`,texture);
  return new THREE.MeshStandardMaterial({map:texture,bumpMap:texture,bumpScale:.035,roughness:id==='factory'?.62:.88,metalness:id==='factory'?.4:.04,side:THREE.DoubleSide});
}
function volcanoScenery(w){
  const bands=getLandscape().volcano;
  for(const [index,vertices]of bands.entries()){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();
    const material=new THREE.MeshBasicMaterial({color:0x9e503d,side:THREE.DoubleSide});
    // Broad, stable rock shading avoids tiny self-shadow patterns on a mountain
    // hundreds of metres across. Its geometry still casts onto the road.
    material.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 mountainPoint;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nmountainPoint=position;');
      shader.fragmentShader='varying vec3 mountainPoint;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        vec3 slope=normalize(vec3(mountainPoint.x*.7,150.,mountainPoint.z*.7));
        float daylight=.68+.32*max(0.,dot(slope,normalize(vec3(-.5,1.,-.4))));
        float strata=.95+.05*sin(mountainPoint.y*.07+sin(mountainPoint.x*.04+mountainPoint.z*.03)*2.);
        vec3 n=normalize(cross(dFdx(mountainPoint),dFdy(mountainPoint)));
        float facet=.65+.35*abs(dot(n,normalize(vec3(-.6,1.,.3))));
        float grain=fract(sin(dot(floor(mountainPoint.xz*.12),vec2(127.1,311.7)))*43758.54);
        float fracture=abs(sin(mountainPoint.x*.13+mountainPoint.z*.19+sin(mountainPoint.y*.08)*3.));
        diffuseColor.rgb*=daylight*strata*facet*(.87+.2*grain)*(.78+.22*smoothstep(.02,.12,fracture));
      `);
    };material.customProgramCacheKey=()=> 'volcano-rock-v1';material.userData.skipBakedShadow=true;w.mesh(geo,material);
  }
  // Broken red basalt outcrops add real silhouettes and depth to the hillside.
  const rockGeo=new THREE.DodecahedronGeometry(1,0);
  for(let i=0;i<190;i++){
    const a=i*2.39996323,radius=70+((i*73)%131),x=Math.cos(a)*radius,z=Math.sin(a)*radius,surface=getLandscape().surface.sample(x,z);if(!surface||surface.y<185)continue;
    const size=2+(i*17%47)/10,rock=w.mesh(rockGeo.clone(),[0x773a2c,0x9d513a,0x85412e][i%3],x,surface.y+size*.3,z);
    rock.scale.set(size*(1+(i%3)*.3),size*(.7+(i%4)*.2),size*.85);rock.rotation.set(i*.7,a,i*.4);
  }
  rockGeo.dispose();
  const streams=animatedSurface(0xff561c,'lava');
  streams.material=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{time:streams.time},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float time;varying vec2 vUv;void main(){float center=1.-smoothstep(.04,.32,abs(vUv.y));float pulse=.8+.2*sin(vUv.x*1.7-time*3.+sin(vUv.y*31.));vec3 c=mix(vec3(.5,.035,.002),vec3(1.,.45,.015),center*pulse);gl_FragColor=vec4(c,1.);}`});
  for(const f of [.09,.19,.37,.49,.68,.79,.91]){
    const p=trackAt(f),radius=Math.hypot(p.x,p.z),base=Math.atan2(p.z,p.x),positions=[],uv=[];
    const point=(j,side)=>{const u=j/85,r=59+(radius-59)*u,a=base+Math.sin(u*13+f*29)*.025*Math.sin(Math.PI*u),width=1.6+u*1.8,angle=a+side*width/r,x=Math.cos(angle)*r,z=Math.sin(angle)*r,s=getLandscape().surface.sample(x,z);return [x,(s?.y??307)+.7,z];};
    // Stop above the deck: the lane's organic pool continues the flow on the road.
    for(let j=0;j<78;j++)for(const [k,side]of [[j,-1],[j,1],[j+1,-1],[j,1],[j+1,1],[j+1,-1]]){positions.push(...point(k,side));uv.push(k*2,side*.3);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();w.mesh(geo,streams.material);
  }
  for(const o of OBSTACLES){if(o.kind!=='basalt')continue;const rock=w.mesh(new THREE.DodecahedronGeometry(o.radius,0),0x783f34,o.x,o.y+o.radius*.7,o.z);rock.scale.set(1,1.2,.9);rock.rotation.set(.25,o.angle,.18);}
  const crater=animatedSurface(0xff561c,'lava');w.cylinder(0,307.1,0,42,42,.3,crater.material,64);
  const rim=w.mesh(new THREE.TorusGeometry(51,5,6,64),0x392e35,0,326,0);rim.rotation.x=Math.PI/2;
  return {...crater,streams};
}
export function circuitGroundMaterial(w,id){
  const material=new THREE.MeshStandardMaterial({color:id==='factory'?0x536166:CIRCUIT_PALETTES[id].ground,roughness:.94,metalness:.03});
  if(id==='factory'){
    material.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec2 factoryFloor;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfactoryFloor=position.xy;');
      shader.fragmentShader='varying vec2 factoryFloor;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        vec2 tile=abs(fract(factoryFloor/18.)-.5);float seam=step(.491,max(tile.x,tile.y));
        float grain=fract(sin(dot(floor(factoryFloor*8.),vec2(127.1,311.7)))*43758.54);
        diffuseColor.rgb*=mix(.85,1.08,grain)*(1.-seam*.3);
        vec2 aisle=abs(fract(factoryFloor/90.)-.5);float paint=step(.489,max(aisle.x,aisle.y));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.55,.43,.16),paint*.55);
      `);
    };material.customProgramCacheKey=()=> 'factory-floor-v1';
  }
  return material;
}
export function buildExtraCircuit(w){
  const id=activeTrack.id,palette=CIRCUIT_PALETTES[id];if(!palette)return null;
  const animated=[],tables=[];
  const interior=id==='factory'?buildFactoryInterior(w):null,machinery=id==='factory'?buildFactoryMachinery(w):null;
  if(id==='volcano')animated.push(volcanoScenery(w));
  const steam=id==='volcano'?createSteamVents(w):null;
  for(const side of [-1,1])w.ribbon(p=>side*(p.halfWidth-.25),.18,.07,palette.edge);
  if(id==='factory'){
    FACTORY_BELTS.forEach((zone,index)=>{
      for(const side of [-1,1]){const surface=animatedSurface(side>0?0x596a72:0x425b63,'belt');roadPatch(w,zone.fraction,zone.length,side>0?.18:-.88,side>0?.88:-.18,surface.material);animated.push({...surface,index,side});}
    });
    FACTORY_TABLES.forEach((f,index)=>{
      const p=trackAt(f);
      for(const layer of [0,1]){
        const g=new THREE.Group();g.position.set(p.x,p.y+.06+layer*.12,p.z);w.scene.add(g);
        const radius=layer?11.3:24;w.cylinder(0,0,0,radius,radius,.08,layer?0x446273:0x697d85,64,g);
        for(let i=0;i<(layer?16:24);i++){const a=i*Math.PI*2/(layer?16:24),r=radius-1;const stripe=w.box(Math.cos(a)*r,.06,Math.sin(a)*r,layer?1:1.8,.03,.25,layer?0x75bed2:0xe0b04e,g);stripe.rotation.y=-a;}
        for(const wall of rotorWallSegments({x:0,z:0},0,index).filter(w=>w.layer===layer)){
          const dx=wall.bx-wall.ax,dz=wall.bz-wall.az,length=Math.hypot(dx,dz),x=(wall.ax+wall.bx)/2,z=(wall.az+wall.bz)/2;
          const body=w.box(x,1.05,z,length+.06,2.1,1.05,layer?0x2b4654:0x263e49,g);body.rotation.y=-Math.atan2(dz,dx);
          const cap=w.box(x,2.15,z,length+.08,.15,1.13,layer?0x75bed2:0xe0b04e,g);cap.rotation.y=body.rotation.y;
        }
        mergeMovingGroup(g);tables.push({g,index,layer});
      }
    });
  }
  if(id==='volcano'){
    VOLCANO_HOT.forEach(zone=>{const surface=animatedSurface(0x8c4532,'lava');surface.material.userData.lavaZone=true;roadPatch(w,zone.fraction,zone.length,.28,.98,surface.material);animated.push(surface);});
  }
  // Sparse ground cover and foundation piers keep the elevated roads grounded.
  if(id==='factory')for(let i=0;i<SEGMENTS.length;i+=36){const p=SEGMENTS[i];if(circuitDistance(p.start/TRACK_LENGTH,FACTORY_TIP.fraction,TRACK_LENGTH)<FACTORY_TIP.length/2+3)continue;for(const side of [-1,1]){const off=(p.halfWidth-1)*side;w.box(p.x+p.nx*off,(p.y-8)/2,p.z+p.nz*off,1.2,p.y+8,1.2,palette.wall);}}
  return {update(seconds,cars=[]){
    machinery?.update(seconds,cars);
    interior?.update(seconds,w.camera);steam?.update(seconds);
    for(const surface of animated){surface.time.value=seconds;if(surface.streams)surface.streams.time.value=seconds;if(surface.index!==undefined){surface.direction.value=surface.side*beltDirection(seconds,surface.index);surface.travel.value=surface.side*beltTravel(seconds,surface.index);}}
    for(const {g,index,layer}of tables)g.rotation.y=-rotorAngle(seconds,index,layer);

  }};
}
