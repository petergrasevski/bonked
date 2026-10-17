import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CRABS } from '../shared/game.js';
import { crabState } from '../shared/coastal-crabs.js';

// Twelve articulated crabs use three instanced draws: shells, eyes and legs.
export function createCrabParts() {
  const shells = [],
    eyes = [];
  const ball = (bucket, x, y, z, sx, sy, sz) => {
    const g = new THREE.SphereGeometry(1, 12, 8);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    bucket.push(g);
  };
  ball(shells, 0, 0.65, 0, 0.83, 0.44, 0.9);
  ball(shells, -0.2, 0.77, 0, 0.63, 0.29, 0.76);
  for (const side of [-1, 1]) {
    ball(shells, 0.56, 1.06, side * 0.43, 0.09, 0.36, 0.09);
    ball(eyes, 0.58, 1.37, side * 0.43, 0.15, 0.16, 0.15);
    ball(shells, 0.83, 0.62, side * 0.9, 0.45, 0.13, 0.16);
    ball(shells, 1.09, 0.78, side * 1.13, 0.35, 0.24, 0.29);
    // Open pincers with separate tips and a readable gap.
    for (const jaw of [-1, 1])
      ball(shells, 1.38, 0.79, side * 1.13 + jaw * 0.18, 0.32, 0.12, 0.095);
    for (let i = 0; i < 3; i++)
      ball(shells, -0.4 + i * 0.3, 0.99, side * 0.45, 0.075, 0.065, 0.075);
  }
  const leg = [];
  const bone = (a, b, r1, r2) => {
    const av = new THREE.Vector3(...a),
      bv = new THREE.Vector3(...b),
      dir = bv.clone().sub(av);
    const g = new THREE.CylinderGeometry(r1, r2, dir.length(), 6);
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()),
    );
    g.translate(...av.add(bv).multiplyScalar(0.5).toArray());
    leg.push(g);
  };
  bone([0, 0, 0], [0.18, 0.14, 0.53], 0.095, 0.13);
  bone([0.18, 0.14, 0.53], [0.33, -0.42, 0.93], 0.045, 0.095);
  const merge = (parts) => {
    const geo = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    return geo;
  };
  return [
    { geometry: merge(shells), color: 0xc9562c, name: 'shell' },
    { geometry: merge(eyes), color: 0x141e25, name: 'eyes' },
    { geometry: merge(leg), color: 0xb94725, name: 'legs' },
  ];
}
export function buildCoastalCrabs(scene) {
  const descriptors = CRABS.map((c) => ({ ...c })),
    group = new THREE.Group();
  group.name = 'coastal-crabs';
  const parts = createCrabParts().map((part, i) => {
    const mesh = new THREE.InstancedMesh(
      part.geometry,
      new THREE.MeshStandardMaterial({
        color: part.color,
        roughness: i === 1 ? 0.2 : 0.38,
        metalness: 0.12,
      }),
      descriptors.length * (i === 2 ? 8 : 1),
    );
    mesh.name = `crab-${part.name}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  });
  group.userData = {
    descriptors,
    parts,
    dummy: new THREE.Object3D(),
    root: new THREE.Object3D(),
    matrix: new THREE.Matrix4(),
    frustum: new THREE.Frustum(),
    projection: new THREE.Matrix4(),
    bounds: new THREE.Sphere(new THREE.Vector3(), 20),
  };
  scene.add(group);
  updateCoastalCrabs(group, 0);
  return group;
}
export function updateCoastalCrabs(group, seconds, camera = null) {
  const { descriptors, parts, dummy, root, matrix, frustum, projection, bounds } = group.userData;
  if (camera)
    frustum.setFromProjectionMatrix(
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
  let visible = 0;
  descriptors.forEach((crab, i) => {
    const pose = crabState(crab, seconds),
      scale = pose.visible ? 1 : 0;
    if (camera) {
      bounds.center.set(pose.x, pose.y, pose.z);
      if (!pose.visible || !frustum.intersectsSphere(bounds)) return;
    }
    const slot = camera ? visible++ : i;
    root.position.set(
      pose.x,
      pose.y + (pose.moving ? Math.sin(seconds * 48 + i) * 0.045 : 0),
      pose.z,
    );
    root.rotation.set(0, -pose.angle, 0);
    root.scale.setScalar(scale);
    root.updateMatrix();
    parts[0].setMatrixAt(slot, root.matrix);
    parts[1].setMatrixAt(slot, root.matrix);
    for (let side = 0; side < 2; side++)
      for (let leg = 0; leg < 4; leg++) {
        const sign = side ? 1 : -1,
          phase = seconds * 32 + leg * Math.PI * 0.8 + side * Math.PI;
        dummy.position.set(-0.62 + leg * 0.35, 0.48, sign * 0.6);
        dummy.rotation.set(Math.sin(phase) * 0.22, side ? 0 : Math.PI, Math.cos(phase) * 0.16);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        matrix.multiplyMatrices(root.matrix, dummy.matrix);
        parts[2].setMatrixAt(slot * 8 + side * 4 + leg, matrix);
      }
  });
  parts.forEach((part, i) => {
    part.count = (camera ? visible : descriptors.length) * (i === 2 ? 8 : 1);
    part.instanceMatrix.needsUpdate = true;
  });
}
