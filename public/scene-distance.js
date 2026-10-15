export const SCENERY_RANGE={coast:260,ice:240,desert:300,factory:650,volcano:850};
export function sceneRange(trackId,frame){return Math.max(SCENERY_RANGE[trackId]||260,frame?.far||0);}
// Fog and its distant grey fade run in the scene materials, with no image pass.
export class DistanceFade{
  constructor(){this.start={value:180};this.end={value:250};this.materials=new WeakSet();}
  update(far){this.start.value=far*.65;this.end.value=far*.97;}
  apply(root){root.traverse(o=>{for(const material of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])this.applyMaterial(material);});}
  applyMaterial(material){
    if(!material.fog||this.materials.has(material))return;
    this.materials.add(material);const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      previous.call(material,shader,renderer);shader.uniforms.sceneFadeStart=this.start;shader.uniforms.sceneFadeEnd=this.end;
      if(shader.fragmentShader.includes('#include <fog_fragment>')||shader.fragmentShader.includes('#include <dithering_fragment>')){
        shader.fragmentShader='uniform float sceneFadeStart,sceneFadeEnd;\n'+shader.fragmentShader;
        const marker=shader.fragmentShader.includes('#include <fog_fragment>')?'#include <fog_fragment>':'#include <dithering_fragment>';
        shader.fragmentShader=shader.fragmentShader.replace(marker,`${marker}
          #ifdef USE_FOG
            gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,smoothstep(sceneFadeStart,sceneFadeEnd,vFogDepth));
          #endif`);
      }
    };
    material.customProgramCacheKey=()=>`${key}-distance-fade-v1`;material.needsUpdate=true;
  }
}
