import * as THREE from 'three';
import {BOOST_PADS} from '../shared/game.js';
// Three instanced draws for the entire course, including the animated glow.
export function buildBoostPads(scene){
  const width=3.15,length=5,vertices=[];
  for(const x of [-1.15,1.05]){
    const points=[[x-.7,-1.15],[x+.55,0],[x-.7,1.15],[x-.25,1.15],[x+1,0],[x-.25,-1.15]];
    for(const ids of [[0,1,5],[1,4,5],[1,2,3],[1,3,4]])for(const i of ids)vertices.push(points[i][0],.065,points[i][1]);
  }
  const chevronGeometry=new THREE.BufferGeometry();chevronGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));chevronGeometry.computeVertexNormals();
  const base=new THREE.InstancedMesh(new THREE.BoxGeometry(length,.07,width),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.35,metalness:.4}),BOOST_PADS.length);
  const chevrons=new THREE.InstancedMesh(chevronGeometry,new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false}),BOOST_PADS.length);
  const glow=new THREE.InstancedMesh(new THREE.PlaneGeometry(length+.6,width+.6).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x13bfff,transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),BOOST_PADS.length);
  const dummy=new THREE.Object3D();dummy.rotation.order='YXZ';
  for(const mesh of [base,chevrons,glow]){mesh.frustumCulled=false;mesh.userData.sceneryKind='boost-pads';scene.add(mesh);}
  const ready=new THREE.Color(0x102f5a),off=new THREE.Color(0x122331),light=new THREE.Color(0x57eaff),dull=new THREE.Color(0x245068);
  const update=(state,now)=>{
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
