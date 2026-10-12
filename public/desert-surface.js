import * as THREE from 'three';
// World-space detail keeps road and the broad valley floor at a believable scale.
// Three noise octaves, no textures, no added passes or animated buffer uploads.
export function createDesertMaterial(ground=false){
  const material=new THREE.MeshStandardMaterial({color:ground?0xc89c63:0xc5a274,roughness:1,metalness:0,envMapIntensity:.12,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 desertPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\ndesertPosition=(modelMatrix*vec4(position,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 desertPosition;
      float desertHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float desertNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(desertHash(i),desertHash(i+vec2(1.,0.)),f.x),mix(desertHash(i+vec2(0.,1.)),desertHash(i+1.),f.x),f.y);}
    `).replace('#include <color_fragment>',`#include <color_fragment>
      vec2 p=desertPosition.xz;float macro=desertNoise(p*.024),mottle=desertNoise(p*.31);
      float footprint=max(length(dFdx(p)),length(dFdy(p)));
      float ripple=sin(p.x*3.1+p.y*.9+mottle*5.)*.5+.5;
      ripple=mix(.5,ripple,1.-smoothstep(.35,1.2,footprint));
      float grain=desertNoise(p*10.);grain=mix(.5,grain,1.-smoothstep(.04,.22,footprint));
      diffuseColor.rgb*=.78+macro*.28+mottle*.14+grain*.1;
      diffuseColor.rgb*=1.+(ripple-.5)*${ground?'.14':'.045'};
    `);
  };
  material.customProgramCacheKey=()=>`desert-ground-${ground}`;
  return material;
}
