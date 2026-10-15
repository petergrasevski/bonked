import * as THREE from 'three';
import {TRACK_TITLES} from './track-title-assets.js';
import {TRACKS,trackAt} from '../shared/game.js';
const SIZE=320;
export const SELECTED_PREVIEW_INTERVAL=100;
export function captureTrackPreview(world,canvas,now=0){
  const id=world.trackId,camera=new THREE.PerspectiveCamera(48,1,.2,1400);let target;
  if(id==='coast'){const p=trackAt(14.5/24);target=new THREE.Vector3(p.x+p.nx*4,0,p.z+p.nz*4);camera.position.set(p.x+p.nx*43-Math.cos(p.angle)*22,39,p.z+p.nz*43-Math.sin(p.angle)*22);}
  else if(id==='ice'){target=new THREE.Vector3(0,0,0);camera.position.set(95,140,150);}
  else if(['factory','volcano'].includes(id)){const p=trackAt(id==='volcano'?.19:.18),side=id==='volcano'?-1:1;target=new THREE.Vector3(p.x,p.y+3,p.z);camera.position.set(p.x+p.nx*45*side-Math.cos(p.angle)*30,p.y+(id==='volcano'?30:47),p.z+p.nz*45*side-Math.sin(p.angle)*30);}
  else{const p=trackAt(.25);target=new THREE.Vector3(p.x,24,p.z);camera.position.set(p.x+145,150,p.z+125);}
  // Pan up the scene so the landmark sits below the title artwork, keeping
  // the view angle/scale intact. Frost & Furious's framing already clears its title.
  const north=id==='coast'?7:id==='desert'?38:0;
  if(north){const pan=target.clone().sub(camera.position);pan.y=0;pan.normalize().multiplyScalar(north);camera.position.add(pan);target.add(pan);}
  camera.lookAt(target);camera.updateMatrixWorld();
  const renderTarget=world.previewTarget??=new THREE.WebGLRenderTarget(SIZE,SIZE);renderTarget.texture.colorSpace=THREE.SRGBColorSpace;
  const previousTarget=world.renderer.getRenderTarget(),sun=world.sun.position.clone(),sunTarget=world.sun.target.position.clone(),hidden=[...world.previewCars,...world.cars.values(),world.deadline].map(o=>[o,o.visible]);
  try{
    for(const [o]of hidden)o.visible=false;
    const [sx,sy,sz]=world.atmosphere.profile.sunOffset;world.sun.position.copy(target).add(new THREE.Vector3(sx,sy,sz));world.sun.target.position.copy(target);world.sun.target.updateMatrixWorld();world.atmosphere.update(camera,now,target.y);
    world.cullDistantScenery(camera);world.renderer.setRenderTarget(renderTarget);world.renderer.render(world.scene,camera);
    const pixels=world.previewPixels??=new Uint8Array(SIZE*SIZE*4);world.renderer.readRenderTargetPixels(renderTarget,0,0,SIZE,SIZE,pixels);
    if(canvas.width!==SIZE){canvas.width=SIZE;canvas.height=SIZE;}
    const ctx=canvas.getContext('2d'),data=canvas.previewImageData??=ctx.createImageData(SIZE,SIZE);for(let y=0;y<SIZE;y++)data.data.set(pixels.subarray((SIZE-y-1)*SIZE*4,(SIZE-y)*SIZE*4),y*SIZE*4);ctx.putImageData(data,0,0);
  }finally{world.renderer.setRenderTarget(previousTarget);world.sun.position.copy(sun);world.sun.target.position.copy(sunTarget);world.sun.target.updateMatrixWorld();for(const [o,visible]of hidden)o.visible=visible;world.cullDistantScenery(world.camera);}
}
export function createTrackPicker(root,getWorld,onSelect,isLoading=()=>false){
  const cards=new Map();let visible=false,lastCapture=-Infinity,selected=null,drag=null,suppressClick=false;
  const shell=document.createElement('div');shell.className='circuit-carousel';root.before(shell);shell.append(root);root.tabIndex=0;
  const previous=document.createElement('button'),next=document.createElement('button');
  for(const [button,label,glyph]of [[previous,'Previous circuits','‹'],[next,'Next circuits','›']]){button.type='button';button.className='circuit-scroll';button.setAttribute('aria-label',label);button.textContent=glyph;shell.append(button);}
  previous.classList.add('previous');next.classList.add('next');
  const motion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
  const updateArrows=()=>{previous.disabled=root.scrollLeft<2;next.disabled=root.scrollLeft+root.clientWidth>=root.scrollWidth-2;};
  const scroll=direction=>root.scrollTo({left:Math.max(0,Math.min(root.scrollWidth-root.clientWidth,root.scrollLeft+direction*((root.firstElementChild?.getBoundingClientRect().width||100)+(parseFloat(getComputedStyle(root).columnGap)||10)))),behavior:motion()});previous.onclick=()=>scroll(-1);next.onclick=()=>scroll(1);
  root.addEventListener('scroll',updateArrows,{passive:true});new ResizeObserver(updateArrows).observe(root);
  root.addEventListener('keydown',e=>{if(e.target!==root)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();scroll(e.key==='ArrowRight'?1:-1);}});
  root.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)>=Math.abs(e.deltaY))return;const delta=e.deltaY*(e.deltaMode===1?16:1),canScroll=delta<0?root.scrollLeft>0:root.scrollLeft+root.clientWidth<root.scrollWidth-1;if(canScroll){e.preventDefault();root.scrollLeft+=delta;}},{passive:false});
  root.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0)return;drag={id:e.pointerId,x:e.clientX,scroll:root.scrollLeft,moved:false};suppressClick=false;});
  root.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const delta=e.clientX-drag.x;if(Math.abs(delta)>6&&!drag.moved){drag.moved=true;root.setPointerCapture(e.pointerId);root.classList.add('dragging');}if(drag.moved){e.preventDefault();root.scrollLeft=drag.scroll-delta;}});
  const stopDrag=e=>{if(!drag)return;suppressClick=drag.moved;if(root.hasPointerCapture(e.pointerId))root.releasePointerCapture(e.pointerId);root.classList.remove('dragging');drag=null;};root.addEventListener('pointerup',stopDrag);root.addEventListener('pointercancel',stopDrag);
  root.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopPropagation();suppressClick=false;}},true);
  for(const track of Object.values(TRACKS)){
    const button=document.createElement('button');button.type='button';button.className='track-card '+track.id;button.setAttribute('aria-label',track.name);button.setAttribute('aria-pressed','false');button.dataset.trackId=track.id;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;canvas.setAttribute('aria-hidden','true');
    if(TRACK_TITLES[track.id]){
      const image=document.createElement('img');image.src=TRACK_TITLES[track.id];image.width=960;image.height=480;image.decoding='async';image.alt='';image.className='track-title';image.draggable=false;
      const preview=document.createElement('img');preview.src=`/track-previews/${track.id}.webp`;preview.alt='';preview.width=preview.height=SIZE;preview.className='track-preview';preview.decoding='async';preview.draggable=false;
      button.append(preview,canvas,image);
    }else{
      button.classList.add('text-card');
      const title=document.createElement('span');title.className='track-card-name';title.textContent=track.name;
      const description=document.createElement('span');description.className='track-card-description';description.textContent=track.description;
      button.append(canvas,title,description);
    }
    const check=document.createElement('span');check.className='track-selected';check.textContent='✓';check.setAttribute('aria-hidden','true');button.append(check);button.onclick=()=>onSelect(track.id);root.append(button);cards.set(track.id,{button,canvas});
  }
  return {
    sync(id,canSelect,isVisible){visible=isVisible;if(isVisible&&selected!==id){selected=id;const card=cards.get(id)?.button;if(card){const bounds=root.getBoundingClientRect(),item=card.getBoundingClientRect(),delta=item.left<bounds.left?item.left-bounds.left:item.right>bounds.right?item.right-bounds.right:0;if(delta)root.scrollTo({left:Math.max(0,Math.min(root.scrollWidth-root.clientWidth,root.scrollLeft+delta)),behavior:motion()});}}updateArrows();for(const [key,{button}]of cards){button.setAttribute('aria-pressed',String(key===id));button.disabled=!canSelect;}},
    tick(now){
      if(!visible||document.hidden||isLoading())return;
      const world=getWorld();if(world&&now-lastCapture>=SELECTED_PREVIEW_INTERVAL){lastCapture=now;const card=cards.get(world.trackId);captureTrackPreview(world,card.canvas,now);card.button.classList.add('ready');}
    }
  };
}
