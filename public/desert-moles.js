import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MOLES } from '../shared/game.js';
import { moleState } from '../shared/desert-features.js';

// A whole mole field uses five shared model draws, plus one instanced dirt draw.
// The small surfaces (eyes, claws, ears) retain their silhouette without textures.
export function createMoleParts() {
  const buckets = Array.from({ length: 5 }, () => []);
  const add = (group, geometry, x, y, z, sx = 1, sy = 1, sz = 1, angle = 0) => {
    geometry.scale(sx, sy, sz);
    if (angle) geometry.rotateZ(angle);
    geometry.translate(x, y, z);
    const expanded = geometry.index ? geometry.toNonIndexed() : geometry;
    buckets[group].push(expanded);
    if (expanded !== geometry) geometry.dispose();
  };
  const ball = (group, x, y, z, sx, sy, sz, segments = 12, rings = 7) =>
    add(group, new THREE.SphereGeometry(1, segments, rings), x, y, z, sx, sy, sz);
  ball(0, -0.2, 1.0, 0, 0.88, 1.04, 1.0, 14, 8);
  ball(0, 0.27, 1.72, 0, 0.75, 0.73, 0.76, 14, 8);
  for (const side of [-1, 1]) {
    ball(0, -0.08, 2.03, side * 0.65, 0.22, 0.27, 0.2, 10, 6);
    ball(2, 0.065, 2.055, side * 0.68, 0.08, 0.155, 0.125, 8, 5);
    ball(1, 0.4, 0.23, side * 0.92, 0.51, 0.22, 0.32, 10, 6);
    for (let i = -1; i <= 1; i++)
      add(
        4,
        new THREE.ConeGeometry(0.072, 0.3, 6),
        0.89,
        0.17,
        side * 0.92 + i * 0.17,
        1,
        1,
        1,
        -Math.PI / 2,
      );
    ball(3, 0.86, 1.88, side * 0.49, 0.1, 0.115, 0.1, 10, 6);
    ball(4, 0.937, 1.93, side * 0.49, 0.028, 0.028, 0.028, 6, 4);
  }
  ball(1, 0.96, 1.6, 0, 0.53, 0.31, 0.36, 12, 7);
  ball(2, 1.46, 1.63, 0, 0.15, 0.145, 0.2, 10, 6);
  for (const side of [-1, 1]) ball(3, 1.587, 1.64, side * 0.078, 0.018, 0.026, 0.025, 6, 4);
  // Small fur tufts break up the rounded back, all within the collision footprint.
  for (let i = 0; i < 4; i++)
    add(
      0,
      new THREE.ConeGeometry(0.15, 0.34, 5),
      -0.64 + i * 0.22,
      1.97 + Math.sin(i * 0.7) * 0.15,
      0,
      1,
      1,
      1,
      0.3,
    );
  const colors = [0x674537, 0x96745a, 0xc28b7c, 0x181b1c, 0xd8c59c];
  return buckets.map((geometries, i) => {
    const geometry = mergeGeometries(geometries);
    for (const source of geometries) source.dispose();
    geometry.computeBoundingSphere();
    return {
      geometry,
      material: new THREE.MeshStandardMaterial({
        color: colors[i],
        roughness: i === 3 ? 0.18 : 0.88,
        metalness: 0,
      }),
      name: ['fur', 'muzzle-paws', 'nose-ears', 'eyes', 'claws'][i],
    };
  });
}

export function buildDesertMoles(world) {
  const group = new THREE.Group();
  group.name = 'desert-moles';
  const descriptors = MOLES.map((m) => ({ ...m }));
  group.userData = {
    descriptors,
    parts: [],
    matrix: new THREE.Matrix4(),
    position: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
  };
  if (!descriptors.length) return group;
  const rimGeometry = new THREE.RingGeometry(1.35, 1.91, 28, 2);
  rimGeometry.rotateX(-Math.PI / 2);
  const rp = rimGeometry.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const a = Math.atan2(rp.getZ(i), rp.getX(i)),
      r = 1 + 0.055 * Math.sin(a * 7) + 0.025 * Math.cos(a * 11);
    rp.setX(i, rp.getX(i) * r);
    rp.setZ(i, rp.getZ(i) * r);
  }
  rimGeometry.computeVertexNormals();
  const holeGeometry = new THREE.CircleGeometry(1.39, 28);
  holeGeometry.rotateX(-Math.PI / 2);
  for (const mole of descriptors) {
    const rim = world.mesh(rimGeometry, 0x98714e, mole.x, mole.y + 0.024, mole.z);
    rim.userData.sceneryKind = 'mole-rim';
    const hole = world.mesh(holeGeometry, 0x28211d, mole.x, mole.y + 0.027, mole.z);
    hole.userData.sceneryKind = 'mole-hole';
  }
  const bounds = new THREE.Box3();
  for (const m of descriptors) {
    bounds.expandByPoint(new THREE.Vector3(m.x - 3, m.y - 3, m.z - 3));
    bounds.expandByPoint(new THREE.Vector3(m.x + 3, m.y + 3, m.z + 3));
  }
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  for (const part of createMoleParts()) {
    const instances = new THREE.InstancedMesh(part.geometry, part.material, descriptors.length);
    instances.name = `mole-${part.name}`;
    instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instances.castShadow = true;
    instances.receiveShadow = true;
    instances.boundingSphere = sphere.clone();
    instances.boundingBox = bounds.clone();
    group.add(instances);
    group.userData.parts.push(instances);
  }
  const dirt = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.12, 0),
    new THREE.MeshStandardMaterial({ color: 0x98714e, roughness: 1 }),
    descriptors.length * 5,
  );
  dirt.name = 'mole-warning-dirt';
  dirt.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dirt.boundingSphere = sphere.clone();
  dirt.boundingBox = bounds.clone();
  group.add(dirt);
  group.userData.dirt = dirt;
  updateDesertMoles(group, 0);
  world.scene.add(group);
  return group;
}

export function updateDesertMoles(group, raceSeconds) {
  if (!group?.userData.descriptors?.length) return;
  const { descriptors, parts, dirt, matrix, position, rotation, scale, up } = group.userData;
  for (let i = 0; i < descriptors.length; i++) {
    const mole = descriptors[i],
      state = moleState(mole, raceSeconds),
      rise = state.rise;
    const visible = rise > 0 ? 1 : 0;
    position.set(mole.x, mole.y + (rise - 1) * mole.height, mole.z);
    rotation.setFromAxisAngle(up, -mole.angle);
    scale.setScalar(visible);
    matrix.compose(position, rotation, scale);
    for (const part of parts) part.setMatrixAt(i, matrix);
    for (let j = 0; j < 5; j++) {
      const angle = (j * Math.PI * 2) / 5 + i * 0.7,
        pulse = Math.sin(raceSeconds * 29 + j * 2.1 + i),
        show = state.warning ? 1 : 0;
      position.set(
        mole.x + Math.cos(angle) * (1.38 + pulse * 0.035),
        mole.y + 0.08 + Math.abs(pulse) * 0.13,
        mole.z + Math.sin(angle) * (1.38 + pulse * 0.035),
      );
      rotation.setFromAxisAngle(up, angle + raceSeconds * 2);
      scale.setScalar(show * (0.7 + j * 0.08));
      matrix.compose(position, rotation, scale);
      dirt.setMatrixAt(i * 5 + j, matrix);
    }
  }
  for (const part of parts) part.instanceMatrix.needsUpdate = true;
  dirt.instanceMatrix.needsUpdate = true;
}
