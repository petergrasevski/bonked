import * as THREE from 'three';
import {SEGMENTS} from '../shared/game.js';
function meshGeometry(vertices,uv){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));if(uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;}
export function buildIceShelf(w){
  const shade=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:true,uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog)},
    vertexShader:`varying vec2 vShelfUv;
      #include <fog_pars_vertex>
      void main(){vShelfUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,fragmentShader:`varying vec2 vShelfUv;
      #include <fog_pars_fragment>
      void main(){gl_FragColor=vec4(.12,.24,.34,.31*pow(1.-vShelfUv.y,2.));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
      }`});
  for(const side of [-1,1])for(let start=0;start<SEGMENTS.length;start+=40){
    const bands=[[],[],[]],shadow=[],uv=[];
    for(let i=start;i<Math.min(start+40,SEGMENTS.length);i++){
      const a=SEGMENTS[i],b=SEGMENTS[(i+1)%SEGMENTS.length];
      const point=(p,offset,y)=>[p.x+p.nx*(p.halfWidth+.6+offset)*side,y,p.z+p.nz*(p.halfWidth+.6+offset)*side];
      const levels=[a.y-.17,a.y-.55,a.y-2.2,-4.05];
      for(let j=0;j<3;j++){
        const corners=[point(a,0,levels[j]),point(b,0,levels[j]),point(a,j===2?.25:0,levels[j+1]),point(b,j===2?.25:0,levels[j+1])];
        for(const k of (side===1?[0,1,2,1,3,2]:[0,2,1,1,2,3]))bands[j].push(...corners[k]);
      }
      const corners=[point(a,.12,-3.97),point(a,4.2,-3.97),point(b,.12,-3.97),point(b,4.2,-3.97)];
      for(const k of [0,1,2,1,3,2]){shadow.push(...corners[k]);uv.push(0,k%2);}
    }
    bands.forEach((v,i)=>{const material=w.mat([0xb8e2ec,0x6298ae,0x3f718c][i],.8);material.side=THREE.DoubleSide;w.mesh(meshGeometry(v),material);});
    const contact=new THREE.Mesh(meshGeometry(shadow,uv),shade);contact.renderOrder=1;w.scene.add(contact);
  }
}
