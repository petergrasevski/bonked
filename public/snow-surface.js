import { useBakedNoise, noise2DGLSL } from './baked-noise.js';
import * as THREE from 'three';
// Matte, wind-scoured snow contrasts with the glossy race surface. World-space
// drifts and filtered fine detail stay continuous across terrain batches.
export function createSnowMaterial(color = 0xd3e1e8) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.25,
  });
  const noiseTexture = useBakedNoise(material);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainNoise = { value: noiseTexture };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 snowWorld;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nsnowWorld=(modelMatrix*vec4(position,1.)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 snowWorld;
      ${noise2DGLSL}
    `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec2 p=snowWorld.xz;float broad=bakedNoise2D(p*.055),drift=bakedNoise2D(p*vec2(.16,.055)+broad*2.);
      float footprint=max(length(dFdx(p)),length(dFdy(p)));
      float phase=p.x*1.65+p.y*.52+drift*6.;float ridges=sin(phase)*.5+.5;
      float filtered=1.-smoothstep(.4,1.8,footprint);ridges=mix(.5,ridges,filtered);
      float grain=mix(.5,bakedNoise2D(p*13.),1.-smoothstep(.03,.16,footprint));
      diffuseColor.rgb*=.72+broad*.23+drift*.14+(ridges-.5)*.055+(grain-.5)*.09;
      diffuseColor.rgb=mix(diffuseColor.rgb*vec3(.75,.87,1.),diffuseColor.rgb,smoothstep(.18,.75,broad));
    `,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
      vec3 snowSlope=vec3(1.65,0.,.52)*cos(phase)*.035*filtered;
      normal=normalize(normal-(viewMatrix*vec4(snowSlope,0.)).xyz);
    `,
      );
  };
  material.customProgramCacheKey = () => 'wind-snow-baked-v2';
  return material;
}
