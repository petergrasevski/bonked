import * as THREE from 'three';
import { activeTrack, getLandscape } from '../shared/game.js';
import { createCoastalSandMaterial } from './sand-surface.js';
function geometry(v) {
  // Inner banks can fold tightly around hairpins; keep their exposed faces upward.
  for (let i = 0; i < v.length; i += 9) {
    const ax = v[i + 3] - v[i],
      az = v[i + 5] - v[i + 2],
      bx = v[i + 6] - v[i],
      bz = v[i + 8] - v[i + 2];
    if (az * bx - ax * bz < 0)
      for (let k = 0; k < 3; k++) {
        const tmp = v[i + 3 + k];
        v[i + 3 + k] = v[i + 6 + k];
        v[i + 6 + k] = tmp;
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  const uv = [];
  for (let i = 0; i < v.length; i += 3) uv.push(v[i] / 7, v[i + 2] / 7);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
export function connectedLandGeometry(fraction, x, z, radius) {
  const land = getLandscape().lands.find((l) => l.fraction === fraction);
  return { ...land, bands: land.bands.map((v) => geometry([...v])) };
}
export function addConnectedLand(w, landmark, x, z, radius) {
  const land = connectedLandGeometry(landmark.fraction, x, z, radius);
  const colors =
    landmark.kind === 'volcano' ? [0x443f42, 0x736957, 0x625c51] : [0x777568, 0x938d7c, 0x89956a];
  land.bands.forEach((geo, i) => {
    const mesh = w.mesh(geo, colors[i]);
    mesh.userData.sceneryKind = 'connected-land';
    mesh.userData.landmark = landmark.kind;
  });
  const { bands, ...description } = land;
  (w.coastalLandforms ??= []).push({ kind: landmark.kind, ...description });
  return land;
}
// Smooth across strip boundaries as well as triangles. The upper rim shares
// the road's upward normal so sunlight cannot reveal a separate beach mesh.
export function coastalBeachGeometries(bands) {
  const geometries = bands.map((v) => geometry([...v])),
    normals = new Map();
  const key = (p, i) =>
    [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * 10000)).join(',');
  for (const geo of geometries) {
    const p = geo.attributes.position,
      n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const k = key(p, i);
      if (!normals.has(k)) normals.set(k, new THREE.Vector3());
      normals.get(k).add(new THREE.Vector3().fromBufferAttribute(n, i));
    }
  }
  for (const n of normals.values()) n.normalize();
  for (const geo of geometries) {
    const p = geo.attributes.position,
      n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const smooth = normals.get(key(p, i));
      if (Math.abs(p.getY(i) - 0.01) < 0.00001) n.setXYZ(i, 0, 1, 0);
      else n.setXYZ(i, smooth.x, smooth.y, smooth.z);
    }
  }
  return geometries;
}
export function buildCoastalBeaches(w) {
  if (activeTrack.id !== 'coast') return;
  const key = 'coastal-sand';
  if (!w.materials.has(key)) w.materials.set(key, createCoastalSandMaterial());
  coastalBeachGeometries(getLandscape().beaches).forEach((geo) => {
    const mesh = w.mesh(geo, w.materials.get(key));
    mesh.userData.sceneryKind = 'coastal-beach';
  });
}
