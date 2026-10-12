import * as THREE from 'three';
import {desertStormAt,stormCoverage} from '../shared/desert-storm.js';
export function createDustCloud({mobile=false}={}){
  const group=new THREE.Group();group.name='roving-dust-storm';let seed=8043;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const uniforms={time:{value:0},strength:{value:0}};
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false,
    uniforms,vertexShader:`varying vec2 vUv;varying float seed,fade;void main(){vUv=uv;seed=instanceMatrix[3].x*.071+instanceMatrix[3].z*.043;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);vec2 size=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));vec4 eye=center+vec4(position.xy*size,0.,0.);fade=smoothstep(4.,25.,-eye.z);gl_Position=projectionMatrix*eye;}`,
    fragmentShader:`uniform float time,strength;varying vec2 vUv;varying float seed,fade;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){vec2 p=vUv*2.-1.;float edge=1.-smoothstep(.2,1.,dot(p,p));vec2 drift=vec2(time*.09,time*-.045);float n=noise(vUv*4.+drift+seed)*.7+noise(vUv*9.-drift+seed)*.3;float alpha=edge*edge*(.04+n*.09)*strength*fade;gl_FragColor=vec4(mix(vec3(.40,.25,.12),vec3(.76,.55,.32),n),alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`});
  const clouds=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material,mobile?48:72),dummy=new THREE.Object3D();
  for(let i=0;i<clouds.count;i++){const a=random()*Math.PI*2,r=Math.sqrt(random())*.85;dummy.position.set(Math.cos(a)*r*220,8+random()*60,Math.sin(a)*r*150);const size=55+random()*85;dummy.scale.set(size*1.4,size,1);dummy.updateMatrix();clouds.setMatrixAt(i,dummy.matrix);}
  clouds.frustumCulled=false;clouds.renderOrder=3;group.add(clouds);
  const count=mobile?550:850,positions=new Float32Array(count*3);for(let i=0;i<count;i++){positions[i*3]=(random()-.5)*440;positions[i*3+1]=random()*65;positions[i*3+2]=(random()-.5)*300;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const grains=new THREE.Points(geometry,new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,uniforms:{...uniforms,pointScale:{value:600}},
    vertexShader:`uniform float time,pointScale;varying float alpha;void main(){vec3 p=mod(position+vec3(time*19.,-time*1.8,time*7.)+vec3(220.,0.,150.),vec3(440.,65.,300.))-vec3(220.,0.,150.);vec4 eye=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*eye;gl_PointSize=clamp(pointScale*.12/max(1.,-eye.z),1.,5.);alpha=(1.-smoothstep(.55,1.,length(p.xz/vec2(220.,150.))))*smoothstep(1.,7.,-eye.z);}`,
    fragmentShader:`uniform float strength;varying float alpha;void main(){vec2 p=gl_PointCoord*2.-1.;float shape=1.-smoothstep(.1,1.,dot(p,p));gl_FragColor=vec4(.84,.64,.40,shape*alpha*strength*.48);}`}));
  grains.frustumCulled=false;grains.renderOrder=4;group.add(grains);
  group.visible=false;
  return {group,clouds,grains,update(seconds,bufferHeight=600){const storm=desertStormAt(seconds);group.visible=storm.strength>0;group.position.set(storm.x,0,storm.z);uniforms.strength.value=storm.strength;uniforms.time.value=seconds;grains.material.uniforms.pointScale.value=bufferHeight;return storm;}};
}
export function stormHaze(storm,focus,height){
  const coverage=stormCoverage(storm,focus.x,focus.z);
  return {coverage,density:(.0045+.011*coverage)/Math.max(1,height/42)};
}
