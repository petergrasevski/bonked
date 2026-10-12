import * as THREE from 'three';
import {CAR_LENGTH,CAR_WIDTH} from '../shared/game.js';
// Only inspect the eight small chassis bounds on a tap, never the detailed meshes.
export function pickCar(cars,camera,rect,x,y,localId,touch=false){
  let best=null;const margin=touch?12:4;
  for(const [id,car]of cars){
    if(!car.visible)continue;
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity,depth=Infinity,clipped=false;
    for(const a of [-1,1])for(const b of [0,1.25])for(const c of [-1,1]){
      const p=new THREE.Vector3(a*CAR_LENGTH/2,b,c*CAR_WIDTH/2).applyMatrix4(car.matrixWorld).project(camera);
      if(p.z < -1||p.z > 1){clipped=true;break;}
      const px=rect.left+(p.x+1)*rect.width/2,py=rect.top+(1-p.y)*rect.height/2;
      left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);depth=Math.min(depth,p.z);
    }
    if(clipped||x<left-margin||x>right+margin||y<top-margin||y>bottom+margin)continue;
    const direct=x>=left&&x<=right&&y>=top&&y<=bottom;
    if(!best||(direct&&!best.direct)||(direct===best.direct&&depth<best.depth))best={id,depth,direct};
  }
  return best?.id===localId?null:best?.id??null;
}
export class CarNameTooltip{
  constructor(surface,label,{world,state,localId,enabled,now=()=>performance.now()}){
    Object.assign(this,{surface,label,world,state,localId,enabled,now});this.selected=null;this.pointers=new Map();
    surface.addEventListener('pointerdown',e=>{if(e.button!==0||!enabled())return;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,at:now()});});
    surface.addEventListener('pointermove',e=>{const start=this.pointers.get(e.pointerId);if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>12)this.pointers.delete(e.pointerId);});
    surface.addEventListener('pointercancel',e=>this.pointers.delete(e.pointerId));
    surface.addEventListener('pointerleave',e=>this.pointers.delete(e.pointerId));
    surface.addEventListener('pointerup',e=>{
      const start=this.pointers.get(e.pointerId);this.pointers.delete(e.pointerId);
      if(!start||!enabled()||now()-start.at>500||Math.hypot(e.clientX-start.x,e.clientY-start.y)>12)return;
      const view=world();if(!view)return;
      const id=pickCar(view.cars,view.camera,surface.getBoundingClientRect(),e.clientX,e.clientY,localId(),e.pointerType==='touch');
      const s=state(),player=s?.players.find(p=>p.id===id);if(!player)return;
      this.selected={id,until:now()+3000,round:s.code+':'+s.round+':'+s.trackId};
      label.textContent=player.name;label.style.setProperty('--car-color',player.color);this.update(now());
    });
  }
  update(now){
    if(!this.enabled()){this.selected=null;this.pointers.clear();}
    const s=this.state(),selection=this.selected,view=this.world();
    if(!selection||now>=selection.until||!view||selection.round!==s?.code+':'+s?.round+':'+s?.trackId||!s?.players.some(p=>p.id===selection.id)){
      this.selected=null;this.label.hidden=true;return;
    }
    const car=view.cars.get(selection.id);if(!car?.visible){this.label.hidden=true;return;}
    // Use the same rendered car/camera as the scene, rather than network positions.
    const p=new THREE.Vector3(0,2.5,0).applyMatrix4(car.matrixWorld).project(view.camera);
    this.label.hidden=p.z < -1||p.z > 1||Math.abs(p.x)>1||Math.abs(p.y)>1;if(this.label.hidden)return;
    const rect=this.surface.getBoundingClientRect(),x=rect.left+(p.x+1)*rect.width/2,y=rect.top+(1-p.y)*rect.height/2;
    this.label.style.transform=`translate3d(${x}px,${y}px,0) translate(-50%,-100%)`;
  }
}
