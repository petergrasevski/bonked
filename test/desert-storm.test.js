import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  desertStormAt,
  stormCoverage,
  stormGustAt,
  applyDesertWind,
  STORM_DELAY,
} from '../shared/desert-storm.js';
import { createDustCloud, stormHaze } from '../public/desert-storm.js';
import { selectTrack, spawnCar, stepCar, trackAt, STEP, NEUTRAL } from '../shared/game.js';
import { predictFleet } from '../shared/prediction.js';
test('storms traverse the map for 42 seconds followed by 45 seconds clear', () => {
  assert.equal(desertStormAt(14.99).active, false);
  assert.equal(desertStormAt(15).active, true);
  assert.equal(desertStormAt(56.99).active, true);
  for (const t of [57, 70, 90, 101.99]) assert.equal(desertStormAt(t).active, false);
  assert.equal(desertStormAt(102).active, true);
  assert.ok(desertStormAt(17).x < desertStormAt(33).x);
  assert.ok(desertStormAt(104).x > desertStormAt(140).x);
  const storm = desertStormAt(25);
  assert.equal(stormCoverage(storm, storm.x, storm.z), 1);
  assert.equal(stormCoverage(storm, storm.x + storm.rx + 1, storm.z), 0);
  assert.ok((Math.PI * storm.rx * storm.rz) / (540 * 340) > 0.8);
  assert.ok((Math.PI * storm.rx * storm.rz) / (540 * 340) < 1);
  for (const t of [-100, NaN, Infinity, 1e6]) assert.ok(Number.isFinite(desertStormAt(t).x));
});
test('wind alternates left, right and backward in smooth one-second bursts and respects cloud boundaries', () => {
  const probe = (age) => {
    const t = STORM_DELAY + age,
      s = desertStormAt(t);
    return stormGustAt(t, s.x, s.z, 0);
  };
  assert.ok(probe(3.5).z < 0);
  assert.ok(probe(6.5).x < 0);
  assert.ok(probe(9.5).z > 0);
  for (const age of [3, 4, 4.5, 5.5, 6, 7, 8.5]) assert.equal(probe(age).strength, 0);
  assert.ok(probe(3.001).strength < 0.001);
  assert.ok(probe(3.999).strength < 0.001);
  const s = desertStormAt(21.5);
  assert.equal(stormGustAt(21.5, s.x + 600, s.z).strength, 0);
  const car = { x: s.x, z: s.z, angle: 0, vx: 30, vz: 0 };
  applyDesertWind(car, 21.5, 0.5);
  assert.ok(Math.abs(car.vx - (30 - 24 * 1.7 * 0.5)) < 1e-8);
  assert.ok(Math.abs(car.vz) < 1e-8);
  for (const state of ['finished', 'eliminated', 'falling', 'overturned']) {
    const c = { ...car, [state]: true };
    applyDesertWind(c, 21.5, 1);
    assert.equal(c.vx, car.vx);
  }
});
test('desert wind agrees exactly between authoritative ticks and client prediction, leaving other circuits unchanged', () => {
  selectTrack('desert');
  const p = trackAt(0.05),
    base = {
      ...spawnCar(),
      x: p.x,
      y: p.y,
      z: p.z,
      groundY: p.y,
      angle: p.angle,
      trackFraction: 0.05,
      progress: 0.038,
      vx: Math.cos(p.angle) * 25,
      vz: Math.sin(p.angle) * 25,
      raceTime: 23.99,
    };
  const server = { ...base },
    client = { ...base };
  for (let i = 0; i < 90; i++) {
    stepCar(server, { ...NEUTRAL, throttle: 1 });
    server.raceTime += STEP;
    predictFleet(client, [], { ...NEUTRAL, throttle: 1 }, STEP);
    assert.ok(Math.abs(server.x - client.x) < 1e-9);
    assert.ok(Math.abs(server.z - client.z) < 1e-9);
  }
  for (const id of ['coast', 'ice']) {
    selectTrack(id);
    const a = spawnCar(),
      b = { ...a, raceTime: 24.5 };
    for (let i = 0; i < 30; i++) {
      stepCar(a, NEUTRAL);
      stepCar(b, NEUTRAL);
      assert.equal(a.x, b.x);
      assert.equal(a.z, b.z);
    }
  }
});
test('dust uses two fixed GPU draws and keeps near-track visibility readable at all camera heights', () => {
  const dust = createDustCloud({ mobile: true }),
    copy = createDustCloud({ mobile: true });
  assert.equal(dust.group.children.length, 2);
  assert.equal(dust.clouds.count, 24);
  assert.equal(dust.grains.geometry.attributes.position.count, 300);
  assert.deepEqual(dust.clouds.instanceMatrix.array, copy.clouds.instanceMatrix.array);
  const buffer = dust.clouds.instanceMatrix.array,
    storm = dust.update(25);
  assert.equal(dust.group.visible, true);
  assert.equal(dust.group.scale.x, 1.25);
  assert.equal(dust.group.scale.z, 1.25);
  assert.ok(Math.abs(desertStormAt(26).x - desertStormAt(25).x) < 17);
  assert.equal(dust.clouds.instanceMatrix.array, buffer);
  for (const height of [20, 50, 100, 200, 400]) {
    const { density } = stormHaze(storm, storm, height);
    assert.ok(
      1 - Math.exp(-((density * height * 1.5) ** 2)) < 0.65,
      'cars stay readable through the haze',
    );
  }
  dust.update(58);
  assert.equal(dust.group.visible, false);
  for (const d of [dust, copy])
    d.group.traverse((mesh) => {
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    });
});
test('gust trails match the force direction, fade with coverage and reuse bounded buffers', async () => {
  const { createGustTrails } = await import('../public/desert-storm.js'),
    trails = createGustTrails(8),
    mesh = trails.mesh;
  const matrices = mesh.instanceMatrix.array,
    positions = mesh.geometry.attributes.position.array;
  for (const seconds of [18.5, 21.5, 24.5])
    for (const angle of [0, Math.PI / 2, -2]) {
      const s = desertStormAt(seconds),
        car = { x: s.x, z: s.z, y: 4, angle },
        wind = stormGustAt(seconds, car.x, car.z, angle);
      trails.update(seconds, [car]);
      assert.equal(mesh.count, 1);
      assert.equal(mesh.visible, true);
      assert.ok(Math.abs(matrices[0] - wind.x / Math.hypot(wind.x, wind.z)) < 1e-6);
      assert.ok(Math.abs(matrices[2] - wind.z / Math.hypot(wind.x, wind.z)) < 1e-6);
      assert.ok(Math.abs(mesh.geometry.attributes.gustStrength.getX(0) - wind.strength) < 1e-6);
      assert.equal(matrices[13], 4);
      assert.equal(mesh.instanceMatrix.array, matrices);
      assert.equal(mesh.geometry.attributes.position.array, positions);
    }
  const seconds = 24.5,
    s = desertStormAt(seconds),
    car = { x: s.x, z: s.z, angle: 0 };
  trails.update(
    seconds,
    Array.from({ length: 12 }, () => car),
  );
  assert.equal(mesh.count, 8);
  assert.equal(mesh.geometry.index.count, 3 * 24 * 6);
  for (const flag of ['eliminated', 'finished', 'falling', 'overturned']) {
    trails.update(seconds, [{ ...car, [flag]: true }]);
    assert.equal(mesh.visible, false);
  }
  for (const t of [0, 25.1, 70]) {
    trails.update(t, [car]);
    assert.equal(mesh.visible, false);
  }
  trails.update(seconds, [{ ...car, x: car.x + 600 }]);
  assert.equal(mesh.visible, false);
  mesh.geometry.dispose();
  mesh.material.dispose();
});

test('dust bounds transparent pixel coverage, reuses baked noise and releases it on scene disposal', () => {
  for (const mobile of [false, true]) {
    const dust = createDustCloud({ mobile }),
      { clouds, grains } = dust,
      material = clouds.material,
      texture = material.uniforms.dustNoise.value;
    assert.equal(clouds.count, mobile ? 24 : 36);
    assert.equal(grains.geometry.attributes.position.count, mobile ? 300 : 550);
    assert.equal(
      material.side,
      THREE.FrontSide,
      'billboards avoid the two-pass transparent double-side path',
    );
    const positions = clouds.geometry.attributes.position,
      index = clouds.geometry.index;
    let area = 0;
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i),
        b = index.getX(i + 1),
        c = index.getX(i + 2);
      area +=
        Math.abs(
          (positions.getX(b) - positions.getX(a)) * (positions.getY(c) - positions.getY(a)) -
            (positions.getY(b) - positions.getY(a)) * (positions.getX(c) - positions.getX(a)),
        ) / 2;
    }
    // The previous scene always used 72 square billboards, including on phones.
    assert.ok(
      (area * clouds.count) / 72 <= (mobile ? 0.26 : 0.39),
      'at most 26%/39% of the old unit billboard area',
    );
    assert.equal(texture.image.width, 128);
    assert.equal(texture.image.height, 128);
    assert.equal(texture.image.data.byteLength, 16384);
    assert.equal(texture.wrapS, THREE.RepeatWrapping);
    assert.equal(texture.wrapT, THREE.RepeatWrapping);
    assert.equal(texture.generateMipmaps, true);
    const pixels = texture.image.data,
      version = texture.version,
      matrices = clouds.instanceMatrix.array,
      grit = grains.geometry.attributes.position.array;
    assert.ok(Math.max(...pixels) - Math.min(...pixels) > 150, 'noise has cloud detail');
    for (let i = 0; i < 128; i++) {
      assert.ok(Math.abs(pixels[i * 128] - pixels[i * 128 + 127]) < 5, 'horizontal wrap is smooth');
      assert.ok(Math.abs(pixels[i] - pixels[127 * 128 + i]) < 5, 'vertical wrap is smooth');
    }
    for (let t = 0; t < 104; t += 0.25) dust.update(t, 720);
    assert.equal(texture.image.data, pixels);
    assert.equal(texture.version, version, 'animation never uploads the texture again');
    assert.equal(clouds.instanceMatrix.array, matrices);
    assert.equal(grains.geometry.attributes.position.array, grit);
    assert.equal(grains.material.uniforms.pointScale.value, 720);
    let disposed = 0;
    texture.addEventListener('dispose', () => disposed++);
    dust.group.traverse((mesh) => {
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    });
    assert.equal(disposed, 1, 'world material disposal also releases the noise');
  }
});
