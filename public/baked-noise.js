import * as THREE from 'three';
// Cache the lattice values, not the lighting. Hardware filtering replaces the
// repeated sine/hash work while preserving world scale and smooth interpolation.
const caches = new Map();
export function noiseData(size, volume = false) {
  const data = new Uint8Array(size ** (volume ? 3 : 2));
  for (let z = 0; z < (volume ? size : 1); z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
        data[(z * size + y) * size + x] = Math.round((v - Math.floor(v)) * 255);
      }
  return data;
}
export function useBakedNoise(material, volume = false) {
  const size = volume ? 64 : 256,
    key = volume ? '3d' : '2d';
  let entry = caches.get(key);
  if (!entry) {
    const data = noiseData(size, volume),
      texture = volume
        ? new THREE.Data3DTexture(data, size, size, size)
        : new THREE.DataTexture(data, size, size);
    texture.format = THREE.RedFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    if (volume) texture.wrapR = THREE.RepeatWrapping;
    texture.generateMipmaps = true;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    texture.name = `Baked terrain noise ${key}`;
    entry = { texture, refs: 0 };
    caches.set(key, entry);
  }
  entry.refs++;
  let released = false;
  material.addEventListener('dispose', () => {
    if (released) return;
    released = true;
    if (--entry.refs === 0) {
      entry.texture.dispose();
      caches.delete(key);
    }
  });
  return entry.texture;
}
export const noise2DGLSL = `uniform sampler2D terrainNoise;
float bakedNoise2D(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return texture2D(terrainNoise,(i+f+.5)/256.).r;}`;
export const noise3DGLSL = `uniform highp sampler3D terrainNoise3D;
float bakedNoise3D(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return texture(terrainNoise3D,(i+f+.5)/64.).r;}`;
