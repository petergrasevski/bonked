import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { noiseData, useBakedNoise } from '../public/baked-noise.js';
import { sceneRange, DistanceFade } from '../public/scene-distance.js';
import {
  spatialPieces,
  simplifyDecorations,
  prepareSceneryLOD,
  updateSceneryLOD,
} from '../public/scenery-lod.js';
import { SceneMaterials } from '../public/scene-materials.js';
import { StaticShadows } from '../public/static-shadows.js';
test('cached noise matches the old hash at lattice points and shares/disposes textures', () => {
  const data = noiseData(16);
  for (const [x, y] of [
    [0, 0],
    [3, 7],
    [15, 15],
  ]) {
    const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    assert.ok(Math.abs(data[y * 16 + x] / 255 - (v - Math.floor(v))) <= 1 / 255);
  }
  const a = new THREE.MeshStandardMaterial(),
    b = new THREE.MeshStandardMaterial(),
    ta = useBakedNoise(a),
    tb = useBakedNoise(b);
  assert.equal(ta, tb);
  let disposed = 0;
  ta.addEventListener('dispose', () => disposed++);
  a.dispose();
  assert.equal(disposed, 0);
  b.dispose();
  assert.equal(disposed, 1);
  b.dispose();
  assert.equal(disposed, 1);
});
test('spatial splitting retains every terrain triangle and its attributes', () => {
  const g = new THREE.PlaneGeometry(500, 300, 20, 12);
  g.rotateX(-Math.PI / 2);
  const original = g.index.count,
    pieces = spatialPieces(g);
  assert.ok(pieces.length > 10);
  assert.equal(
    pieces.reduce((n, p) => n + p.attributes.position.count, 0),
    original,
  );
  const b = new THREE.Box3();
  for (const p of pieces) {
    assert.equal(p.attributes.uv.count, p.attributes.position.count);
    b.union(p.boundingBox);
    p.dispose();
  }
  assert.equal(Math.round(b.max.x - b.min.x), 500);
  assert.equal(Math.round(b.max.z - b.min.z), 300);
});
test('decoration LOD reduces distant geometry with hysteresis and restores the original close up', () => {
  const g = new THREE.SphereGeometry(2, 24, 16),
    low = simplifyDecorations(g, 1);
  assert.ok(low.index.count < g.index.count * 0.5);
  const mesh = new THREE.Mesh(g),
    camera = new THREE.PerspectiveCamera();
  prepareSceneryLOD(mesh);
  camera.position.set(0, 0, 220);
  updateSceneryLOD(mesh, camera);
  assert.equal(mesh.userData.detailLevel, 2);
  camera.position.z = 180;
  updateSceneryLOD(mesh, camera);
  assert.equal(mesh.userData.detailLevel, 2);
  camera.position.z = 10;
  updateSceneryLOD(mesh, camera);
  assert.equal(mesh.geometry, g);
  for (const geometry of mesh.userData.detailLevels) geometry.dispose();
  low.dispose();
});
test('draw range retains distant racers and grey fade finishes before clipping', () => {
  assert.equal(sceneRange('coast', { far: 240 }), 260);
  assert.equal(sceneRange('desert', { far: 510 }), 510);
  const f = new DistanceFade();
  f.update(300);
  assert.ok(f.start.value < f.end.value);
  assert.ok(f.end.value < 300);
});
function renderer() {
  return {
    capabilities: { maxTextureSize: 4096 },
    shadowMap: { enabled: true },
    target: null,
    draws: 0,
    copies: 0,
    getRenderTarget() {
      return this.target;
    },
    setRenderTarget(t) {
      this.target = t;
    },
    getClearColor(c) {
      return c.set(0x123456);
    },
    getClearAlpha() {
      return 0.5;
    },
    setClearColor() {},
    clear() {},
    render() {
      this.draws++;
    },
    copyFramebufferToTexture() {
      this.copies++;
    },
  };
}
test('scenery shadows bake once, leave moving objects live and release the bake framebuffer', () => {
  const r = renderer(),
    fixed = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 10), new THREE.MeshStandardMaterial()),
    moving = new THREE.Mesh();
  fixed.castShadow = moving.castShadow = true;
  const bake = new StaticShadows(r, [fixed], [-70, 24, -50]);
  assert.equal(r.draws, 1);
  assert.equal(r.copies, 1);
  assert.equal(fixed.castShadow, false);
  assert.equal(moving.castShadow, true);
  assert.equal(r.target, null);
  assert.equal(r.shadowMap.enabled, true);
  const scene = new THREE.Scene();
  scene.add(fixed);
  bake.apply(scene);
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  fixed.material.onBeforeCompile(shader, r);
  assert.equal(shader.uniforms.bakedShadowMap.value, bake.texture);
  assert.match(shader.fragmentShader, /sceneryShadow/);
  assert.match(shader.vertexShader, /vBakedShadow/);
  bake.apply(scene);
  const next = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  fixed.material.onBeforeCompile(next, r);
  assert.equal((next.fragmentShader.match(/float sceneryShadow\(/g) || []).length, 1);
  let disposed = false;
  bake.texture.addEventListener('dispose', () => (disposed = true));
  bake.dispose();
  assert.equal(disposed, true);
  fixed.geometry.dispose();
  fixed.material.dispose();
  moving.geometry.dispose();
  moving.material.dispose();
});

test('switching circuits isolates cached model shaders and leaves template materials untouched', () => {
  const template = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()),
    first = template.clone(),
    second = template.clone(),
    a = new SceneMaterials(),
    b = new SceneMaterials();
  a.adopt(first, true);
  b.adopt(second, true);
  assert.notEqual(first.material, second.material);
  assert.notEqual(first.material, template.material);
  const r = renderer(),
    caster = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 10), new THREE.MeshStandardMaterial());
  caster.castShadow = true;
  const bake = new StaticShadows(r, [caster], [-70, 24, -50]);
  bake.apply(first);
  new DistanceFade().apply(first);
  bake.apply(second);
  new DistanceFade().apply(second);
  for (const mesh of [first, second]) {
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    };
    mesh.material.onBeforeCompile(shader, r);
    assert.equal((shader.fragmentShader.match(/uniform float sceneFadeStart/g) || []).length, 1);
    assert.equal((shader.vertexShader.match(/uniform mat4 bakedShadowMatrix/g) || []).length, 1);
  }
  const clean = { uniforms: {}, vertexShader: 'original', fragmentShader: 'original' };
  template.material.onBeforeCompile(clean, r);
  assert.equal(clean.fragmentShader, 'original');
  const same = first.material;
  a.adopt(first, true);
  assert.equal(first.material, same);
  template.geometry.dispose();
  template.material.dispose();
  first.material.dispose();
  second.material.dispose();
  caster.geometry.dispose();
  caster.material.dispose();
  bake.dispose();
});
