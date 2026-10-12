import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CRABS} from '../shared/game.js';
import {crabState} from '../shared/coastal-crabs.js';

// Eight articulated crabs use three instanced draws: shells, eyes and legs.
export function createCrabParts(){
  const shells=[],eyes=[];
  const ball=(bucket,x,y,z,sx,sy,sz)=>{const g=new THREE.SphereGeometry(1,12,8);g.scale(sx,sy,sz);g.translate(x,y,z);bucket.push(g);};
  ball(shells,0,.65,0,.83,.44,.9);
  ball(shells,-.2,.77,0,.63,.29,.76);
  for(const side of [-1,1]){
    ball(shells,.56,1.06,side*.43,.09,.36,.09);
    ball(eyes,.58,1.37,side*.43,.15,.16,.15);
    ball(shells,.83,.62,side*.9,.45,.13,.16);
    ball(shells,1.09,.78,side*1.13,.35,.24,.29);
    // Open pincers with separate tips and a readable gap.
    for(const jaw of [-1,1])ball(shells,1.38,.79,side*1.13+jaw*.18,.32,.12,.095);
    for(let i=0;i<3;i++)ball(shells,-.4+i*.3,.99,side*.45,.075,.065,.075);
  }
  const leg=[];
  const bone=(a,b,r1,r2)=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),dir=bv.clone().sub(av);const g=new THREE.CylinderGeometry(r1,r2,dir.length(),6);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()));g.translate(...av.add(bv).multiplyScalar(.5).toArray());leg.push(g);};
  bone([0,0,0],[.18,.14,.53],.095,.13);bone([.18,.14,.53],[.33,-.42,.93],.045,.095);
  const merge=parts=>{const geo=mergeGeometries(parts);for(const p of parts)p.dispose();return geo;};
  return [{geometry:merge(shells),color:0xc9562c,name:'shell'},{geometry:merge(eyes),color:0x141e25,name:'eyes'},{geometry:merge(leg),color:0xb94725,name:'legs'}];
}
export function buildCoastalCrabs(scene){
  const descriptors=CRABS.map(c=>({...c})),group=new THREE.Group();group.name='coastal-crabs';
  const parts=createCrabParts().map((part,i)=>{const mesh=new THREE.InstancedMesh(part.geometry,new THREE.MeshStandardMaterial({color:part.color,roughness:i===1?.2:.38,metalness:.12}),descriptors.length*(i===2?8:1));mesh.name=`crab-${part.name}`;mesh.castShadow=true;mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;group.add(mesh);return mesh;});
  group.userData={descriptors,parts,dummy:new THREE.Object3D(),root:new THREE.Object3D(),matrix:new THREE.Matrix4()};scene.add(group);updateCoastalCrabs(group,0);return group;
}
export function updateCoastalCrabs(group,seconds){
  const {descriptors,parts,dummy,root,matrix}=group.userData;
  descriptors.forEach((crab,i)=>{
    const pose=crabState(crab,seconds),scale=pose.visible?1:0;
    root.position.set(pose.x,pose.y+(pose.moving?Math.sin(seconds*48+i)*.045:0),pose.z);root.rotation.set(0,-pose.angle,0);root.scale.setScalar(scale);root.updateMatrix();
    parts[0].setMatrixAt(i,root.matrix);parts[1].setMatrixAt(i,root.matrix);
    for(let side=0;side<2;side++)for(let leg=0;leg<4;leg++){
      const sign=side?1:-1,phase=seconds*32+leg*Math.PI*.8+side*Math.PI;
      dummy.position.set(-.62+leg*.35,.48,sign*.6);dummy.rotation.set(Math.sin(phase)*.22,side?0:Math.PI,Math.cos(phase)*.16);dummy.scale.setScalar(1);dummy.updateMatrix();matrix.multiplyMatrices(root.matrix,dummy.matrix);parts[2].setMatrixAt(i*8+side*4+leg,matrix);
    }
  });
  for(const part of parts)part.instanceMatrix.needsUpdate=true;
}
