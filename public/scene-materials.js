// Page-wide car/pickup templates stay immutable. Circuit-specific shader
// uniforms must never leak into another world's cached models or HUD previews.
export class SceneMaterials{
  constructor(){this.materials=new Map();this.owned=new WeakSet();}
  adopt(root,all=false){
    const own=source=>{if(this.owned.has(source)||(!all&&!source.userData.sharedCarResource))return source;let copy=this.materials.get(source);if(!copy){copy=source.clone();delete copy.userData.sharedCarResource;this.materials.set(source,copy);this.owned.add(copy);}return copy;};
    root.traverse(mesh=>{if(mesh.material)mesh.material=Array.isArray(mesh.material)?mesh.material.map(own):own(mesh.material);});
    return root;
  }
}
