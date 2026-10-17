import test from 'node:test';
import assert from 'node:assert/strict';
import { RepeatWrapping, LinearMipmapLinearFilter, ShaderLib, NoColorSpace } from 'three';
import { createIceTexture, createIceMaterial } from '../public/ice-surface.js';

test('ice surface uses a deterministic packed, mipmapped texture with varied frost and fractures', () => {
  const a = createIceTexture(),
    b = createIceTexture(),
    data = a.image.data;
  assert.deepEqual(
    data,
    b.image.data,
    'surface details must stay fixed between clients and scene rebuilds',
  );
  assert.equal(a.image.width, 512);
  assert.equal(a.image.height, 512);
  assert.equal(data.byteLength, 1024 * 1024, 'keep mobile texture storage bounded');
  assert.equal(a.wrapS, RepeatWrapping);
  assert.equal(a.wrapT, RepeatWrapping);
  assert.equal(a.minFilter, LinearMipmapLinearFilter);
  assert.equal(a.generateMipmaps, true);
  assert.equal(a.colorSpace, NoColorSpace, 'packed masks must not undergo sRGB decoding');
  let fractured = 0,
    clear = 0,
    frostMin = 255,
    frostMax = 0,
    rims = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 32) fractured++;
    else clear++;
    if (data[i + 2] > 32) rims++;
    frostMin = Math.min(frostMin, data[i + 1]);
    frostMax = Math.max(frostMax, data[i + 1]);
    assert.equal(data[i + 3], 255);
  }
  assert.ok(fractured > 1000 && clear > fractured, 'cracks remain sparse against clear ice');
  assert.ok(rims > fractured, 'fractures have thin frosted rims');
  assert.ok(frostMax - frostMin > 90, 'frost varies across the ice');
  a.dispose();
  b.dispose();
});

test('ice material preserves physical rendering and releases its private texture', () => {
  const material = createIceMaterial();
  assert.equal(material.isMeshPhysicalMaterial, true);
  assert.equal(material.clearcoat, 0.85);
  const shader = {
    uniforms: {},
    vertexShader: ShaderLib.physical.vertexShader,
    fragmentShader: ShaderLib.physical.fragmentShader,
  };
  material.onBeforeCompile(shader);
  assert.match(
    shader.vertexShader,
    /modelMatrix\*vec4\(transformed,1\.\)/,
    'world-space detail survives static road merging',
  );
  assert.match(
    shader.fragmentShader,
    /textureGrad\(/,
    'stochastic offsets must not introduce mipmap seams',
  );
  assert.match(
    shader.fragmentShader,
    /#include <lights_physical_fragment>/,
    'retain standard lights, shadows, and reflections',
  );
  let disposed = false;
  shader.uniforms.glacierSurface.value.addEventListener('dispose', () => (disposed = true));
  material.dispose();
  assert.equal(disposed, true);
});
