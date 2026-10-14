import * as THREE from 'three';
import {ROAD_WIDTH} from '../shared/game.js';
// Shared by the race and the live How to play preview.
export function createEliminationLine(){
  const group=new THREE.Group();group.name='elimination-line';
  const add=(geometry,material,y,z=0)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(0,y,z);group.add(mesh);return mesh;};
  add(new THREE.BoxGeometry(1.2,.12,ROAD_WIDTH+2),new THREE.MeshBasicMaterial({color:0xff514f}),.15);
  add(new THREE.BoxGeometry(.1,4,ROAD_WIDTH+2),new THREE.MeshBasicMaterial({color:0xff443d,transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false}),2);
  for(const side of [-1,1])add(new THREE.CylinderGeometry(.15,.15,4,6),new THREE.MeshStandardMaterial({color:0xff514f}),2,side*(ROAD_WIDTH/2+1));
  return group;
}
