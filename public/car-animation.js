import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export const WHEEL_CENTERS=[[-1.48,.365,-.91],[-1.48,.365,.91],[1.43,.365,-.91],[1.43,.365,.91]];
const dummy=new THREE.Object3D();
// Two instanced draws for four independent wheels. Chassis and wheel buffers
// stay shared between drivers; only instance matrices belong to each car.
export function createWheelAssembly(rubber){
  const group=new THREE.Group();group.name='wheel-assembly';
  const tyre=new THREE.TorusGeometry(.285,.075,12,32);tyre.scale(1,1,1.8);
  const parts=[];
  const add=(geometry,x,y,z,colour,rotation=0)=>{
    const count=geometry.attributes.position.count,c=new THREE.Color(colour),colors=new Float32Array(count*3);
    for(let i=0;i<count;i++)colors.set([c.r,c.g,c.b],i*3);
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.rotateZ(rotation);geometry.translate(x,y,z);
    if(geometry.index){const flat=geometry.toNonIndexed();geometry.dispose();geometry=flat;}parts.push(geometry);
  };
  for(const side of [-1,1]){
    const disc=new THREE.CylinderGeometry(.235,.235,.02,24);disc.rotateX(Math.PI/2);add(disc,0,0,side*.112,0x24313b);
    add(new THREE.TorusGeometry(.225,.018,6,32),0,0,side*.134,0xd9e2e7);
    const hub=new THREE.CylinderGeometry(.062,.062,.032,12);hub.rotateX(Math.PI/2);add(hub,0,0,side*.13,0xe1eaf0);
    for(let j=0;j<5;j++){const a=j*Math.PI*2/5;add(new THREE.BoxGeometry(.185,.025,.025),Math.cos(a)*.127,Math.sin(a)*.127,side*.13,0xb8cad8,a);}
  }
  const rim=mergeGeometries(parts);parts.forEach(g=>g.dispose());
  const rims=new THREE.InstancedMesh(rim,new THREE.MeshStandardMaterial({vertexColors:true,metalness:.8,roughness:.28}),4);
  const tyres=new THREE.InstancedMesh(tyre,rubber,4);tyres.name='rolling-tyres';rims.name='rolling-rims';
  for(const mesh of [tyres,rims]){mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
  setWheelMatrices(group,0,0);return group;
}
function setWheelMatrices(group,steer,spin){
  for(let i=0;i<4;i++){
    dummy.position.set(...WHEEL_CENTERS[i]);dummy.scale.set(1,1,1);dummy.rotation.order='YXZ';dummy.rotation.set(0,i>=2?-steer*.48:0,spin);dummy.updateMatrix();
    for(const mesh of group.children)mesh.setMatrixAt(i,dummy.matrix);
  }
  for(const mesh of group.children){mesh.instanceMatrix.needsUpdate=true;mesh.boundingSphere=null;mesh.boundingBox=null;}
}
export function attachHeadlights(car){
  // One shadow-free combined beam illuminates the road for both headlamps.
  const light=new THREE.SpotLight(0xc7eaff,90,30,.38,.7,1.25);light.name='ice-headlight';light.position.set(2.1,.62,0);
  const target=new THREE.Object3D();target.position.set(16,-.45,0);car.add(light,target);light.target=target;
  car.userData.headlight=light;
}
export function updateCarVisuals(car,pose,dt){
  const steer=Math.max(-1,Math.min(1,Number.isFinite(pose.steering)?pose.steering:pose.input?.steer||0));
  const speed=(pose.vx||0)*Math.cos(pose.angle||0)+(pose.vz||0)*Math.sin(pose.angle||0);
  const active=!pose.wrecked&&!pose.eliminated;
  car.userData.wheelSpin=((car.userData.wheelSpin||0)-speed*Math.max(0,Math.min(.1,dt))/.36)%(Math.PI*2);
  const wheels=car.getObjectByName('wheel-assembly');if(wheels)setWheelMatrices(wheels,active?steer:0,car.userData.wheelSpin);
  const braking=active&&!!(pose.input?.reverse||pose.input?.brake||speed<-.15);
  car.userData.braking=braking;
  if(car.userData.rearLights)car.userData.rearLights.emissiveIntensity=braking?5.5:.35;
  const headlights=!!car.userData.headlight&&active;
  if(car.userData.headlight)car.userData.headlight.intensity=headlights?90:0;
  if(car.userData.headlamps)car.userData.headlamps.emissiveIntensity=headlights?5:.12;
}
