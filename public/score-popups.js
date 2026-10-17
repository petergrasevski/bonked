import * as THREE from 'three';

export class ScorePopups{
  constructor(scene){
    this.scene=scene;this.group=new THREE.Group();this.group.name='kill-score-popups';scene.add(this.group);this.seen=new Set();this.active=new Map();
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const ctx=canvas.getContext('2d');
    ctx.font='900 92px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=13;ctx.strokeStyle='#172129';ctx.strokeText('+1',128,65);ctx.fillStyle='#ffedab';ctx.fillText('+1',128,65);
    this.texture=new THREE.CanvasTexture(canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
    this.material=new THREE.SpriteMaterial({map:this.texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
  }
  reset(){for(const {sprite}of this.active.values()){this.group.remove(sprite);sprite.material.dispose();}this.active.clear();this.seen.clear();}
  update(state,cars,now){
    const epoch=state?`${state.code}:${state.round}:${state.startAt}`:null;
    if(epoch!==this.epoch){this.reset();this.epoch=epoch;}
    for(const e of state?.effects||[]){
      if(e.kind!=='kill-score'||this.seen.has(e.id))continue;this.seen.add(e.id);
      const duration=e.duration||1100,remaining=e.until-(state.combatTime??state.time);if(remaining<=0)continue;
      const sprite=new THREE.Sprite(this.material.clone());sprite.scale.set(3.2,1.6,1);sprite.renderOrder=20;this.group.add(sprite);
      const slot=[...this.active.values()].filter(p=>p.owner===e.owner).length;
      this.active.set(e.id,{sprite,owner:e.owner,slot,start:now-(duration-remaining),duration});
    }
    for(const [id,popup]of this.active){
      const {sprite,owner,start,duration}=popup,t=Math.max(0,(now-start)/duration),car=cars.get(owner);
      if(t>=1||!car){this.group.remove(sprite);sprite.material.dispose();this.active.delete(id);continue;}
      sprite.visible=car.visible;sprite.position.copy(car.position);sprite.position.y+=3.4+popup.slot*1.4+t*1.8;
      sprite.material.opacity=Math.min(1,(1-t)*3);const scale=1+Math.sin(Math.min(1,t*5)*Math.PI)*.15;sprite.scale.set(3.2*scale,1.6*scale,1);
    }
  }
  dispose(){this.reset();this.scene.remove(this.group);this.material.dispose();this.texture.dispose();}
}
