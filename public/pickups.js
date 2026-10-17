import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WEAPON_IDS } from '../shared/combat.js';
export const PICKUP_COLORS = {
  pulse: 0xc329ff,
  rocket: 0xff1834,
  machinegun: 0xffdb00,
  shield: 0x00cfff,
  railgun: 0x3262ff,
  mine: 0x8aff00,
  chain: 0xfaf4dc,
  flame: 0xff7200,
  plasma: 0x00ed8a,
  shotgun: 0xff36b5,
  taser: 0x93ceff,
};
const cache = new Map();
// Models share immutable geometry/materials across all pickups on the course.
export function createPickupModel(kind) {
  if (!WEAPON_IDS.includes(kind)) throw Error(`Unknown pickup: ${kind}`);
  if (cache.has(kind)) return cache.get(kind).clone(true);
  const g = new THREE.Group(),
    color = PICKUP_COLORS[kind];
  g.name = `pickup-${kind}`;
  const metal = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.35,
    roughness: 0.42,
    metalness: 0.3,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.35),
    roughness: 0.5,
    metalness: 0.3,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).multiplyScalar(0.3),
    roughness: 0.5,
    metalness: 0.05,
    emissive: color,
    emissiveIntensity: 0.6,
    toneMapped: false,
  });
  const glow = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xcaa259,
    metalness: 0.55,
    roughness: 0.4,
  });
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const box = (x, y, z, w, h, d, mat = dark) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const tube = (x, y, z, r, length, mat = metal) => {
    const m = add(new THREE.CylinderGeometry(r, r, length, 12), mat, x, y, z);
    m.rotation.z = Math.PI / 2;
    return m;
  };
  const ring = (x, y, z, r, mat = accent) => {
    const m = add(new THREE.TorusGeometry(r, 0.08, 6, 20), mat, x, y, z);
    m.rotation.y = Math.PI / 2;
    return m;
  };
  const sphere = (x, y, z, r, mat = glow) => add(new THREE.SphereGeometry(r, 14, 10), mat, x, y, z);
  if (kind === 'rocket') {
    tube(0, 0, 0, 0.32, 1.9);
    const nose = add(new THREE.ConeGeometry(0.33, 0.75, 14), accent, 1.28, 0, 0);
    nose.rotation.z = -Math.PI / 2;
    tube(-1.05, 0, 0, 0.23, 0.35, dark);
    tube(0.5, 0, 0, 0.335, 0.16, accent);
    for (let i = 0; i < 4; i++) {
      const fin = box(-0.75, 0, 0, 0.7, 0.07, 1.15, accent);
      fin.rotation.x = (i * Math.PI) / 2;
    }
  } else if (kind === 'pulse') {
    sphere(0, 0, 0, 0.55, accent);
    for (let i = 0; i < 3; i++) {
      const r = ring(0, 0, 0, 0.9, metal);
      r.rotation.set((i * Math.PI) / 3, 0.6 + i * 0.8, 0.5);
    }
    for (const x of [-1, 1]) sphere(x, 0, 0, 0.17);
    box(0, -0.65, 0, 1, 0.2, 0.75, metal);
  } else if (kind === 'shield') {
    const shape = new THREE.Shape();
    shape.moveTo(-0.8, 0.8);
    shape.lineTo(0.8, 0.8);
    shape.lineTo(0.7, -0.35);
    shape.lineTo(0, -1);
    shape.lineTo(-0.7, -0.35);
    shape.closePath();
    const plate = add(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.2,
        bevelEnabled: true,
        bevelSize: 0.07,
        bevelThickness: 0.07,
        bevelSegments: 2,
        steps: 1,
      }),
      accent,
    );
    plate.position.z = -0.1;
    box(0, 0.05, 0.19, 0.16, 1.1, 0.08, metal);
    box(0, 0.3, 0.19, 1, 0.16, 0.08, metal);
    const bubble = sphere(
      0,
      0,
      0,
      1.2,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, depthWrite: false }),
    );
    bubble.castShadow = false;
  } else if (kind === 'mine') {
    add(new THREE.CylinderGeometry(0.8, 1, 0.35, 16), dark);
    add(new THREE.CylinderGeometry(0.6, 0.75, 0.22, 16), accent, 0, 0.24, 0);
    sphere(0, 0.47, 0, 0.18, new THREE.MeshBasicMaterial({ color: 0xff4633 }));
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const spike = add(
        new THREE.ConeGeometry(0.12, 0.42, 6),
        metal,
        Math.cos(a) * 0.8,
        0.15,
        Math.sin(a) * 0.8,
      );
      spike.rotation.z = -Math.cos(a) * 0.8;
      spike.rotation.x = Math.sin(a) * 0.8;
    }
  } else if (kind === 'chain') {
    sphere(0.6, -0.2, 0, 0.65, metal);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const spike = add(
        new THREE.ConeGeometry(0.13, 0.4, 6),
        dark,
        0.6 + Math.cos(a) * 0.64,
        -0.2 + Math.sin(a) * 0.64,
        0,
      );
      spike.rotation.z = a - Math.PI / 2;
    }
    for (let i = 0; i < 6; i++) {
      const link = add(
        new THREE.TorusGeometry(0.15, 0.045, 5, 10),
        metal,
        -0.15 - i * 0.21,
        0.05 + i * 0.15,
        0,
      );
      link.rotation.y = ((i % 2) * Math.PI) / 2;
    }
    box(-1.4, 0.94, 0, 0.25, 0.4, 0.3, accent);
  } else if (kind === 'shotgun') {
    // Car forward is +X. Three barrels on each side fire along ±Z.
    box(0, -0.15, 0, 1.25, 0.35, 0.8, dark);
    box(0, 0.08, 0, 1.35, 0.26, 0.65, brass);
    for (const side of [-1, 1])
      for (const x of [-0.43, 0, 0.43]) {
        const barrel = tube(x, 0.16, side * 0.92, 0.145, 1.45, metal);
        barrel.rotation.set(Math.PI / 2, 0, 0);
        const muzzle = tube(x, 0.16, side * 1.68, 0.19, 0.18, dark);
        muzzle.rotation.set(Math.PI / 2, 0, 0);
        const bore = tube(x, 0.16, side * 1.78, 0.105, 0.025, glow);
        bore.rotation.set(Math.PI / 2, 0, 0);
        const collar = tube(x, 0.16, side * 0.49, 0.2, 0.16, brass);
        collar.rotation.set(Math.PI / 2, 0, 0);
      }
    box(0, -0.34, 0, 0.8, 0.18, 0.7, metal);
  } else if (kind === 'taser') {
    const steel = metal;
    steel.color.setHex(0xd9e3ea);
    steel.emissive.setHex(0x000000);
    steel.metalness = 0.98;
    steel.roughness = 0.16;
    steel.envMapIntensity = 1.5;
    add(new THREE.CylinderGeometry(0.68, 0.82, 0.24, 20), dark, 0, -0.9, 0);
    add(new THREE.CylinderGeometry(0.14, 0.22, 1.55, 16), steel, 0, -0.03, 0);
    for (let i = 0; i < 5; i++)
      add(new THREE.TorusGeometry(0.3, 0.075, 8, 24), brass, 0, -0.62 + i * 0.17, 0).rotation.x =
        Math.PI / 2;
    sphere(0, 0.86, 0, 0.62, steel);
    sphere(0, 0.88, 0, 0.22, accent);
    add(new THREE.ConeGeometry(0.12, 0.7, 12), steel, 0, 1.55, 0);
    for (const side of [-1, 1]) {
      box(side * 0.47, -0.6, 0, 0.16, 0.5, 0.24, accent);
      sphere(side * 0.48, -0.24, 0, 0.1, glow);
    }
  } else {
    // Distinct silhouettes, not a generic crate or icon pretending to be a model.
    box(-0.25, 0, 0, 1.25, 0.48, 0.52);
    box(-0.8, -0.32, 0, 0.3, 0.55, 0.35);
    box(-1.25, 0, 0, 0.65, 0.32, 0.44, kind === 'shotgun' ? brass : accent);
    if (kind === 'machinegun') {
      tube(0.9, 0.05, 0, 0.14, 1.3, dark);
      tube(1.62, 0.05, 0, 0.22, 0.22, metal);
      box(-0.15, -0.5, 0, 0.45, 0.7, 0.28, metal);
      box(-0.2, 0.34, 0, 0.7, 0.12, 0.25, accent);
      for (let i = 0; i < 5; i++) tube(-0.55 + i * 0.22, 0.08, 0.38, 0.08, 0.28, brass);
    } else if (kind === 'railgun') {
      for (const z of [-0.3, 0.3]) {
        box(0.85, 0.08, z, 1.9, 0.17, 0.18, metal);
        box(0.85, 0.19, z, 1.7, 0.045, 0.08, glow);
      }
      for (let i = 0; i < 4; i++) ring(i * 0.3 - 0.1, 0, 0, 0.4);
      sphere(-0.65, 0.02, 0, 0.24);
    } else if (kind === 'flame') {
      tube(0.9, 0.04, 0, 0.22, 1.4, dark);
      tube(1.62, 0.04, 0, 0.3, 0.2, metal);
      for (const z of [-0.4, 0.4]) {
        const tank = add(new THREE.CapsuleGeometry(0.23, 0.7, 3, 10), accent, -0.65, 0.05, z);
        tank.rotation.z = Math.PI / 2;
      }
      const flame = add(new THREE.ConeGeometry(0.2, 0.6, 10), glow, 2, 0.04, 0);
      flame.rotation.z = -Math.PI / 2;
    } else if (kind === 'plasma') {
      sphere(0.4, 0.08, 0, 0.5, accent);
      ring(0.4, 0.08, 0, 0.61, metal);
      tube(1.06, 0.08, 0, 0.3, 0.65, dark);
      ring(1.43, 0.08, 0, 0.32, glow);
      box(-0.5, 0.35, 0, 0.55, 0.16, 0.35, glow);
    }
  }
  // A readable silhouette at phone scale, with the long axis used by the guns.
  const bounds = new THREE.Box3().setFromObject(g),
    size = bounds.getSize(new THREE.Vector3()),
    center = bounds.getCenter(new THREE.Vector3());
  for (const child of g.children) child.position.sub(center);
  g.scale.setScalar(3.3 / Math.max(size.x, size.y, size.z));
  g.userData.kind = kind;
  // Each material is one draw call, rather than one for every barrel, fin and ring.
  g.updateMatrixWorld(true);
  const parts = new Map(),
    batched = new THREE.Group();
  batched.name = g.name;
  batched.userData.kind = kind;
  g.traverse((mesh) => {
    if (!mesh.isMesh) return;
    let geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (geometry.index) {
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      geometry = flat;
    }
    if (!parts.has(mesh.material)) parts.set(mesh.material, []);
    parts.get(mesh.material).push(geometry);
  });
  for (const [material, geometries] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.geometry.userData.sharedCarResource = true;
    mesh.castShadow = !material.transparent;
    mesh.receiveShadow = true;
    batched.add(mesh);
    for (const geometry of geometries) geometry.dispose();
  }
  g.traverse((mesh) => {
    if (mesh.isMesh) mesh.geometry.dispose();
  });
  // Baked rotations tighten bounding boxes; keep the canonical pickup size.
  const mergedSize = new THREE.Box3().setFromObject(batched).getSize(new THREE.Vector3());
  batched.scale.setScalar(3.3 / Math.max(mergedSize.x, mergedSize.y, mergedSize.z));
  cache.set(kind, batched);
  return batched.clone(true);
}
