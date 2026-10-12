import * as THREE from 'three';
import {createPickupModel,PICKUP_COLORS} from './pickups.js';
import {WEAPONS} from '../shared/combat.js';
const SIZE=256;
// Draw each actual pickup model once, using the existing game renderer. No
// second WebGL context or extra per-frame scene is needed for the HUD.
export function weaponPortrait(renderer,kind,environment=null){
  const scene=new THREE.Scene(),model=createPickupModel(kind);scene.add(model);scene.environment=environment;scene.environmentIntensity=1.1;
  scene.add(new THREE.HemisphereLight(0xe5f3ff,0x526277,2));
  const key=new THREE.DirectionalLight(0xffffff,3.5);key.position.set(-3,5,6);scene.add(key);
  const rim=new THREE.DirectionalLight(PICKUP_COLORS[kind],2);rim.position.set(4,1,-3);scene.add(rim);
  const bounds=new THREE.Box3().setFromObject(model),sphere=bounds.getBoundingSphere(new THREE.Sphere()),radius=sphere.radius*1.13;
  const camera=new THREE.OrthographicCamera(-radius,radius,radius,-radius,.1,40);camera.position.copy(sphere.center).add(new THREE.Vector3(4,3,6));camera.lookAt(sphere.center);camera.updateMatrixWorld();
  const target=new THREE.WebGLRenderTarget(SIZE,SIZE);target.texture.colorSpace=THREE.SRGBColorSpace;
  const previous=renderer.getRenderTarget(),clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
  try{
    renderer.setRenderTarget(target);renderer.setClearColor(0x000000,0);renderer.render(scene,camera);
    const pixels=new Uint8Array(SIZE*SIZE*4);renderer.readRenderTargetPixels(target,0,0,SIZE,SIZE,pixels);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;const ctx=canvas.getContext('2d'),image=ctx.createImageData(SIZE,SIZE);
    for(let y=0;y<SIZE;y++)image.data.set(pixels.subarray((SIZE-y-1)*SIZE*4,(SIZE-y)*SIZE*4),y*SIZE*4);
    ctx.putImageData(image,0,0);return canvas;
  }finally{renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);target.dispose();}
}
export class WeaponHUD{
  constructor(root,getWorld){
    this.root=root;this.getWorld=getWorld;this.cache=new Map();this.kind=null;
    this.canvas=root.querySelector('canvas');this.name=root.querySelector('.weapon-name');this.ammo=root.querySelector('.weapon-ammo');this.key=root.querySelector('kbd');
  }
  update(car,{visible=true,controller=false,sky=false,skyRemaining=0,color='#cbd5df'}={}){
    if(!visible)return;
    this.root.dataset.sky=String(sky);
    if(sky){this.kind='sky';this.root.dataset.loaded='true';this.root.style.setProperty('--weapon-color',color);this.name.textContent='Sky beam';this.ammo.textContent=skyRemaining>0?skyRemaining.toFixed(1)+'s':'READY';this.key.textContent=controller?'R1':'Enter ↵';this.root.setAttribute('aria-label','Sky beam, '+this.ammo.textContent);return;}
    const kind=car&&!car.eliminated&&car.ammo>0&&WEAPONS[car.item]?car.item:null,world=this.getWorld();
    this.root.dataset.loaded=String(!!kind);this.key.textContent=controller?'R1':'Enter ↵';
    if(kind!==this.kind||kind&&!this.cache.has(kind)){
      const ctx=this.canvas.getContext('2d');ctx.clearRect(0,0,SIZE,SIZE);
      if(kind&&world){if(!this.cache.has(kind))this.cache.set(kind,weaponPortrait(world.renderer,kind,world.scene.environment));ctx.drawImage(this.cache.get(kind),0,0);}
      this.root.style.setProperty('--weapon-color',kind?'#'+PICKUP_COLORS[kind].toString(16).padStart(6,'0'):'#a3b3c0');
      this.name.textContent=kind?WEAPONS[kind].name:'No weapon';this.kind=kind;
    }
    const remaining=kind?(kind==='flame'||kind==='taser'?`${car.ammo.toFixed(1)}s`:`× ${Math.ceil(car.ammo)}`):'';
    if(this.ammo.textContent!==remaining)this.ammo.textContent=remaining;
    this.root.setAttribute('aria-label',kind?`${WEAPONS[kind].name}, ${remaining}`:'No weapon');
  }
}
