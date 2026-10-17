import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLandmarks, animateLandmarks } from '../public/landmarks.js';
import { selectTrack } from '../shared/game.js';

// Exercise actual landmark geometry without requiring a GPU or DOM texture canvas.
function fixture() {
  const scene = new THREE.Scene(),
    staticGroup = new THREE.Group(),
    materials = new Map();
  scene.add(staticGroup);
  return {
    scene,
    static: staticGroup,
    materials,
    camera: new THREE.PerspectiveCamera(),
    emitParticles: false,
    palm() {},
    texture() {
      return new THREE.Texture();
    },
    mesh(geometry, color, x = 0, y = 0, z = 0, parent = staticGroup) {
      let material = color;
      if (typeof color !== 'object') {
        if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color }));
        material = materials.get(color);
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    },
    box(x, y, z, w, h, d, color, parent) {
      return this.mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent);
    },
    cylinder(x, y, z, r1, r2, h, color, n = 8, parent) {
      return this.mesh(new THREE.CylinderGeometry(r1, r2, h, n), color, x, y, z, parent);
    },
  };
}

test('detailed coastal landmarks have finite geometry within a bounded enhanced rendering budget', () => {
  selectTrack('coast');
  const w = fixture();
  w.landmarks = buildLandmarks(w);
  w.scene.updateMatrixWorld(true);
  let triangles = 0;
  const batches = new Set();
  w.scene.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (const n of p.array) assert.ok(Number.isFinite(n));
    triangles += ((o.geometry.index?.count ?? p.count) / 3) * (o.isInstancedMesh ? o.count : 1);
    const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    batches.add(`${o.material.uuid}:${Math.floor(center.x / 70)}:${Math.floor(center.z / 70)}`);
    geometry.dispose();
  });
  // Count excludes generic palms (owned by scenery); no per-detail dynamic draws.
  assert.ok(triangles > 30000 && triangles < 90000, `landmark triangles: ${triangles}`);
  assert.ok(batches.size <= 145, `whole-track landmark batches: ${batches.size}`);
  assert.deepEqual(
    w.landmarks.map((l) => l.kind),
    ['volcano', 'geyser', 'harbour', 'ruins', 'waterfall', 'lighthouse'],
  );
});

test('animated landmark parts survive removal of the static merge source', () => {
  selectTrack('coast');
  const w = fixture();
  w.landmarks = buildLandmarks(w);
  w.scene.remove(w.static);
  for (const l of w.landmarks)
    assert.equal(l.mesh.parent, w.scene, `${l.kind} must remain in the live scene`);
  animateLandmarks(w, 500);
  const volcano = w.landmarks.find((l) => l.kind === 'volcano');
  assert.ok(volcano.mesh.scale.x > 0.85 && volcano.mesh.scale.x <= 1);
  assert.equal(w.landmarks.find((l) => l.kind === 'lighthouse').mesh.rotation.y, 0.175);
  assert.equal(w.landmarks.find((l) => l.kind === 'waterfall').time.value, 0.5);
  const drops = w.landmarks.find((l) => l.kind === 'geyser').droplets;
  assert.equal(drops.count, 48);
  for (const value of drops.instanceMatrix.array) assert.ok(Number.isFinite(value));
});

test('Palm Island shoreline is continuous, upward facing and below the road', () => {
  selectTrack('coast');
  const w = fixture();
  buildLandmarks(w);
  const shore = [];
  w.static.traverse((o) => {
    if (o.userData.sceneryKind === 'palm-island-shore') shore.push(o);
  });
  assert.equal(shore.length, 3, 'three continuous bands replace overlapping island cylinders');
  for (const mesh of shore) {
    const p = mesh.geometry.attributes.position,
      n = mesh.geometry.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      assert.ok(p.getY(i) < -0.1, 'terrain must not cover the driving surface');
      assert.ok(n.getY(i) >= 0, 'shoreline faces must point toward the sky');
    }
  }
});

test('four coastal landmarks sit on connected land crossed by the road', () => {
  selectTrack('coast');
  const w = fixture();
  buildLandmarks(w);
  w.scene.updateMatrixWorld(true);
  assert.deepEqual(
    w.coastalLandforms.map((l) => l.kind),
    ['volcano', 'geyser', 'ruins', 'waterfall'],
  );
  for (const land of w.coastalLandforms) {
    const meshes = [];
    w.static.traverse((o) => {
      if (o.userData.sceneryKind === 'connected-land' && o.userData.landmark === land.kind)
        meshes.push(o);
    });
    for (const mesh of meshes) {
      const p = mesh.geometry.attributes.position,
        n = mesh.geometry.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        assert.ok(p.getY(i) < -0.1);
        assert.ok(n.getY(i) >= 0, 'land normals must face upward');
      }
    }
    for (const anchor of [land.roadAnchor, land.featureAnchor]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(anchor.x, 10, anchor.z),
        new THREE.Vector3(0, -1, 0),
      );
      const hits = ray.intersectObjects(meshes);
      assert.ok(hits.length, `${land.kind} must have connected ground at each anchor`);
      assert.ok(hits[0].point.y > -2.05, 'lowered terrain stays above the sea');
      if (anchor === land.roadAnchor)
        assert.ok(hits[0].point.y > -0.5, 'bank meets the road underside');
    }
  }
});

test('sand stretches join the road surface and slope down beneath the sea', () => {
  selectTrack('coast');
  const w = fixture();
  buildLandmarks(w);
  const beaches = [];
  w.static.traverse((o) => {
    if (o.userData.sceneryKind === 'coastal-beach') beaches.push(o);
  });
  assert.equal(beaches.length, 2);
  let low = 0,
    high = -Infinity;
  for (const mesh of beaches) {
    const p = mesh.geometry.attributes.position,
      n = mesh.geometry.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      low = Math.min(low, y);
      high = Math.max(high, y);
      assert.ok(n.getY(i) > 0);
    }
  }
  assert.ok(Math.abs(high - 0.01) < 1e-6);
  assert.ok(low < -3);
});

test('living landmarks survive static merging, animate deterministically and keep fixed render resources', () => {
  selectTrack('coast');
  const w = fixture();
  w.landmarks = buildLandmarks(w);
  w.scene.remove(w.static);
  for (const landmark of w.landmarks.filter((l) => l.life)) {
    assert.equal(landmark.life.root.parent, w.scene, `${landmark.kind}: live scene owner`);
    const resources = [];
    landmark.life.root.traverse((o) => {
      if (o.isMesh) resources.push([o.uuid, o.geometry.uuid, o.material.uuid]);
    });
    assert.ok(
      resources.length <= 18,
      `${landmark.kind}: bounded animation draw calls (${resources.length})`,
    );
    w.camera.position.set(landmark.x, 30, landmark.z);
    const snapshot = () => {
      const state = [];
      landmark.life.root.traverse((o) => {
        state.push(...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray());
        if (o.isInstancedMesh) state.push(...o.instanceMatrix.array);
      });
      return state;
    };
    animateLandmarks(w, 3500);
    const initial = snapshot();
    animateLandmarks(w, 11750);
    const later = snapshot();
    assert.notDeepEqual(later, initial, `${landmark.kind}: visible motion`);
    for (const n of later) assert.ok(Number.isFinite(n), `${landmark.kind}: finite transforms`);
    animateLandmarks(w, 3500);
    assert.deepEqual(snapshot(), initial, `${landmark.kind}: absolute-time replay`);
    const after = [];
    landmark.life.root.traverse((o) => {
      if (o.isMesh) after.push([o.uuid, o.geometry.uuid, o.material.uuid]);
    });
    assert.deepEqual(after, resources, `${landmark.kind}: no resource allocation while animating`);
    w.camera.position.set(landmark.x + 1000, 30, landmark.z);
    animateLandmarks(w, 7000);
    assert.equal(landmark.life.root.visible, false);
    w.camera.position.set(landmark.x, 30, landmark.z);
    animateLandmarks(w, 11750);
    assert.equal(landmark.life.root.visible, true);
    assert.deepEqual(snapshot(), later, `${landmark.kind}: returning resumes the current phase`);
  }
});

test('crane cargo stays above its loading bay and below the gantry', () => {
  selectTrack('coast');
  const w = fixture();
  w.landmarks = buildLandmarks(w);
  const harbour = w.landmarks.find((l) => l.kind === 'harbour');
  w.camera.position.set(harbour.x, 20, harbour.z);
  const { carrier, suspended } = harbour.life;
  const heights = [],
    positions = [];
  for (let t = 0; t <= 24000; t += 250) {
    animateLandmarks(w, t);
    heights.push(suspended.position.y);
    positions.push(carrier.position.x);
    assert.ok(suspended.position.y - 2.9 >= 0.35, 'cargo clears deck');
    assert.ok(suspended.position.y <= 11.1, 'spreader clears gantry');
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) > 7, 'cargo visibly lifts');
  assert.ok(
    Math.max(...positions) - Math.min(...positions) > 11,
    'carrier crosses the loading bays',
  );
});

test('relocated terrain landmarks use matching simulation anchors', () => {
  selectTrack('coast');
  const w = fixture();
  buildLandmarks(w);
  const expected = { volcano: 0.175, geyser: 0.275, ruins: 0.5, waterfall: 0.75 };
  for (const land of w.coastalLandforms) assert.equal(land.fraction, expected[land.kind]);
});
