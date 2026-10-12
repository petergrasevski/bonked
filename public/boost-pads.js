import * as THREE from 'three';
import {BOOST_PADS} from '../shared/game.js';
// Three instanced draws for the entire course, including the animated glow.
export function buildBoostPads(scene){
  const width=3.15,length=5;
  const chevronGeometry=new THREE.PlaneGeometry(length,width).rotateX(-Math.PI/2).translate(0,.065,0);
  const conveyor=new THREE.ShaderMaterial({uniforms:{phase:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
    vertexShader:`varying vec2 vLocal;varying vec3 vTint;void main(){vLocal=position.xz;vTint=instanceColor;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float phase;varying vec2 vLocal;varying vec3 vTint;void main(){float moving=step(.4,vTint.g);float band=mod(vLocal.x-phase*moving+abs(vLocal.y)*.85+5.,2.5);float line=1.-smoothstep(.11,.18,abs(band-1.25));float edge=1.-smoothstep(1.05,1.25,abs(vLocal.y));gl_FragColor=vec4(vTint,line*edge);}`});
  const base=new THREE.InstancedMesh(new THREE.BoxGeometry(length,.07,width),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.35,metalness:.1,transparent:true,opacity:.5,depthWrite:false}),BOOST_PADS.length);
  const chevrons=new THREE.InstancedMesh(chevronGeometry,conveyor,BOOST_PADS.length);
  const glow=new THREE.InstancedMesh(new THREE.PlaneGeometry(length+.6,width+.6).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x13bfff,transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),BOOST_PADS.length);
  const dummy=new THREE.Object3D();dummy.rotation.order='YXZ';
  for(const mesh of [base,chevrons,glow]){mesh.frustumCulled=false;mesh.userData.sceneryKind='boost-pads';scene.add(mesh);}
  const ready=new THREE.Color(0x79d5ff),off=new THREE.Color(0x122331),light=new THREE.Color(0x57eaff),dull=new THREE.Color(0x245068);
  const update=(state,now)=>{
    conveyor.uniforms.phase.value=padAnimationPhase(now);
    const statuses=new Map((state?.boostPads||[]).map(p=>[p.id,p]));
    for(let i=0;i<BOOST_PADS.length;i++){
      const p=BOOST_PADS[i],active=!state||(statuses.get(p.id)?.readyAt||0)<=(state.raceTime||0);
      dummy.position.set(p.x,p.y+.08,p.z);dummy.rotation.set(0,-p.angle,Math.atan(p.grade||0));dummy.scale.set(1,1,1);dummy.updateMatrix();
      base.setMatrixAt(i,dummy.matrix);chevrons.setMatrixAt(i,dummy.matrix);base.setColorAt(i,active?ready:off);chevrons.setColorAt(i,active?light:dull);
      dummy.position.y+=.012;dummy.scale.setScalar(active?1+.025*Math.sin(now*.004+i):0);dummy.updateMatrix();glow.setMatrixAt(i,dummy.matrix);
    }
    for(const mesh of [base,chevrons,glow]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  };
  update(null,0);return {update,base,chevrons,glow};
}

export const padAnimationPhase=now=>(Math.floor(now*3/1000)%3)*(2.5/3);
