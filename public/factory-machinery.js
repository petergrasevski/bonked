import * as THREE from 'three';
import {trackAt,TRACK_LENGTH,SEGMENTS} from '../shared/game.js';
import {FACTORY_PRESSES,FACTORY_TIPS,pressState,factoryTipAngle,circuitDistance} from '../shared/extra-circuits.js';
import {mergeMovingGroup} from './factory-interior.js';
import {factoryFinish} from './factory-dressing.js';
export function buildFactoryMachinery(w){
  const presses=[],steel=factoryFinish(w,0x334a59),chrome=factoryFinish(w,0xc4d1d2,{roughness:.31,metalness:.8}),amber=factoryFinish(w,0xe2a837);
  FACTORY_PRESSES.forEach((f,index)=>{
    const p=trackAt(f),z=p.insideSide*p.halfWidth*.335,g=new THREE.Group();g.position.set(p.x,p.y,p.z);g.rotation.y=-p.angle;w.static.add(g);
    for(const side of [-1,1]){
      const edge=side*(p.halfWidth+1.5);
      w.box(0,.25,edge,5,.5,2.5,steel,g);w.box(0,5,edge,1.5,10,1.5,steel,g);
      for(let y=1;y<10;y+=2){w.box(-.8,y,edge,.2,.6,1.7,amber,g);for(const x of [-.6,.6])w.cylinder(x,y,edge,.13,.13,.2,chrome,8,g);}
    }
    w.box(0,10,0,5,1.7,p.halfWidth*2+5,steel,g);
    w.box(0,9.9,z,4.6,1.9,p.halfWidth*.62,amber,g);
    for(const x of [-2.3,2.3])w.box(x,10.3,0,.18,1.5,p.halfWidth*2+5,chrome,g);
    const carriage=new THREE.Group();carriage.position.copy(g.position);carriage.rotation.copy(g.rotation);w.scene.add(carriage);
    for(const x of [-2.3,2.3])for(const dz of [-1,1])w.cylinder(x,5,dz*p.halfWidth*.38,.13,.13,9,chrome,10,carriage);
    for(const x of [-1.2,1.2])w.cylinder(x,10.9,0,.65,.65,2.3,steel,12,carriage);
    w.box(0,10,0,4.5,.6,p.halfWidth*.95,amber,carriage);
    // Pressure tank, motor, braided hoses and service cabinet.
    w.box(2,1.6,p.halfWidth+2.7,2,3.2,1.5,steel,g);w.cylinder(-2,2,p.halfWidth+2.7,.8,.8,3.5,amber,12,g);
    for(let k=0;k<5;k++)w.box(3.03,.8+k*.4,p.halfWidth+2.7,.04,.1,1,chrome,g);
    for(const x of [-1.2,1.2]){w.cylinder(x,8.6,z,.17,.17,2.4,0x172830,8,g);w.box(x,9.4,(z+p.halfWidth+2.7)/2,.2,.2,Math.abs(z-p.halfWidth-2.7),0x172830,g);}
    const moving=new THREE.Group();w.scene.add(moving);moving.position.copy(g.position);moving.rotation.copy(g.rotation);
    const plate=new THREE.Group();carriage.add(plate);
    w.box(0,0,0,7,1,p.halfWidth*.85,amber,plate);w.box(0,-.55,0,6.7,.16,p.halfWidth*.82,chrome,plate);
    for(let x=-3;x<=3;x+=1)for(const side of [-1,1]){w.box(x,.53,side*p.halfWidth*.4,.12,.09,.12,chrome,plate);const stripe=w.box(x,.05,side*(p.halfWidth*.425+.01),.45,.75,.025,0x182c36,plate);stripe.rotation.z=.45;}
    mergeMovingGroup(plate);
    const pistons=[-1.2,1.2].map(x=>w.cylinder(x,8,0,.24,.24,1,chrome,12,carriage));
    const lamp=w.box(-4,.12,z,.8,.08,p.halfWidth*.5,amber,moving);lamp.material=lamp.material.clone();lamp.material.emissive=new THREE.Color(0xff942b);
    presses.push({plate,pistons,lamp,carriage,index,p});
  });
  // Fixed-lifetime particles are emitted on each downward stroke, not scaled as a whole plume.
  const origins=[],seeds=[],steamBirths=[];
  FACTORY_PRESSES.forEach((f,i)=>{const p=trackAt(f);for(let j=0;j<48;j++){const side=j%2?1:-1;origins.push(p.x+Math.cos(p.angle)*side*3.4+p.nx*p.insideSide*p.halfWidth*.56,p.y+1.1,p.z+Math.sin(p.angle)*side*3.4+p.nz*p.insideSide*p.halfWidth*.56);seeds.push(i,j/48,side);steamBirths.push({p,i,j,side});}});
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(origins,3));geo.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,3));
  const smoke=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0}},vertexShader:`uniform float time;attribute vec3 seed;varying float alpha;void main(){float age=mod(time+seed.x*.73-2.-seed.y*.22+3.,3.);float alive=1.-step(.75,age);vec3 p=position;p.x+=sin(seed.y*93.)*age*5.;p.z+=cos(seed.y*63.)*age*5.;p.y+=age*3.;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((.7+age*2.)*500./-mv.z,1.,100.);alpha=alive*.4*(1.-age/.75);}`,fragmentShader:`varying float alpha;void main(){float a=(1.-smoothstep(.1,.5,length(gl_PointCoord-.5)))*alpha;gl_FragColor=vec4(.85,.9,.9,a);}`});
  const particles=new THREE.Points(geo,smoke);particles.frustumCulled=false;w.scene.add(particles);
  const tips=FACTORY_TIPS.map(tip=>{
    const p=trackAt(tip.fraction),buttonP=trackAt(tip.fraction+tip.buttonOffset/TRACK_LENGTH);
    const button=new THREE.Group();button.position.set(buttonP.x+buttonP.nx*buttonP.halfWidth*.6,buttonP.y+.15,buttonP.z+buttonP.nz*buttonP.halfWidth*.6);w.scene.add(button);
    w.cylinder(0,0,0,2.6,2.6,.25,0xe0ac31,32,button);w.cylinder(0,.15,0,2.2,2.2,.2,0x202f38,32,button);
    const cap=w.cylinder(0,.4,0,1.9,2.1,.55,0xed2927,32,button);cap.material=cap.material.clone();cap.material.emissive=new THREE.Color(0xd51a13);cap.material.emissiveIntensity=.4;
    // A ribbon follows the actual curved deck; each cross-section hinges along its left edge.
    const records=[],vertices=[];for(const a of SEGMENTS){if(circuitDistance((a.start+a.len*.5)/TRACK_LENGTH,tip.fraction,TRACK_LENGTH)>=tip.length/2)continue;const b=trackAt((a.start+a.len)/TRACK_LENGTH);for(const [q,side]of [[a,0],[a,1],[b,0],[a,1],[b,1],[b,0]]){records.push({x:q.x,y:q.y,nx:q.nx,z:q.z,nz:q.nz,width:q.halfWidth+.6,side});vertices.push(0,0,0);}}
    const deckGeo=new THREE.BufferGeometry();deckGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));deckGeo.setAttribute('uv',new THREE.Float32BufferAttribute(records.flatMap(q=>[(q.x-q.nx*q.width*q.side)/10,(q.z-q.nz*q.width*q.side)/10]),2));
    const deck=w.mesh(deckGeo,w.roadMaterial('asphalt'),0,0,0,w.scene);
    const outlineRecords=[],outlineVertices=[];
    const addDash=(fraction,across,along=0)=>{const q=trackAt(fraction),lateral=-q.halfWidth*across;
      for(const [dx,dz]of [[-.45,-.1],[.45,-.1],[-.45,.1],[.45,-.1],[.45,.1],[-.45,.1]]){outlineRecords.push({q,along:along+dx,lateral:lateral+dz});outlineVertices.push(0,0,0);}};
    for(let d=-tip.length/2;d<=tip.length/2;d+=1.8){const f=tip.fraction+d/TRACK_LENGTH;for(const across of [.03,.97])addDash(f,across);}
    for(const end of [-1,1])for(let lane=.12;lane<.95;lane+=.17)addDash(tip.fraction+end*tip.length/2/TRACK_LENGTH,lane);
    const outlineGeo=new THREE.BufferGeometry();outlineGeo.setAttribute('position',new THREE.Float32BufferAttribute(outlineVertices,3));w.mesh(outlineGeo,new THREE.MeshBasicMaterial({color:0xe3d6a8,side:THREE.DoubleSide}),0,0,0,w.scene);
    const line=new THREE.Group();line.position.set(p.x-p.nx*(p.halfWidth+5),-6.5,p.z-p.nz*(p.halfWidth+5));line.rotation.y=-p.angle;w.static.add(line);
    w.box(0,-.4,0,46,.8,9,steel,line);for(let x=-22;x<=22;x+=1.3){const roller=w.cylinder(x,.1,0,.28,.28,8,chrome,10,line);roller.rotation.x=Math.PI/2;}
    for(const x of [-15,0,15]){w.box(x,1.1,0,5,1.2,2.1,0x677983,line);w.box(x+.3,2,0,2.2,.8,1.9,0xacc1c4,line);for(const side of [-1,1])for(const dx of [-1.6,1.6]){const tire=w.cylinder(x+dx,.7,side*1.15,.5,.5,.35,0x17242b,12,line);tire.rotation.x=Math.PI/2;}}
    return {tip,cap,deckGeo,records,outlineGeo,outlineRecords};
  });
  return {update(seconds,cars){
    smoke.uniforms.time.value=seconds;
    const steamPos=geo.attributes.position;steamBirths.forEach(({p,i,j,side},k)=>{const phase=((seconds+i*.73-2-j/48*.22)%3+3)%3,born=seconds-phase,state=pressState(born,i),lateral=state.lane*p.insideSide*p.halfWidth;steamPos.setXYZ(k,p.x+Math.cos(p.angle)*side*3.4+p.nx*lateral,p.y+1.1,p.z+Math.sin(p.angle)*side*3.4+p.nz*lateral);});steamPos.needsUpdate=true;
    for(const {plate,pistons,lamp,carriage,index,p}of presses){const state=pressState(seconds,index);const lateral=state.lane*p.insideSide*p.halfWidth;carriage.position.set(p.x+p.nx*lateral,p.y,p.z+p.nz*lateral);lamp.position.z=lateral;plate.position.y=7-state.stroke*5.6;for(const piston of pistons){piston.position.y=(9.7+plate.position.y)/2;piston.scale.y=9.7-plate.position.y;}lamp.material.emissiveIntensity=state.warning?2+Math.sin(seconds*16):state.active?3:.15;}
    for(const {tip,cap,deckGeo,records,outlineGeo,outlineRecords}of tips){
      const at=Math.max(-Infinity,...cars.map(c=>Number.isFinite(c[tip.stateKey])?c[tip.stateKey]:-Infinity)),angle=factoryTipAngle(seconds,at);cap.position.y=angle>0?.2:.4;
      const pos=deckGeo.attributes.position;records.forEach((q,i)=>{const lateral=-q.width*q.side;pos.setXYZ(i,q.x+q.nx*lateral*Math.cos(angle),q.y+.02+lateral*Math.sin(angle),q.z+q.nz*lateral*Math.cos(angle));});pos.needsUpdate=true;deckGeo.computeVertexNormals();deckGeo.computeBoundingSphere();
      const edge=outlineGeo.attributes.position;outlineRecords.forEach(({q,along,lateral},i)=>edge.setXYZ(i,q.x+Math.cos(q.angle)*along+q.nx*lateral*Math.cos(angle),q.y+.055+lateral*Math.sin(angle),q.z+Math.sin(q.angle)*along+q.nz*lateral*Math.cos(angle)));edge.needsUpdate=true;outlineGeo.computeBoundingSphere();
    }
  }};
}
