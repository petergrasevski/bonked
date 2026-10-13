import {weatherSurface} from './surface-detail.js';
import * as THREE from 'three';
const TAU=Math.PI*2;
const random=(seed,n)=>{const v=Math.sin(seed*127.1+n*311.7)*43758.5453;return v-Math.floor(v);};
const mix=(a,b,t)=>a+(b-a)*t;
function material(fogScale){
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true});
  // Lighter atmospheric falloff keeps the distant silhouette readable.
  // Standard depth preserves occlusion between cliffs, forest and the track.
  mat.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 landscapePoint;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nlandscapePoint=position;');
    shader.fragmentShader='varying vec3 landscapePoint;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat weathering=sin(landscapePoint.x*.31+sin(landscapePoint.z*.19))*sin(landscapePoint.y*.63+landscapePoint.z*.27);diffuseColor.rgb*=.95+.05*weathering;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',`#ifdef USE_FOG
      #ifdef FOG_EXP2
        float backdropDepth=vFogDepth*${fogScale.toFixed(2)};
        float fogFactor=1.-exp(-fogDensity*fogDensity*backdropDepth*backdropDepth);
      #else
        float fogFactor=smoothstep(fogNear,fogFar,vFogDepth);
      #endif
      gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,fogFactor);
    #endif`);
  };
  mat.customProgramCacheKey=()=>`landscape-backdrop-${fogScale}`;return weatherSurface(mat,{rock:true});
}
function surface(){
  const positions=[],colors=[];
  const tri=(a,b,c,color)=>{const u=new THREE.Vector3().subVectors(new THREE.Vector3(...b),new THREE.Vector3(...a)),v=new THREE.Vector3().subVectors(new THREE.Vector3(...c),new THREE.Vector3(...a));if(u.cross(v).y<0)[b,c]=[c,b];for(const p of [a,b,c]){positions.push(...p);colors.push(color.r,color.g,color.b);}};
  return {quad(a,b,c,d,color){tri(a,b,c,color);tri(a,c,d,color);},finish(mat){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();geo.computeBoundingSphere();const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;return mesh;}};
}
export function canyonPoint(angle,band){
  // A broad, irregular ring encloses the whole figure-eight, including its
  // mountain bridge. Adjacent terraces share their exact boundaries.
  const radii=[1,1.07,1.12,1.14,1.20,1.23,1.29,1.33,1.40,1.53,1.74];
  const heights=[-5,1,25,31,81,87,151,158,220,228,180];
  const fold=1+.035*Math.sin(angle*11)+.025*Math.sin(angle*23+.7)+.018*Math.cos(angle*37),height=1+.17*Math.sin(angle*5+.4)+.09*Math.cos(angle*9),r=radii[band]+Math.sin(band/10*Math.PI)*(.055*Math.sin(angle*7+.2)+.035*Math.cos(angle*19));
  return [Math.cos(angle)*420*r*fold,heights[band]*height+Math.sin(band/10*Math.PI)*7*Math.sin(angle*23+band*.3),Math.sin(angle)*315*r*fold];
}
function canyon(){
  const s=surface(),palette=[0xb88758,0xc08c5c,0xe0ae77,0xa96848,0xd9a474,0x95573e,0xc48356,0xe4b481,0xb17551,0x9c7256];
  for(let i=0;i<224;i++)for(let band=0;band<10;band++){
    const a=i/224*TAU,b=(i+1)/224*TAU,color=new THREE.Color(palette[band]);color.multiplyScalar(.94+.1*Math.sin(a*19+band*.45));
    s.quad(canyonPoint(a,band),canyonPoint(b,band),canyonPoint(b,band+1),canyonPoint(a,band+1),color);
  }
  const mesh=s.finish(material(.58));mesh.name='layered-canyon-walls';return mesh;
}
const ISLAND_RINGS=[1.06,1,.97,.93,.87,.82,.80,.76,.72,.66,.60,.52,.44,.36,.28,.20,.12,0];
export function islandPoint(angle,r){
  const contour=1+.075*Math.sin(angle*3+.6)+.035*Math.cos(angle*7)+.025*Math.sin(angle*13);
  const x=Math.cos(angle)*650*r*contour,z=Math.sin(angle)*285*r*contour;
  const profile=[[0,152],[.2,166],[.36,153],[.52,130],[.66,104],[.72,88],[.76,79],[.80,28],[.82,5],[.87,1.2],[.93,-.2],[.97,-1.9],[1,-3.1],[1.06,-7]];
  let y=-7;for(let i=1;i<profile.length;i++)if(r<=profile[i][0]){const [a,ay]=profile[i-1],[b,by]=profile[i];y=mix(ay,by,(r-a)/(b-a));break;}
  const interior=Math.max(0,1-r/.81),ridge=(62*Math.exp(-(((x+220)/150)**2))+110*Math.exp(-(((x-80)/125)**2))+45*Math.exp(-(((x-310)/90)**2)));
  y+=interior*ridge+Math.max(0,Math.min(1,(.84-r)*9))*Math.sin(r*Math.PI)*(.5+.5*Math.sin(angle*17+r*11))*18;
  if(y>5)y*=1+Math.min(1,r/.7)*(.10*Math.sin(angle*19)+.065*Math.cos(angle*37));
  return [x-55,y,z-650];
}
function island(){
  const s=surface();
  for(let i=0;i<224;i++)for(let row=0;row<ISLAND_RINGS.length-1;row++){
    const a=i/224*TAU,b=(i+1)/224*TAU,r=ISLAND_RINGS[row],nr=ISLAND_RINGS[row+1];
    const peak=islandPoint(a,r)[1]>195,shade=row<2?0x746d5c:row<5?0xc9b084:row<8?[0x4b5351,0x6b7060,0x404f46][row-5]:peak?0x586052:0x36553d;
    const color=new THREE.Color(shade).multiplyScalar(.88+.18*(.5+.5*Math.sin(a*13+row*.9)));
    s.quad(islandPoint(a,r),islandPoint(b,r),islandPoint(b,nr),islandPoint(a,nr),color);
  }
  const mesh=s.finish(material(.48));mesh.name='coastal-mainland';return mesh;
}
function forest(mat){
  const count=1200,crownGeo=new THREE.IcosahedronGeometry(1,0),trunkGeo=new THREE.CylinderGeometry(.25,.42,1,5),group=new THREE.Group();group.name='mainland-forest';
  const crowns=new THREE.InstancedMesh(crownGeo,mat,count*2),trunks=new THREE.InstancedMesh(trunkGeo,mat,count),dummy=new THREE.Object3D();
  // Vertex colour is white; the per-instance palette supplies foliage colour.
  for(const geo of [crownGeo,trunkGeo]){const colors=new Float32Array(geo.attributes.position.count*3);colors.fill(1);geo.setAttribute('color',new THREE.BufferAttribute(colors,3));}
  for(let i=0;i<count;i++){
    const a=random(i,1)*TAU,r=.38+random(i,2)*.35,[x,y,z]=islandPoint(a,r),height=7+random(i,3)*8,width=6+random(i,4)*5;
    dummy.position.set(x,y+height*.32,z);dummy.rotation.set(0,a,0);dummy.scale.set(1,height*.7,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);trunks.setColorAt(i,new THREE.Color(0x544d37));
    for(let j=0;j<2;j++){dummy.position.set(x+j*width*.5,y+height*(j?.7:.85),z+j*width*.15);dummy.scale.set(width,height*.55,width*.85);dummy.updateMatrix();crowns.setMatrixAt(i*2+j,dummy.matrix);crowns.setColorAt(i*2+j,new THREE.Color([0x29493c,0x385844,0x4c6946,0x547347][i%4]));}
  }
  for(const mesh of [crowns,trunks]){mesh.frustumCulled=false;group.add(mesh);}return group;
}
export function buildLandscapeBackdrop(scene,trackId){
  const group=new THREE.Group();group.name='landscape-backdrop';
  if(trackId==='desert')group.add(canyon());
  if(trackId==='coast'){group.add(island());group.add(forest(material(.48)));}
  if(group.children.length)scene.add(group);
  return group;
}
