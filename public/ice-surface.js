import * as THREE from 'three';

// A single packed, repeat-safe texture: fracture core, frost, fracture rim.
// Randomization happens in world space, so merging the road cannot reveal seams.
export function createIceTexture(size = 512) {
  const pixels = new Uint8Array(size * size * 4),
    core = new Float32Array(size * size),
    rim = new Float32Array(size * size);
  let seed = 0x1ce5ea;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wrap = (n) => ((n % size) + size) % size;
  const layers = [4, 13, 43].map((n) => ({
    n,
    data: Float32Array.from({ length: n * n }, random),
  }));
  function noise(layer, x, y) {
    const { n, data } = layer,
      px = (x / size) * n,
      py = (y / size) * n,
      ix = Math.floor(px),
      iy = Math.floor(py);
    let fx = px - ix,
      fy = py - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const at = (a, b) => data[(b % n) * n + (a % n)];
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), fx),
      THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), fx),
      fy,
    );
  }
  const scale = size / 512;
  function fracture(x0, y0, x1, y1, width) {
    const dx = x1 - x0,
      dy = y1 - y0,
      lengthSq = dx * dx + dy * dy,
      pad = width + 1.8 * scale;
    for (let y = Math.floor(Math.min(y0, y1) - pad); y <= Math.ceil(Math.max(y0, y1) + pad); y++)
      for (
        let x = Math.floor(Math.min(x0, x1) - pad);
        x <= Math.ceil(Math.max(x0, x1) + pad);
        x++
      ) {
        const t = THREE.MathUtils.clamp(
            ((x - x0) * dx + (y - y0) * dy) / Math.max(0.001, lengthSq),
            0,
            1,
          ),
          distance = Math.hypot(x - x0 - t * dx, y - y0 - t * dy),
          index = wrap(y) * size + wrap(x);
        core[index] = Math.max(core[index], Math.max(0, 1 - distance / width));
        rim[index] = Math.max(
          rim[index],
          Math.max(0, 1 - Math.abs(distance - width * 0.95) / (1.5 * scale)) * 0.7,
        );
      }
  }
  for (let i = 0; i < 34; i++) {
    let x = random() * size,
      y = random() * size,
      angle = random() * Math.PI * 2;
    const width = (0.8 + random() * 0.85) * scale;
    for (let j = 0; j < 9; j++) {
      angle += (random() - 0.5) * 0.9;
      const length = (7 + random() * 22) * scale,
        nx = x + Math.cos(angle) * length,
        ny = y + Math.sin(angle) * length;
      fracture(x, y, nx, ny, width);
      if (j === 3 || j === 6) {
        const branch = angle + (random() > 0.5 ? 1 : -1) * (0.5 + random()),
          reach = (15 + random() * 25) * scale;
        fracture(x, y, x + Math.cos(branch) * reach, y + Math.sin(branch) * reach, width * 0.65);
      }
      x = nx;
      y = ny;
    }
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const index = y * size + x,
        offset = index * 4,
        frost =
          noise(layers[0], x, y) * 0.5 +
          noise(layers[1], x, y) * 0.34 +
          noise(layers[2], x, y) * 0.16;
      pixels[offset] = Math.round(core[index] * 255);
      pixels[offset + 1] = Math.round(
        THREE.MathUtils.clamp(frost + (random() - 0.5) * 0.065, 0, 1) * 255,
      );
      pixels[offset + 2] = Math.round(rim[index] * 255);
      pixels[offset + 3] = 255;
    }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = 'Glacier fracture / frost / rim';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

const surfaceShader = `
uniform sampler2D glacierSurface;
varying vec2 vGlacierWorld;
vec2 glacierHash(vec2 p){
  vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
  p3+=dot(p3,p3.yzx+33.33);
  return fract((p3.xx+p3.yz)*p3.zy);
}
float glacierNoise(vec2 p){
  vec2 c=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(glacierHash(c).x,glacierHash(c+vec2(1.,0.)).x,f.x),mix(glacierHash(c+vec2(0.,1.)).x,glacierHash(c+vec2(1.)).x,f.x),f.y);
}
vec3 glacierSample(vec2 vertex,vec2 uv,vec2 dx,vec2 dy){
  // Each triangular lattice vertex chooses an independent texture offset.
  // Explicit gradients prevent random offsets from producing mip seams.
  return textureGrad(glacierSurface,uv+glacierHash(vertex)*11.,dx,dy).rgb;
}
vec3 glacierSurfaceAt(vec2 world){
  vec2 grid=world/23.,cell=floor(grid),f=fract(grid),uv=world/38.;
  vec2 dx=dFdx(uv),dy=dFdy(uv);
  vec2 a=cell,b=cell+vec2(1.,0.),c=cell+vec2(0.,1.);
  vec3 weight=vec3(1.-f.x-f.y,f.x,f.y);
  if(f.x+f.y>1.){a=cell+vec2(1.);weight=vec3(f.x+f.y-1.,1.-f.y,1.-f.x);}
  // Shared vertex weights agree on both sides of every triangle edge.
  return glacierSample(a,uv,dx,dy)*weight.x+glacierSample(b,uv,dx,dy)*weight.y+glacierSample(c,uv,dx,dy)*weight.z;
}
`;

export function createIceMaterial() {
  const texture = createIceTexture();
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.28,
    metalness: 0.08,
    clearcoat: 0.85,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1.4,
    side: THREE.DoubleSide,
  });
  material.name = 'Glacier stochastic world-space ice';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.glacierSurface = { value: texture };
    shader.vertexShader = 'varying vec2 vGlacierWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvGlacierWorld=(modelMatrix*vec4(transformed,1.)).xz;',
    );
    shader.fragmentShader = surfaceShader + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      vec3 glacier=glacierSurfaceAt(vGlacierWorld);
      float broadFrost=glacierNoise(vGlacierWorld*.018)*.72+glacierNoise(vGlacierWorld*.047+17.)*.28;
      float frost=clamp(glacier.g*.74+broadFrost*.90-.26,0.,1.);
      diffuseColor.rgb=mix(vec3(.22,.47,.58),vec3(.72,.87,.90),frost);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12,.36,.47),glacier.r*.55);
      diffuseColor.rgb+=glacier.b*vec3(.14,.16,.16);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor=mix(.17,.61,frost)+glacier.r*.08;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_fragment>',
      '#include <lights_physical_fragment>\nmaterial.clearcoatRoughness=mix(.09,.42,frost);',
    );
  };
  material.customProgramCacheKey = () => 'glacier-stochastic-v1';
  material.addEventListener('dispose', () => texture.dispose());
  return material;
}
