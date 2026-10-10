import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createPickupModel} from './pickups.js';
const cache=new Map();
// Build once per weapon, then share immutable geometry between cars. Each roof
// model is batched by material to avoid adding dozens of draw calls per car.
export function createCarWeaponModel(kind){
  if(!cache.has(kind)){
    const source=createPickupModel(kind),groups=new Map(),model=new THREE.Group();source.updateMatrixWorld(true);
    source.traverse(mesh=>{if(!mesh.isMesh)return;let geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);if(geometry.index){const flat=geometry.toNonIndexed();geometry.dispose();geometry=flat;}const geometries=groups.get(mesh.material)||[];geometries.push(geometry);groups.set(mesh.material,geometries);});
    for(const [material,geometries] of groups){const mesh=new THREE.Mesh(mergeGeometries(geometries),material);mesh.castShadow=!material.transparent;mesh.receiveShadow=true;model.add(mesh);for(const geometry of geometries)geometry.dispose();}
    model.scale.setScalar(.65);const bounds=new THREE.Box3().setFromObject(model);model.position.y=1.05-bounds.min.y;model.name=`car-weapon-${kind}`;cache.set(kind,model);
  }
  return cache.get(kind).clone(true);
}
export function syncCarWeapon(carGroup,car){
  const kind=car.item&&!car.eliminated&&!car.wrecked&&car.ammo>0?car.item:null;
  if(carGroup.userData.weaponKind===kind)return;
  if(carGroup.userData.weaponModel)carGroup.remove(carGroup.userData.weaponModel);
  const model=kind?createCarWeaponModel(kind):null;if(model)carGroup.add(model);
  carGroup.userData.weaponKind=kind;carGroup.userData.weaponModel=model;
}
