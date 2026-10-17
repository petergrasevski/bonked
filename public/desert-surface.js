import { useBakedNoise, noise2DGLSL } from './baked-noise.js';
import * as THREE from 'three';
// World-space detail keeps road and the broad valley floor at a believable scale.
// Cached noise values retain the three scales without per-pixel hash arithmetic.
export function createDesertMaterial(ground = false) {
  const material = new THREE.MeshStandardMaterial({
    color: ground ? 0xc89c63 : 0xc5a274,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.12,
    side: THREE.DoubleSide,
  });
  const noiseTexture = useBakedNoise(material);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainNoise = { value: noiseTexture };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 desertPosition;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ndesertPosition=(modelMatrix*vec4(position,1.)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 desertPosition;
      ${noise2DGLSL}
    `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec2 p=desertPosition.xz;float macro=bakedNoise2D(p*.024),mottle=bakedNoise2D(p*.31);
      float footprint=max(length(dFdx(p)),length(dFdy(p)));
      float ripple=sin(p.x*3.1+p.y*.9+mottle*5.)*.5+.5;
      ripple=mix(.5,ripple,1.-smoothstep(.35,1.2,footprint));
      float grain=bakedNoise2D(p*10.);grain=mix(.5,grain,1.-smoothstep(.04,.22,footprint));
      diffuseColor.rgb*=.78+macro*.28+mottle*.14+grain*.1;
      diffuseColor.rgb*=1.+(ripple-.5)*${ground ? '.14' : '.045'};
    `,
      );
  };
  material.customProgramCacheKey = () => `desert-ground-baked-${ground}`;
  return material;
}
