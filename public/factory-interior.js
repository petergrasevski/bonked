import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { trackAt, nearestTrack } from '../shared/game.js';
import { factoryFinish, buildFactoryDressing } from './factory-dressing.js';
export function mergeMovingGroup(group) {
  group.updateMatrixWorld(true);
  const chunks = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh) continue;
    child.updateMatrix();
    let geo = child.geometry.clone().applyMatrix4(child.matrix);
    if (geo.index) {
      const flat = geo.toNonIndexed();
      geo.dispose();
      geo = flat;
    }
    const list = chunks.get(child.material) || [];
    list.push(geo);
    chunks.set(child.material, list);
    group.remove(child);
    child.geometry.dispose();
  }
  for (const [material, geos] of chunks) {
    const m = new THREE.Mesh(mergeGeometries(geos), material);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    for (const geo of geos) geo.dispose();
  }
}
export function buildFactoryInterior(w) {
  const steel = factoryFinish(w, 0x344651),
    dark = factoryFinish(w, 0x1a2b34),
    cream = factoryFinish(w, 0xa8b4ad, { panels: true }),
    amber = factoryFinish(w, 0xeab653),
    blue = factoryFinish(w, 0x4384a2, { panels: true }),
    animations = [],
    reservations = [{ x: 0, z: 40, radius: 49 }];
  const lit = w.mat(0xe9e5ca).clone();
  lit.emissive = new THREE.Color(0xe9e5ca);
  lit.emissiveIntensity = 1.5;
  // The race runs along catwalks inside one continuous assembly hall. Ceiling
  // panels are visible from below and let the elevated game camera see in.
  const walls = factoryFinish(w, 0x40525c, { panels: true }),
    ceiling = walls.clone();
  ceiling.onBeforeCompile = walls.onBeforeCompile;
  ceiling.customProgramCacheKey = walls.customProgramCacheKey;
  ceiling.side = THREE.BackSide;
  for (const z of [-285, 305]) {
    w.box(0, 50, z, 790, 116, 2, walls);
    for (let x = -360; x <= 360; x += 45) {
      w.box(x, 50, z - Math.sign(z) * 1.2, 1.2, 116, 1.2, dark);
      w.box(x, 83, z - Math.sign(z) * 1.3, 29, 8, 0.1, blue);
      w.box(x, 83, z - Math.sign(z) * 1.4, 1, 8, 0.12, cream);
    }
  }
  for (const x of [-395, 395]) {
    w.box(x, 50, 10, 2, 116, 590, walls);
    for (let z = -250; z < 300; z += 45) w.box(x - Math.sign(x) * 1.2, 50, z, 1.2, 116, 1.2, dark);
  }
  const roof = w.mesh(new THREE.PlaneGeometry(790, 590), ceiling, 0, 108, 10);
  roof.rotation.x = -Math.PI / 2;
  roof.castShadow = false;
  for (let x = -360; x <= 360; x += 60) {
    w.box(x, 105, 10, 1, 2.5, 590, steel);
    for (let z = -240; z <= 270; z += 85) {
      w.box(x, 100, z, 0.4, 0.4, 34, lit);
      w.box(x, 102, z, 0.12, 4, 0.12, dark);
    }
  }
  for (let i = 0; i < 24; i++) {
    const p = trackAt(i / 24),
      side = i % 2 ? 1 : -1,
      d = p.halfWidth + 16,
      x = p.x + p.nx * d * side,
      z = p.z + p.nz * d * side;
    if (nearestTrack(x, z).distance < 12) continue;
    w.box(x, 49, z, 1.6, 114, 1.6, steel);
    for (const y of [0, 10, 20, 30]) w.box(x, y, z, 1.7, 0.5, 1.7, amber);
  }
  // Pipes, cable trays, suspended ventilation and maintenance bridges.
  for (let i = 0; i < 20; i++) {
    const p = trackAt((i + 0.4) / 20),
      g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = -p.angle;
    w.static.add(g);
    for (const side of [-1, 1]) {
      w.box(0, 56, side * (p.halfWidth + 5), 28, 0.7, 2.2, steel, g);
      for (let j = -12; j < 14; j += 3)
        w.box(j, 57, side * (p.halfWidth + 5), 0.15, 2, 0.15, cream, g);
      w.box(0, 58, side * (p.halfWidth + 5), 28, 0.15, 2.2, amber, g);
    }
    for (let j = 0; j < 3; j++) {
      const duct = w.cylinder(
        0,
        65 + j * 2,
        -p.halfWidth - 7,
        0.65,
        0.65,
        34,
        [steel, cream, blue][j],
        12,
        g,
      );
      duct.rotation.z = Math.PI / 2;
    }
    w.box(0, 71, 0, 3, 2, p.halfWidth * 2 + 18, 0x65757b, g);
  }
  // Six car production lines with conveyors, robotic welders, bins, inspection
  // gates, tool cabinets, pallets, drums and body shells in different stages.
  for (let line = 0; line < 16; line++) {
    const p = trackAt((line + 0.2) / 16),
      side = line % 2 ? 1 : -1;
    let spot;
    for (let d = p.halfWidth + 38; d < 130; d += 12) {
      const x = p.x + p.nx * d * side,
        z = p.z + p.nz * d * side;
      if (nearestTrack(x, z).distance > 32) {
        spot = { x, z };
        break;
      }
    }
    if (!spot) continue;
    reservations.push({ ...spot, radius: 25 });
    const g = new THREE.Group();
    g.position.set(spot.x, -8, spot.z);
    g.rotation.y = -p.angle;
    w.static.add(g);
    w.box(0, 2.1, 0, 40, 1, 7, dark, g);
    for (const z of [-3.8, 3.8]) w.box(0, 2.8, z, 41, 0.35, 0.35, amber, g);
    for (let x = -18; x <= 18; x += 2) w.box(x, 2.65, 0, 0.16, 0.12, 6.7, cream, g);
    for (let station = 0; station < 3; station++) {
      const x = -13 + station * 13;
      for (const z of [-5.5, 5.5]) {
        w.box(x, 1, z, 2, 2, 2, blue, g);
        w.box(x, 5.2, z, 0.4, 6.4, 0.4, steel, g);
      }
      w.box(x, 8.5, 0, 0.5, 0.5, 12, steel, g);
      w.box(x, 8.1, 0, 0.6, 0.12, 6, lit, g);
      w.box(x, 1, -9, 3, 2, 2.2, 0x8c5350, g);
      for (let drawer = 0; drawer < 4; drawer++)
        w.box(x, 0.4 + drawer * 0.45, -7.86, 2.5, 0.05, 0.08, cream, g);
      const robot = new THREE.Group();
      robot.position.set(
        spot.x + Math.cos(p.angle) * x + p.nx * 5.6,
        -3.5,
        spot.z + Math.sin(p.angle) * x + p.nz * 5.6,
      );
      robot.rotation.y = -p.angle;
      w.scene.add(robot);
      w.cylinder(0, 0, 0, 0.8, 1, 1.5, steel, 12, robot);
      w.box(0, 1.8, 0, 0.7, 3.4, 0.7, amber, robot);
      w.cylinder(0, 3.3, 0, 0.55, 0.55, 1, steel, 12, robot).rotation.x = Math.PI / 2;
      w.box(0, 3.3, -1.6, 0.55, 0.55, 3.2, amber, robot);
      w.box(0, 2.7, -3.1, 0.3, 1.5, 0.3, cream, robot);
      mergeMovingGroup(robot);
      animations.push({ kind: 'robot', g: robot, base: -p.angle, phase: line + station });
    }
    for (let slot = 0; slot < 4; slot++) {
      const car = new THREE.Group();
      w.scene.add(car);
      const paint = [0x4488ad, 0x9f5348, 0x9ba99e][(line + slot) % 3];
      w.box(0, 0.65, 0, 4.8, 0.65, 2, paint, car);
      w.box(0, 1.15, 0, 2.2, 0.65, 1.7, slot === 0 ? dark : paint, car);
      w.box(0.7, 1.15, 0, 0.08, 0.55, 1.75, blue, car);
      if (slot > 0)
        for (const x of [-1.5, 1.5])
          for (const z of [-1.05, 1.05]) {
            const tire = w.cylinder(x, 0.4, z, 0.4, 0.4, 0.22, dark, 10, car);
            tire.rotation.x = Math.PI / 2;
          }
      mergeMovingGroup(car);
      car.rotation.y = -p.angle;
      animations.push({
        kind: 'car',
        g: car,
        x: spot.x,
        z: spot.z,
        fx: Math.cos(p.angle),
        fz: Math.sin(p.angle),
        slot,
      });
    }
    for (let i = 0; i < 6; i++) {
      const x = -18 + i * 7,
        z = 10 + (i % 2) * 3;
      w.box(x, 0.2, z, 4, 0.4, 3, 0x796c51, g);
      w.box(x, 1.7, z, 3.7, 2.6, 2.7, i % 2 ? blue : cream, g);
      for (const off of [-1, 1]) w.box(x + off * 1.1, 1.7, z, 0.1, 2.7, 2.8, dark, g);
    }
  }
  // A central paint-and-inspection plant gives the hall a visible working core.
  const core = new THREE.Group();
  core.position.set(0, -8, 40);
  w.static.add(core);
  w.box(0, 0.4, 0, 78, 0.8, 50, 0x536368, core);
  for (const z of [-16, 16]) {
    w.box(0, 2, z, 68, 2, 8, dark, core);
    for (let x = -30; x <= 30; x += 6) w.box(x, 3.05, z, 0.12, 0.1, 7, cream, core);
    for (let station = 0; station < 5; station++) {
      const x = -28 + station * 14;
      for (const side of [-1, 1]) {
        w.box(x, 9, z + side * 5, 0.6, 18, 0.6, steel, core);
        w.box(x, 8, z + side * 5.4, 11, 11, 0.15, blue, core);
        w.box(x, 15, z + side * 4.9, 10, 0.3, 0.3, lit, core);
      }
      w.box(x, 18, z, 12, 1.5, 12, cream, core);
      w.box(x, 0.8, z + 8, 5, 1.6, 3, amber, core);
      w.box(x, 4, z, 4.5, 0.7, 2.1, [blue, cream, 0x9f5348][station % 3], core);
      w.box(x, 4.6, z, 2.4, 0.6, 1.8, dark, core);
    }
  }
  for (const x of [-34, 34]) {
    w.cylinder(x, 13, 0, 3, 3, 26, cream, 16, core);
    for (const y of [2, 9, 16, 23]) w.cylinder(x, y, 0, 3.1, 3.1, 0.3, steel, 16, core);
  }
  buildFactoryDressing(w, reservations);
  return {
    update(seconds, camera) {
      for (const a of animations) {
        a.g.visible =
          Math.hypot(a.g.position.x - camera.position.x, a.g.position.z - camera.position.z) < 290;
        if (a.kind === 'robot') a.g.rotation.y = a.base + Math.sin(seconds * 1.5 + a.phase) * 0.65;
        else {
          const distance = ((seconds * 2.3 + a.slot * 10) % 40) - 20;
          a.g.position.set(a.x + a.fx * distance, -4.8, a.z + a.fz * distance);
        }
      }
    },
  };
}
