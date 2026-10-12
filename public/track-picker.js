import * as THREE from 'three';
import {TRACK_TITLES} from './track-title-assets.js';
import {World} from './world.js';
import {TRACKS,activeTrack,selectTrack,trackAt} from '../shared/game.js';
const SIZE=320;
export const SELECTED_PREVIEW_INTERVAL=100;
export function captureTrackPreview(world,canvas,now=0){
  const id=world.trackId,camera=new THREE.PerspectiveCamera(48,1,.2,1400);let target;
  if(id==='coast'){const p=trackAt(.15);target=new THREE.Vector3(p.x+p.nx*18,3,p.z+p.nz*18);camera.position.set(p.x+p.nx*65-Math.cos(p.angle)*32,65,p.z+p.nz*65-Math.sin(p.angle)*32);}
  else if(id==='ice'){target=new THREE.Vector3(0,0,0);camera.position.set(95,140,150);}
  else{const p=trackAt(.25);target=new THREE.Vector3(p.x,24,p.z);camera.position.set(p.x+145,150,p.z+125);}
  // Pan up the scene so the landmark sits below the title artwork, keeping
  // the view angle/scale intact. Glacier's framing already clears its title.
  const north=id==='coast'?16:id==='desert'?38:0;
  if(north){const pan=target.clone().sub(camera.position);pan.y=0;pan.normalize().multiplyScalar(north);camera.position.add(pan);target.add(pan);}
  camera.lookAt(target);camera.updateMatrixWorld();
  const renderTarget=world.previewTarget??=new THREE.WebGLRenderTarget(SIZE,SIZE);renderTarget.texture.colorSpace=THREE.SRGBColorSpace;
  const previousTarget=world.renderer.getRenderTarget(),sun=world.sun.position.clone(),sunTarget=world.sun.target.position.clone(),hidden=[...world.previewCars,...world.cars.values(),world.deadline].map(o=>[o,o.visible]);
  try{
    for(const [o]of hidden)o.visible=false;
    const [sx,sy,sz]=world.atmosphere.profile.sunOffset;world.sun.position.copy(target).add(new THREE.Vector3(sx,sy,sz));world.sun.target.position.copy(target);world.sun.target.updateMatrixWorld();world.atmosphere.update(camera,now,target.y);
    world.renderer.setRenderTarget(renderTarget);world.renderer.render(world.scene,camera);
    const pixels=world.previewPixels??=new Uint8Array(SIZE*SIZE*4);world.renderer.readRenderTargetPixels(renderTarget,0,0,SIZE,SIZE,pixels);
    if(canvas.width!==SIZE){canvas.width=SIZE;canvas.height=SIZE;}
    const ctx=canvas.getContext('2d'),data=canvas.previewImageData??=ctx.createImageData(SIZE,SIZE);for(let y=0;y<SIZE;y++)data.data.set(pixels.subarray((SIZE-y-1)*SIZE*4,(SIZE-y)*SIZE*4),y*SIZE*4);ctx.putImageData(data,0,0);
  }finally{world.renderer.setRenderTarget(previousTarget);world.sun.position.copy(sun);world.sun.target.position.copy(sunTarget);world.sun.target.updateMatrixWorld();for(const [o,visible]of hidden)o.visible=visible;}
}
export function createTrackPicker(root,getWorld,onSelect){
  const cards=new Map(),rendered=new Set();let visible=false,queued=false,lastCapture=-Infinity;
  for(const track of Object.values(TRACKS)){
    const button=document.createElement('button');button.type='button';button.className='track-card '+track.id;button.setAttribute('aria-label',track.name);button.setAttribute('aria-pressed','false');button.dataset.trackId=track.id;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;canvas.setAttribute('aria-hidden','true');
    const image=document.createElement('img');image.src=TRACK_TITLES[track.id];image.width=960;image.height=480;image.decoding='async';image.alt='';image.className='track-title';image.draggable=false;
    const check=document.createElement('span');check.className='track-selected';check.textContent='✓';check.setAttribute('aria-hidden','true');button.append(canvas,image,check);button.onclick=()=>onSelect(track.id);root.append(button);cards.set(track.id,{button,canvas});
  }
  const generateMissing=()=>{
    queued=false;if(!visible||document.hidden)return;
    const id=[...cards.keys()].find(id=>!rendered.has(id));if(!id)return;
    const previous=activeTrack.id;let preview;
    try{selectTrack(id);preview=new World(document.createElement('div'),{preview:true});captureTrackPreview(preview,cards.get(id).canvas,12500);rendered.add(id);cards.get(id).button.classList.add('ready');}
    catch(error){console.error('Track preview',error);rendered.add(id);}
    finally{preview?.dispose();selectTrack(previous);}
  };
  return {
    sync(id,canSelect,isVisible){visible=isVisible;for(const [key,{button}]of cards){button.setAttribute('aria-pressed',String(key===id));button.disabled=!canSelect;}},
    tick(now){
      if(!visible||document.hidden)return;
      const world=getWorld();if(world&&now-lastCapture>=SELECTED_PREVIEW_INTERVAL){lastCapture=now;const card=cards.get(world.trackId);captureTrackPreview(world,card.canvas,now);rendered.add(world.trackId);card.button.classList.add('ready');}
      if(!queued&&[...cards.keys()].some(id=>!rendered.has(id))){queued=true;if(window.requestIdleCallback)requestIdleCallback(generateMissing,{timeout:1500});else setTimeout(generateMissing,100);}
    }
  };
}
