import * as THREE from 'three';
import {skyPatch,skyRayGround} from '../shared/sky-ground.js';
import {boundedSkyAim} from '../shared/sky-beam.js';
export function advanceSkyCursor(cursor,move,dt){
  const length=Math.max(1,Math.hypot(move.x,move.y));
  cursor.x=Math.max(-.82,Math.min(.82,cursor.x+move.x/length*dt*.8));cursor.y=Math.max(-.72,Math.min(.76,cursor.y+move.y/length*dt*.8));return cursor;
}
// Keep position and velocity continuous between network updates, using the same
// critically damped correction as cars. This is visual only; never predict a hit.
export function smoothSkyTarget(previous,target,dt){
  if(!previous||Math.hypot(target.x-previous.x,target.z-previous.z)>60)return {x:target.x,z:target.z,vx:0,vz:0};
  const omega=24,decay=Math.exp(-omega*dt);
  for(const [axis,velocity]of [['x','vx'],['z','vz']]){
    const offset=previous[axis]-target[axis],v=previous[velocity],c=v+omega*offset;
    previous[axis]=target[axis]+(offset+c*dt)*decay;previous[velocity]=(v-omega*c*dt)*decay;
  }
  return previous;
}
export class SkyBeamView{
  constructor(scene){this.scene=scene;this.targets=new Map();this.beams=new Map();this.cursor=new THREE.Vector2(0,0);this.ray=new THREE.Raycaster();this.aim=null;this.round=null;}
  marker(color){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(4096*3),3).setUsage(THREE.DynamicDrawUsage));
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{center:{value:new THREE.Vector2()},color:{value:new THREE.Color(color)},opacity:{value:.5}},
      vertexShader:`varying vec2 point;void main(){point=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform vec2 center;uniform vec3 color;uniform float opacity;varying vec2 point;void main(){vec2 p=point-center;float r=length(p);if(r>4.)discard;float ring=smoothstep(3.5,3.7,r);float cross=1.-smoothstep(.08,.16,min(abs(p.x),abs(p.y)));float line=max(ring,cross);gl_FragColor=vec4(mix(color,color*.12,line),opacity*mix(.6,1.7,line));
      #include <colorspace_fragment>
      }`});
    const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=6;this.scene.add(mesh);return mesh;
  }
  update(state,localId,camera,frame,move,dt){
    const active=state?.phase==='racing',me=state?.players.find(p=>p.id===localId),key=active&&me?.eliminated&&!me.bot?state.code+':'+state.round:null;
    if(key!==this.round){this.round=key;this.cursor.set(0,0);}
    this.aim=null;
    if(key){advanceSkyCursor(this.cursor,move,dt);this.ray.setFromCamera(this.cursor,camera);const hit=skyRayGround(this.ray.ray.origin,this.ray.ray.direction);if(hit)this.aim=boundedSkyAim(hit,frame);}
    const present=new Set(),time=state?.combatTime??state?.time??0,roundKey=state?.code+':'+state?.round+':'+state?.trackId;
    if(active)for(const p of state.players){let target=p.id===localId?this.aim:p.skyTarget;if(p.bot||!p.eliminated||!target)continue;
      present.add(p.id);let mesh=this.targets.get(p.id);if(!mesh){mesh=this.marker(p.color);this.targets.set(p.id,mesh);}
      if(mesh.userData.round!==roundKey){mesh.userData.round=roundKey;mesh.userData.motion=null;mesh.userData.cell=null;}
      if(p.id!==localId)target=mesh.userData.motion=smoothSkyTarget(mesh.userData.motion,target,dt);
      const cell=Math.floor(target.x/12)+','+Math.floor(target.z/12);
      if(mesh.userData.cell!==cell){mesh.userData.cell=cell;const vertices=skyPatch(target.x,target.z);let attr=mesh.geometry.attributes.position;if(attr.array.length<vertices.length){attr=new THREE.BufferAttribute(new Float32Array(3*2**Math.ceil(Math.log2(vertices.length/3))),3).setUsage(THREE.DynamicDrawUsage);mesh.geometry.setAttribute('position',attr);}attr.array.set(vertices);attr.needsUpdate=true;mesh.geometry.setDrawRange(0,vertices.length/3);}
      mesh.material.uniforms.center.value.set(target.x,target.z);mesh.material.uniforms.opacity.value=time<p.skyCooldownUntil?.18:.5;
    }
    for(const [id,mesh]of this.targets)if(!present.has(id)){this.scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();this.targets.delete(id);}
    const strikes=new Set();if(active)for(const strike of state.skyBeams||[]){if(time>=strike.impactAt)continue;strikes.add(strike.id);let bolt=this.beams.get(strike.id);
      if(!bolt){bolt=new THREE.Group();for(const [radius,opacity]of [[.65,.3],[.2,1]]){const line=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,10,7),new THREE.MeshBasicMaterial({color:strike.color,transparent:true,opacity,depthWrite:false,toneMapped:false}));bolt.add(line);}this.scene.add(bolt);this.beams.set(strike.id,bolt);}
      const t=Math.max(0,Math.min(1,(time-strike.at)/(strike.impactAt-strike.at)));bolt.position.set(strike.x,strike.y+5+80*(1-t),strike.z);
    }
    for(const [id,bolt]of this.beams)if(!strikes.has(id)){this.scene.remove(bolt);bolt.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.beams.delete(id);}
  }
}
