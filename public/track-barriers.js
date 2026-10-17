import * as THREE from 'three';
// Short, shared-material pieces are folded into the world's spatial static batches.
export function buildTrackBarrier(w, biome, a, b, index = 0) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z,
    length = Math.hypot(dx, dy, dz);
  if (length < 0.001) return;
  const group = new THREE.Group();
  group.position.set(a.x, a.y, a.z);
  group.quaternion.setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(dx, dy, dz).normalize(),
  );
  w.static.add(group);
  if (['factory', 'volcano'].includes(biome)) {
    const factory = biome === 'factory',
      base = factory ? 0x344a58 : 0x423b45,
      accent = factory ? 0xe0ad49 : 0xd98d59;
    if (factory) {
      for (const y of [0.45, 1.05]) w.box(length / 2, y, 0, length + 0.04, 0.18, 0.18, base, group);
      w.box(0, 0.65, 0, 0.2, 1.3, 0.24, base, group);
      w.box(length / 2, 1.24, 0, length, 0.13, 0.24, accent, group);
      if (index % 8 === 0)
        w.box(length / 2, 0.7, 0, Math.min(length, 1.2), 0.55, 0.25, accent, group);
    } else {
      w.box(length / 2, 0.5, 0, length + 0.04, 1, 0.6, base, group);
      w.box(length / 2, 1.05, 0, length + 0.08, 0.17, 0.73, accent, group);
      if (index % 6 === 0) {
        w.box(0, 0.75, 0, 0.85, 1.5, 0.85, base, group);
        w.box(0, 1.55, 0, 1, 0.15, 1, accent, group);
      }
    }
  } else if (biome === 'ice') {
    if (!w.iceBarrierMaterial)
      w.iceBarrierMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x9dd4e4,
        roughness: 0.28,
        metalness: 0,
        clearcoat: 0.65,
        clearcoatRoughness: 0.2,
        envMapIntensity: 0.8,
      });
    const blocks = Math.max(1, Math.ceil(length / 2.4)),
      span = length / blocks;
    for (let row = 0; row < 2; row++) {
      // Staggered mortar seams make the barrier read as quarried ice blocks.
      const cuts = [0];
      for (let x = (row ? 0.5 : 1) * span; x < length - 0.01; x += span) cuts.push(x);
      cuts.push(length);
      for (let j = 0; j < cuts.length - 1; j++) {
        const start = cuts[j],
          end = cuts[j + 1],
          center = (start + end) / 2;
        w.box(
          center,
          0.34 + row * 0.63,
          0,
          Math.max(0.03, end - start - 0.045),
          0.59,
          0.61,
          w.iceBarrierMaterial,
          group,
        );
        if ((index + j + row) % 3 === 0) {
          const crack = w.box(
            center,
            0.34 + row * 0.63,
            -0.31,
            0.025,
            0.38,
            0.012,
            0x538d9f,
            group,
          );
          crack.rotation.z = 0.24;
        }
      }
    }
    w.box(length / 2, 1.29, 0, length, 0.1, 0.68, 0xe8f5fa, group);
  } else {
    const wood = w.mat(0x705037, 0.98),
      light = w.mat(0x96714d, 0.96),
      iron = w.mat(0x423d35, 0.9);
    for (const y of [0.42, 1.02])
      w.box(length / 2, y, 0, length + 0.055, 0.22, 0.2, index % 4 === 0 ? light : wood, group);
    w.box(0, 0.7, 0, 0.24, 1.4, 0.29, wood, group);
    for (const y of [0.42, 1.02])
      for (const side of [-1, 1]) w.box(0.02, y, side * 0.155, 0.075, 0.065, 0.025, iron, group);
    // Sparse diagonal braces and split grain, without costly individual textures.
    if (index % 8 === 0) {
      const brace = w.box(
        length / 2,
        0.72,
        0.14,
        Math.hypot(length, 0.65),
        0.11,
        0.11,
        light,
        group,
      );
      brace.rotation.z = Math.atan2(0.65, length);
    }
    if (index % 4 === 0)
      w.box(length / 2, 1.08, -0.106, length * 0.72, 0.022, 0.012, 0x49372b, group);
  }
  return group;
}
