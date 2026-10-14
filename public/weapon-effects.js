import * as THREE from 'three';
import {CAR_LENGTH} from '../shared/game.js';
import {FLAME_RANGE,TASER_RADIUS} from '../shared/combat.js';

// All weapons share four fixed-size draws. Visual time, particles and event IDs
// live here only: no random draw or cosmetic pose ever reaches the simulation.
export const WEAPON_EFFECT_LIMITS=Object.freeze({particles:900,segments:4096,rings:160,events:240,seen:2400});
const UP=new THREE.Vector3(0,1,0),TAU=Math.PI*2;
const vertex=`attribute vec4 tint;varying vec4 vTint;varying vec2 vUv;
void main(){vTint=tint;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`;
function batch(geometry,count,mode){
  geometry.setAttribute('tint',new THREE.InstancedBufferAttribute(new Float32Array(count*4),4).setUsage(THREE.DynamicDrawUsage));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:mode==='smoke'?THREE.NormalBlending:THREE.AdditiveBlending,toneMapped:false,
    vertexShader:vertex,fragmentShader:`varying vec4 vTint;varying vec2 vUv;void main(){
      ${mode==='ring'?'float a=1.;':`vec2 p=vUv*2.-1.;float r=dot(p,p);if(r>1.)discard;float a=${mode==='smoke'?'pow(1.-r,2.)*.55':'pow(1.-r,3.)'};`}
      gl_FragColor=vec4(vTint.rgb,vTint.a*a);
      #include <colorspace_fragment>
    }`});
  const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;mesh.name=`weapon-${mode}`;return mesh;
}
export function createWeaponShieldMaterial(){
  return new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.FrontSide,blending:THREE.AdditiveBlending,toneMapped:false,
    uniforms:{time:{value:0},strength:{value:1}},
    vertexShader:`varying vec3 vNormal,vView;varying vec2 vUv;void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=-p.xyz;gl_Position=projectionMatrix*p;}`,
    fragmentShader:`uniform float time,strength;varying vec3 vNormal,vView;varying vec2 vUv;
    void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.5);
      vec2 grid=vUv*vec2(32.,16.);grid.x+=mod(floor(grid.y),2.)*.5;vec2 cell=abs(fract(grid)-.5);
      float cells=smoothstep(.43,.49,max(cell.x,cell.y));float scan=pow(max(0.,sin(vUv.y*35.-time*3.)),12.);
      float alpha=(rim*.6+cells*.075+scan*.09)*strength;gl_FragColor=vec4(mix(vec3(.08,.4,.8),vec3(.35,.86,1.),rim),alpha);
      #include <colorspace_fragment>
    }`});
}

// Keep tracers readable at every camera distance without changing their path.
export function tracerHalfWidth(camera,point,viewportHeight=900){
  const distance=Math.hypot(point.x-camera.position.x,point.y-camera.position.y,point.z-camera.position.z);
  return Math.max(.035,Math.min(.35,distance*Math.tan((camera.fov||58)*Math.PI/360)*2/Math.max(1,viewportHeight)));
}
export class WeaponEffects{
  constructor(scene){
    this.group=new THREE.Group();this.group.name='layered-weapon-effects';scene.add(this.group);
    this.glow=batch(new THREE.PlaneGeometry(2,2),WEAPON_EFFECT_LIMITS.particles,'glow');
    this.smoke=batch(new THREE.PlaneGeometry(2,2),WEAPON_EFFECT_LIMITS.particles,'smoke');
    this.rings=batch(new THREE.RingGeometry(.93,1,64),WEAPON_EFFECT_LIMITS.rings,'ring');
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(WEAPON_EFFECT_LIMITS.segments*18),3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(WEAPON_EFFECT_LIMITS.segments*24),4).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
    this.lines=new THREE.Mesh(geometry,new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
      vertexShader:'attribute vec4 color;varying vec4 vColor;void main(){vColor=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec4 vColor;void main(){gl_FragColor=vColor;\n#include <colorspace_fragment>\n}'}));this.lines.frustumCulled=false;this.lines.name='weapon-ribbons';
    this.group.add(this.smoke,this.glow,this.rings,this.lines);this.particles=[];this.events=[];this.seen=new Set();this.projectiles=new Map();this.round=null;this.clock=0;this.emission=0;
    this.dummy=new THREE.Object3D();this.color=new THREE.Color();this.a=new THREE.Vector3();this.b=new THREE.Vector3();this.direction=new THREE.Vector3();this.side=new THREE.Vector3();this.cameraDirection=new THREE.Vector3();
  }
  reset(){this.particles.length=0;this.events.length=0;this.seen.clear();this.projectiles.clear();this.clock=0;this.emission=0;for(const m of [this.glow,this.smoke,this.rings])m.count=0;this.lines.geometry.setDrawRange(0,0);}
  dispose(){this.group.removeFromParent();for(const mesh of this.group.children){if(mesh.isInstancedMesh)mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();}this.reset();}
  particle(x,y,z,color,size,life,vx=0,vy=0,vz=0,smoke=false,growth=0,gravity=0){
    if(this.particles.length>=WEAPON_EFFECT_LIMITS.particles)return;
    const particle={x,y,z,color,size,life,max:life,vx,vy,vz,smoke,growth,gravity};this.particles.push(particle);return particle;
  }
  burst(x,y,z,color,count=12,speed=8){
    for(let i=0;i<count;i++){const a=Math.random()*TAU,v=speed*(.3+Math.random()*.7);this.particle(x,y,z,color,.08+Math.random()*.08,.25+Math.random()*.45,Math.cos(a)*v,2+Math.random()*v,Math.sin(a)*v,false,0,16);}
  }
  stamp(mesh,index,x,y,z,sx,sy,color,alpha,quaternion){
    const d=this.dummy;d.position.set(x,y,z);d.scale.set(sx,sy,1);d.quaternion.copy(quaternion);d.updateMatrix();mesh.setMatrixAt(index,d.matrix);this.color.set(color);mesh.geometry.attributes.tint.setXYZW(index,this.color.r,this.color.g,this.color.b,alpha);
  }
  ring(x,y,z,radius,color,alpha,width=1){
    if(this.ringCount>=WEAPON_EFFECT_LIMITS.rings)return;
    this.dummy.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
    this.stamp(this.rings,this.ringCount++,x,y,z,radius,radius*width,color,alpha,this.dummy.quaternion);
  }
  line(ax,ay,az,bx,by,bz,width,color,alpha=1){
    if(this.lineCount>=WEAPON_EFFECT_LIMITS.segments)return;
    this.direction.set(bx-ax,by-ay,bz-az);if(this.direction.lengthSq()<.000001)return;
    this.side.crossVectors(this.direction,this.cameraDirection);if(this.side.lengthSq()<.00001)this.side.crossVectors(this.direction,UP);this.side.normalize().multiplyScalar(width);
    const s=this.side,points=[[ax-s.x,ay-s.y,az-s.z],[ax+s.x,ay+s.y,az+s.z],[bx-s.x,by-s.y,bz-s.z],[bx+s.x,by+s.y,bz+s.z]],pos=this.lines.geometry.attributes.position,col=this.lines.geometry.attributes.color;this.color.set(color);
    let vertex=this.lineCount++*6;for(const p of [0,1,2,1,3,2]){pos.setXYZ(vertex,...points[p]);col.setXYZW(vertex++,this.color.r,this.color.g,this.color.b,alpha);}
  }
  event(e,remaining){
    const duration=(e.duration||500)/1000,life=Math.min(duration,remaining);if(life<=0)return;
    this.events.push({...e,age:duration-life,duration});if(this.events.length>WEAPON_EFFECT_LIMITS.events)this.events.shift();
    const y=(e.y??0)+.55,color=e.color||0xffaa55;
    if(e.kind==='explosion'){
      this.burst(e.x,y,e.z,0xffd478,36,15);
      for(let i=0;i<12;i++){const a=Math.random()*TAU,r=Math.random()*1.3;this.particle(e.x+Math.cos(a)*r,y+Math.random(),e.z+Math.sin(a)*r,i%2?0xff832a:0xffd777,.7+Math.random()*.7,.25+Math.random()*.28,Math.cos(a)*3,3+Math.random()*4,Math.sin(a)*3,false,2);this.particle(e.x,y,e.z,0x414450,.65+Math.random()*.6,.9+Math.random()*.5,Math.cos(a)*4,3+Math.random()*4,Math.sin(a)*4,true,2);}
    }else if(e.kind==='hit'||e.kind==='shield-hit'){this.burst(e.x,y,e.z,e.kind==='shield-hit'?0x77dfff:0xffd59a,14,e.kind==='shield-hit'?6:9);}
    else if(e.kind==='pulse'){for(let i=0;i<24;i++){const a=i/24*TAU;this.particle(e.x,y,e.z,color,.22,.4,Math.cos(a)*13,Math.random()*2,Math.sin(a)*13,false,.3);}}
    else if(e.kind==='shotgun'||e.kind==='rail'){
      this.particle(e.x,y,e.z,e.kind==='rail'?0xc8faff:0xffd390,e.kind==='rail'?1.5:.65,.12);this.burst(e.x,y,e.z,color,e.kind==='rail'?15:3,5);
      this.particle(e.x,y,e.z,0x8d8d84,.45,.6,0,1,0,true,.9);
    }
  }
  drawEvent(e,dt,camera,viewportHeight){
    e.age+=dt;const t=e.age/e.duration;if(t>=1)return false;const fade=(1-t)**2,color=e.color||0xffa550,y=(e.y??0)+.15;
    if(e.toX!==undefined){
      const toY=e.toY??e.y??.85,fromY=e.y??.85,dx=e.toX-e.x,dy=toY-fromY,dz=e.toZ-e.z,length=Math.hypot(dx,dy,dz)||1;
      if(e.kind==='rail'){
        this.line(e.x,fromY,e.z,e.toX,toY,e.toZ,.045+Math.max(0,.16-e.age)*.8,0xebffff,fade);
        this.line(e.x,fromY,e.z,e.toX,toY,e.toZ,.15+t*.24,color,fade*.35);
        // An expanding ion helix hangs in the air after the bright shot core.
        const segments=Math.min(160,Math.ceil(length/1.1)),nx=-dz/length,nz=dx/length,r=.16+t*.5;
        for(let i=0;i<segments;i++){const a=i/segments,b=(i+1)/segments,pa=a*length*1.7-e.age*3,pb=b*length*1.7-e.age*3;this.line(e.x+dx*a+nx*Math.cos(pa)*r,fromY+dy*a+Math.sin(pa)*r,e.z+dz*a+nz*Math.cos(pa)*r,e.x+dx*b+nx*Math.cos(pb)*r,fromY+dy*b+Math.sin(pb)*r,e.z+dz*b+nz*Math.cos(pb)*r,.028,color,fade*.6);}
      }else{
        const width=e.kind==='tracer'?tracerHalfWidth(camera,{x:e.x,y:fromY,z:e.z},viewportHeight):.045;
        this.line(e.x,fromY,e.z,e.toX,toY,e.toZ,width,color,fade);
        this.line(e.x,fromY,e.z,e.toX,toY,e.toZ,e.kind==='shotgun'?.13:.1,color,fade*.2);
      }
    }else if(e.kind==='pulse'){
      const r=.6+Math.sin(Math.min(1,t)*Math.PI/2)*(e.radius||10);this.ring(e.x,y,e.z,r,color,fade*.8);this.ring(e.x,y+.3,e.z,r*.82,color,fade*.3);
      for(let i=0;i<32;i++){const a=i/32*TAU,b=a+.13,h=Math.sin(t*Math.PI)*1.3;this.line(e.x+Math.cos(a)*r,y+h,e.z+Math.sin(a)*r,e.x+Math.cos(b)*r,y+h*.75,e.z+Math.sin(b)*r,.055,color,fade*.45);}
    }else if(e.kind==='explosion'){
      const r=.4+Math.sqrt(t)*7;this.ring(e.x,y,e.z,r,0xffb16a,fade*.6);this.ring(e.x,y+.05,e.z,r*.86,0xffe3a0,fade*.2);
    }else if(e.kind==='shield-hit'){this.ring(e.x,y+.5,e.z,2+t*2,0x88ebff,fade*.6);}
    return true;
  }
  update(state,cars,rockets,mines,chains,camera,dt,now,viewportHeight=900){
    const round=state?.phase==='racing'?`${state.code}:${state.round}:${state.trackId}`:null;
    if(round!==this.round){this.reset();this.round=round;}if(!round)return;
    dt=Math.min(.05,Math.max(0,dt));this.clock+=dt;this.emission+=dt;const emit=this.emission>=1/35;if(emit)this.emission%=1/35;
    camera.getWorldDirection(this.cameraDirection);this.lineCount=0;this.ringCount=0;
    for(const e of state.effects||[])if(!this.seen.has(e.id)){this.seen.add(e.id);this.event(e,Math.max(0,(e.until-(state.combatTime??state.time))/1000));}
    if(this.seen.size>WEAPON_EFFECT_LIMITS.seen)this.seen=new Set([...this.seen].slice(-WEAPON_EFFECT_LIMITS.seen/2));
    this.events=this.events.filter(e=>this.drawEvent(e,dt,camera,viewportHeight));
    const ids=new Set();
    for(const shot of state.projectiles||[]){
      const g=rockets.get(shot.id);if(!g)continue;ids.add(shot.id);const p=g.position,previous=this.projectiles.get(shot.id);
      const forward=new THREE.Vector3(1,0,0).applyQuaternion(g.quaternion),kind=shot.kind;
      if(!previous){const car=cars.get(shot.owner),muzzle=car?car.localToWorld(new THREE.Vector3(CAR_LENGTH/2,.9,0)):p;this.particle(muzzle.x,muzzle.y,muzzle.z,kind==='plasma'?0x7deaff:0xffe1a6,kind==='machinegun'?.62:1,.07);}
      if(kind==='rocket'){
        const tail=p.clone().addScaledVector(forward,-.9),tip=tail.clone().addScaledVector(forward,-1.7-Math.sin(now*.09)*.3);
        this.line(tail.x,tail.y,tail.z,tip.x,tip.y,tip.z,.18,0xff8430,.85);this.line(tail.x,tail.y,tail.z,tip.x,tip.y,tip.z,.06,0xffedb6,1);
        if(emit){this.particle(tail.x,tail.y,tail.z,0xffa44c,.35,.18,-forward.x*5,1-forward.y*5,-forward.z*5);this.particle(tail.x,tail.y,tail.z,0x8d8d89,.3,.7,-forward.x*3,1.7,-forward.z*3,true,.9);}
      }else if(kind==='plasma'){
        if(emit)this.particle(p.x,p.y,p.z,0x2a95ff,.6,.23,0,.3,0,false,.8);
        // Two rotating energy filaments describe the bolt volume and direction.
        for(let k=0;k<2;k++)for(let i=0;i<10;i++){const a=i/10*TAU+now*.012+k*Math.PI,b=a+.5,r=.72;this.a.set(-.6+k*.6,Math.cos(a)*r,Math.sin(a)*r).applyQuaternion(g.quaternion).add(p);this.b.set(-.6+k*.6,Math.cos(b)*r,Math.sin(b)*r).applyQuaternion(g.quaternion).add(p);this.line(this.a.x,this.a.y,this.a.z,this.b.x,this.b.y,this.b.z,.04,0xb6faff,.85);}
      }
      if(kind==='machinegun'){
        const width=tracerHalfWidth(camera,p,viewportHeight),owner=cars.get(shot.owner),start=previous||(owner?owner.localToWorld(new THREE.Vector3(CAR_LENGTH/2+.5,.9,0)):p.clone().addScaledVector(forward,-2.5));
        if(!previous||p.distanceTo(previous)<30)this.line(start.x,start.y,start.z,p.x,p.y,p.z,width,0xffefb8,.95);
        if(!previous)this.event({kind:'tracer',x:start.x,y:start.y,z:start.z,toX:p.x,toY:p.y,toZ:p.z,duration:70,color:'#fff1b8'},.07);
        const tail=p.clone().addScaledVector(forward,-Math.max(2.5,width*12));this.line(tail.x,tail.y,tail.z,p.x,p.y,p.z,width,0xfff8df,1);
      }
      if(previous&&p.distanceTo(previous)<30&&kind==='plasma')this.line(previous.x,previous.y,previous.z,p.x,p.y,p.z,.12,0x38c8ff,.6);
      this.projectiles.set(shot.id,p.clone());
    }
    for(const id of this.projectiles.keys())if(!ids.has(id))this.projectiles.delete(id);
    for(const mine of state.mines||[]){const g=mines.get(mine.id);if(!g)continue;const armed=(state.combatTime??state.time)>=mine.armAt;this.ring(g.position.x,g.position.y+.07,g.position.z,1.05+(Math.sin(now*.006)+1)*.08,armed?0xff5743:0xffca68,armed?.24:.12);if(emit&&Math.sin(now*.014)>.8)this.particle(g.position.x,g.position.y+.48,g.position.z,0xff5944,.4,.08);}
    for(const ball of state.chains||[]){const mesh=chains.get(ball.id)?.children[0];if(!mesh)continue;const p=mesh.position,speed=Math.hypot(ball.renderVx??ball.vx??0,ball.renderVz??ball.vz??0);if(emit&&speed>6){this.particle(p.x,p.y-.65,p.z,0xffcb80,.1,.25,-(ball.vx||0)*.12,1,-(ball.vz||0)*.12,false,0,12);this.particle(p.x,p.y-.8,p.z,0x9b9690,.24,.35,0,.2,0,true,.5);}}
    for(const player of state.players||[]){
      const g=cars.get(player.id);if(!g?.visible||player.eliminated)continue;
      const contact=player.contact;
      if(emit&&player.contactTime>0&&contact?.speed>2&&['wall','car'].includes(contact.kind)){
        const origin=g.localToWorld(new THREE.Vector3(contact.x,contact.y,contact.z)),count=Math.min(6,2+Math.floor(contact.speed/10));
        for(let i=0;i<count;i++){
          const spark=this.particle(origin.x,origin.y,origin.z,i%2?0xffa331:0xffecad,.18+Math.random()*.12,.3+Math.random()*.25,-(player.vx||0)*.2-contact.nx*(2+Math.random()*4)+(Math.random()-.5)*5,3+Math.random()*5,-(player.vz||0)*.2-contact.nz*(2+Math.random()*4)+(Math.random()-.5)*5,false,0,15);
          if(spark)spark.streak=true;
        }
      }
      if(player.shield>0&&g.userData.shield?.material.uniforms)g.userData.shield.material.uniforms.time.value=now/1000;
      if(player.firing==='flame'&&emit){
        const forward=new THREE.Vector3(1,0,0).applyQuaternion(g.quaternion);for(let i=0;i<4;i++){const point=g.localToWorld(new THREE.Vector3(CAR_LENGTH/2+Math.random()*.7,.72,(Math.random()-.5)*.3)),speed=15+Math.random()*5;this.particle(point.x,point.y,point.z,i===0?0xfff2ad:i===1?0xffad31:0xff4c13,.2+Math.random()*.13,Math.min(.58,(FLAME_RANGE-CAR_LENGTH/2)/speed),forward.x*speed,forward.y*speed+.3+Math.random(),forward.z*speed,false,1.7);}
        const nozzle=g.localToWorld(new THREE.Vector3(CAR_LENGTH/2+.15,.72,0));this.particle(nozzle.x,nozzle.y,nozzle.z,0x73aaff,.28,.065);
      }
      if(player.firing==='taser'){
        this.ring(g.position.x,(player.groundY??g.position.y)+.1,g.position.z,TASER_RADIUS,0x278fd9,.1+.04*Math.sin(now*.012));
        if(emit){const point=g.localToWorld(new THREE.Vector3(0,2.2,0));this.particle(point.x,point.y,point.z,0x8cceff,.45,.06);}
      }
    }
    for(const arc of state.arcs||[]){
      const a=cars.get(arc.owner),b=cars.get(arc.target);if(!a?.visible||!b?.visible)continue;
      const start=a.localToWorld(new THREE.Vector3(0,2.25,0)),end=b.localToWorld(new THREE.Vector3(0,.9,0)),delta=end.clone().sub(start),length=delta.length(),segments=14,beat=Math.floor(now/40),nx=-delta.z/(length||1),nz=delta.x/(length||1);let last=start;
      for(let i=1;i<=segments;i++){const t=i/segments,envelope=Math.sin(t*Math.PI),jitter=Math.sin(i*74.1+beat*12.7)*.6*envelope,p=new THREE.Vector3(start.x+delta.x*t+nx*jitter,start.y+delta.y*t+Math.cos(i*13+beat)*.5*envelope,start.z+delta.z*t+nz*jitter);this.line(last.x,last.y,last.z,p.x,p.y,p.z,.035,0xc5f1ff,.95);this.line(last.x,last.y,last.z,p.x,p.y,p.z,.15,0x247cff,.3);if(i%3===0)this.line(p.x,p.y,p.z,p.x+nx*.7,p.y+.4,p.z+nz*.7,.025,0x8ebfff,.5);last=p;}
      if(emit)this.burst(end.x,end.y,end.z,0x99d9ff,2,3);
    }
    let glowCount=0,smokeCount=0;this.particles=this.particles.filter(p=>{
      p.life-=dt;if(p.life<=0)return false;const old={x:p.x,y:p.y,z:p.z};p.vy-=p.gravity*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
      const age=p.max-p.life,fade=Math.min(1,p.life/.16),size=p.size+age*p.growth;
      this.stamp(p.smoke?this.smoke:this.glow,p.smoke?smokeCount++:glowCount++,p.x,p.y,p.z,size,size,p.color,fade*(p.smoke?.48:.85),camera.quaternion);
      if(p.gravity)this.line(p.streak?p.x-p.vx*.055:old.x,p.streak?p.y-p.vy*.055:old.y,p.streak?p.z-p.vz*.055:old.z,p.x,p.y,p.z,p.streak?.055:.024,p.color,fade*.8);return true;
    });
    this.glow.count=glowCount;this.smoke.count=smokeCount;this.rings.count=this.ringCount;
    for(const mesh of [this.glow,this.smoke,this.rings]){mesh.instanceMatrix.needsUpdate=true;mesh.geometry.attributes.tint.needsUpdate=true;}
    this.lines.geometry.setDrawRange(0,this.lineCount*6);this.lines.geometry.attributes.position.needsUpdate=true;this.lines.geometry.attributes.color.needsUpdate=true;
  }
}
