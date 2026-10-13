import * as THREE from 'three';
// World-space sand: warm dry grains, broad dune staining, shallow ripples and a
// damp tideline. All microdetail fades below pixel size; no animated noise/sparkle.
export function createCoastalSandMaterial(){
  const material=new THREE.MeshStandardMaterial({color:0xe3c48f,roughness:1,metalness:0,envMapIntensity:.32,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 sandWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nsandWorld=(modelMatrix*vec4(position,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 sandWorld;
      float sandHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float sandNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(sandHash(i),sandHash(i+vec2(1.,0.)),f.x),mix(sandHash(i+vec2(0.,1.)),sandHash(i+1.),f.x),f.y);}
    `).replace('#include <color_fragment>',`#include <color_fragment>
      vec2 sandP=sandWorld.xz;float sandBroad=sandNoise(sandP*.075),sandMottle=sandNoise(sandP*.47);
      float sandFootprint=max(length(dFdx(sandP)),length(dFdy(sandP)));
      float sandPhase=dot(sandP,vec2(3.8,1.45))+sandMottle*3.5;
      float sandFilter=1.-smoothstep(.28,.85,sandFootprint);
      float sandRipple=cos(sandPhase)*sandFilter;
      float sandGrain=(sandNoise(sandP*22.)-.5)*(1.-smoothstep(.018,.11,sandFootprint));
      float sandWet=1.-smoothstep(-1.85,-.7,sandWorld.y+(sandMottle-.5)*.25);
      diffuseColor.rgb*=.86+sandBroad*.18+sandMottle*.09+sandRipple*.035+sandGrain*.19;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.60,.65,.68),sandWet);
    `).replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
      vec3 sandSlope=vec3(3.8,0.,1.45)*sin(sandPhase)*.025*sandFilter;
      normal=normalize(normal-(viewMatrix*vec4(sandSlope,0.)).xyz);
    `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=mix(.98,.56,sandWet);
    `);
  };
  material.customProgramCacheKey=()=> 'coastal-sand-v1';return material;
}
