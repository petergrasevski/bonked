import * as THREE from 'three';
// Split large road/terrain ribbons by triangle, so a whole circuit cannot remain
// in one visible batch merely because its bounding sphere overlaps the camera.
export function spatialPieces(geometry,size=70){
  geometry.computeBoundingBox();const span=geometry.boundingBox.getSize(new THREE.Vector3());
  if(Math.max(span.x,span.z)<=size*2)return [geometry];
  const source=geometry.index?geometry.toNonIndexed():geometry,position=source.attributes.position,buckets=new Map();
  for(let i=0;i<position.count;i+=3){const key=`${Math.floor((position.getX(i)+position.getX(i+1)+position.getX(i+2))/(3*size))}:${Math.floor((position.getZ(i)+position.getZ(i+1)+position.getZ(i+2))/(3*size))}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i,i+1,i+2);}
  const result=[];
  for(const indices of buckets.values()){const piece=new THREE.BufferGeometry();for(const [name,attribute]of Object.entries(source.attributes)){const data=new Float32Array(indices.length*attribute.itemSize);indices.forEach((index,i)=>{for(let c=0;c<attribute.itemSize;c++)data[i*attribute.itemSize+c]=attribute.array[index*attribute.itemSize+c];});piece.setAttribute(name,new THREE.BufferAttribute(data,attribute.itemSize));}piece.computeBoundingBox();result.push(piece);}
  if(source!==geometry)source.dispose();geometry.dispose();return result;
}
export function simplifyDecorations(geometry,cell){
  const source=geometry.index?geometry.toNonIndexed():geometry,p=source.attributes.position,vertices=[],clusters=new Map(),remap=[];
  for(let i=0;i<p.count;i++){
    const key=`${Math.round(p.getX(i)/cell)},${Math.round(p.getY(i)/cell)},${Math.round(p.getZ(i)/cell)}`;let cluster=clusters.get(key);
    if(!cluster){cluster={index:vertices.length,count:0,values:Object.fromEntries(Object.entries(source.attributes).filter(([name])=>name!=='normal').map(([name,a])=>[name,new Array(a.itemSize).fill(0)]))};clusters.set(key,cluster);vertices.push(cluster);}
    cluster.count++;for(const [name,values]of Object.entries(cluster.values)){const a=source.attributes[name];for(let c=0;c<a.itemSize;c++)values[c]+=a.array[i*a.itemSize+c];}remap.push(cluster.index);
  }
  const indices=[];for(let i=0;i<remap.length;i+=3){const [a,b,c]=remap.slice(i,i+3);if(a!==b&&a!==c&&b!==c)indices.push(a,b,c);}
  const result=new THREE.BufferGeometry();result.setIndex(indices);
  for(const [name,a]of Object.entries(source.attributes)){if(name==='normal')continue;const values=vertices.flatMap(v=>v.values[name].map(n=>n/v.count));result.setAttribute(name,new THREE.Float32BufferAttribute(values,a.itemSize));}
  result.computeVertexNormals();result.computeBoundingSphere();if(source!==geometry)source.dispose();return result;
}
export function prepareSceneryLOD(mesh){
  const original=mesh.geometry;original.computeBoundingSphere();mesh.userData.lodBounds=original.boundingSphere.clone();
  mesh.userData.detailLevels=[original,simplifyDecorations(original,.4),simplifyDecorations(original,1.)];mesh.userData.detailLevel=0;
}
export function updateSceneryLOD(mesh,camera){
  const bounds=mesh.userData.lodBounds;if(!bounds)return;
  const distance=Math.max(0,camera.position.distanceTo(bounds.center)-bounds.radius),old=mesh.userData.detailLevel;
  // Small hysteresis prevents switching back and forth around a boundary.
  const level=distance>(old===2?170:185)?2:distance>(old>0?95:110)?1:0;
  if(level!==old){mesh.geometry=mesh.userData.detailLevels[level];mesh.userData.detailLevel=level;}
}

// Instance batches need spatial bounds too: one forest-wide batch submits every
// tree even when only one corner touches the camera frustum.
export function spatialInstances(mesh,size=70){
  const cells=new Map(),matrix=new THREE.Matrix4(),color=new THREE.Color();
  for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);const e=matrix.elements,key=`${Math.floor(e[12]/size)}:${Math.floor(e[14]/size)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);}
  const batches=[];
  for(const indices of cells.values()){
    const batch=new THREE.InstancedMesh(mesh.geometry,mesh.material,indices.length);batch.name=mesh.name;batch.castShadow=mesh.castShadow;batch.receiveShadow=mesh.receiveShadow;batch.position.copy(mesh.position);batch.quaternion.copy(mesh.quaternion);batch.scale.copy(mesh.scale);
    indices.forEach((index,i)=>{mesh.getMatrixAt(index,matrix);batch.setMatrixAt(i,matrix);if(mesh.instanceColor){mesh.getColorAt(index,color);batch.setColorAt(i,color);}});
    batch.computeBoundingSphere();batch.computeBoundingBox();batches.push(batch);
  }
  mesh.dispose();return batches;
}
