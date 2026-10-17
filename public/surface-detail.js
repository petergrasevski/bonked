import { useBakedNoise, noise3DGLSL } from './baked-noise.js';
// Shared world-space weathering survives static batching. Fine detail fades
// below a pixel to avoid sparkling terrain when the pack camera pulls back.
export function weatherSurface(material, { rock = false } = {}) {
  const noiseTexture = useBakedNoise(material, true);
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previousCompile.call(this, shader, renderer);
    shader.uniforms.terrainNoise3D = { value: noiseTexture };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 finishWorld;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvec4 finishPoint=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nfinishPoint=instanceMatrix*finishPoint;\n#endif\nfinishWorld=(modelMatrix*finishPoint).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 finishWorld;
      ${noise3DGLSL}
    `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float strataNoise=bakedNoise3D(finishWorld*.27);
      float strata=sin(finishWorld.y*${rock ? '2.1' : '3.5'}+strataNoise*5.);
      float detailFootprint=max(length(dFdx(finishWorld)),length(dFdy(finishWorld)));
      float fineFade=1.-smoothstep(.12,.65,detailFootprint);
      float pores=(bakedNoise3D(finishWorld*3.8)-.5)*fineFade;
      diffuseColor.rgb*=.86+strataNoise*.22+strata*${rock ? '.075' : '.025'}+pores*.12;
    `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+(strataNoise-.5)*.14,.65,1.);
    `,
      );
  };
  material.customProgramCacheKey = () => `${previousKey}-weathered-${rock}-baked-v2`;
  return material;
}
