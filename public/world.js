import {buildCoastalCrabs,updateCoastalCrabs} from './coastal-crabs.js';
import {boostExhaustStrength} from '/shared/boost-pads.js';
import {buildBoostPads} from './boost-pads.js';
import {createPickupGround} from './pickup-ground.js';
import {buildDetailedScenery,buildDetailedBiome,detailedPalm,detailedRock} from './scenery.js';
import {createSnowMaterial} from './snow-surface.js';
import {buildIceShelf} from './ice-shelf.js';
import {createIceMaterial} from './ice-surface.js';
import {buildGlacierValley,updateGlacierValley} from './glacier-valley.js';
import {buildTrackBarrier} from './track-barriers.js';
import {buildDesertScenery} from './desert-scenery.js';
import {buildDesertMoles,updateDesertMoles} from './desert-moles.js';
import {createDesertMaterial} from './desert-surface.js';
import {createAtmosphere} from './atmosphere.js';
import {createGustTrails} from './desert-storm.js';
import {createCoastalWater} from './water.js';
import {projectilePose} from './projectile-motion.js';
import * as THREE from 'three';
import {syncCarWeapon} from './car-weapons.js';
import {buildLandmarks,animateLandmarks,LANDMARKS} from './landmarks.js';
import { createPickupModel, PICKUP_COLORS } from './pickups.js';
import { FLAME_RANGE,TASER_RADIUS,WEAPON_IDS } from '/shared/combat.js';
import {createSportsCar,disposeCarInstance} from './car-model.js';
import { mergeGeometries } from '/vendor/BufferGeometryUtils.js';
import { iceSplit,activeTrack, TRACK, SEGMENTS, ROAD_WIDTH, trackAt, angleDelta, COLORS, TRACK_LENGTH, START_FRACTION, PICKUP_LOCATIONS, spawnCar, MAX_PLAYERS, hasBarrier, damageLevel, damageSeverity, CAR_LENGTH, CAR_WIDTH, SURFACE_HALF_WIDTH, nearestTrack, collideCars, OBSTACLES } from '/shared/game.js';
import { cameraFrame, createChase } from '/shared/chase.js';
import { CAMERA_FOV, stepCamera, cameraPose } from '/shared/camera.js';
const C={asphalt:0x394951,sand:0x938d7c,cliff:0x777568,cream:0xc8c6b7,coral:0xae6654,navy:0x263941,teal:0x497475,lime:0xcbd3db};
export class World{
  constructor(container,{preview=false}={}){
    this.trackId=activeTrack.id;this.previewOnly=preview;
    this.container=container;this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x8094a3);
    this.scene.fog=new THREE.FogExp2(0x8094a3,.0045);
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});
    this.renderer.setPixelRatio(preview?1:Math.min(devicePixelRatio,1.7));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.02;this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.camera=new THREE.PerspectiveCamera(CAMERA_FOV,1,.2,600);this.camera.position.set(0,90,64);this.camera.lookAt(0,0,0);
    this.atmosphere=createAtmosphere(this.renderer,this.scene,activeTrack.id,{mobile:matchMedia('(pointer: coarse)').matches});this.sun=this.atmosphere.sun;this.environment=this.atmosphere.environment;
    this.gustTrails=activeTrack.id==='desert'?createGustTrails(MAX_PLAYERS):null;if(this.gustTrails)this.scene.add(this.gustTrails.mesh);
    this.materials=new Map();this.textures=new Map();this.static=new THREE.Group();this.scene.add(this.static);this.cars=new Map();this.boxes=[];this.rockets=new Map();this.lightning=new Map();this.dangerRings=new Map();this.effects=new Map();this.trails=[];this.frame=0;this.mines=new Map();this.chains=new Map();this.seenEffects=new Set();this.particles=[];this.particleClock=0;
    this.buildTrack();if(activeTrack.id==='coast'){this.buildScenery();this.landmarks=buildLandmarks(this);this.coastalCrabs=buildCoastalCrabs(this.scene);}else{this.landmarks=[];this.buildBiome();}if(activeTrack.id==='ice')this.valley=buildGlacierValley(this);if(activeTrack.id==='desert'){buildDesertScenery(this);this.desertMoles=buildDesertMoles(this);}this.mergeStatic();this.buildWater();this.buildPickups();this.buildEliminationLine();this.buildParticles();this.boostPads=buildBoostPads(this.scene);
    this.previewCars=COLORS.slice(0,2).map((color,i)=>{const mesh=this.createCar(color);this.scene.add(mesh);return mesh;});
    if(preview)this.renderer.setSize(320,320);else{this.resize();this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.renderer.compile(this.scene,this.camera);}
  }
  roadMaterial(kind){
    if(kind==='ice')return this.iceRoadMaterial??=createIceMaterial();
    if(kind==='sand'&&activeTrack.id==='desert')return this.desertRoadMaterial??=createDesertMaterial(false);
    const ice=kind==='ice';return new THREE.MeshPhysicalMaterial({map:this.texture(kind),color:ice?0xb5e9f7:kind==='sand'?0xe4bd88:0xaab7c4,
      bumpMap:this.texture('micro'),bumpScale:ice?.025:kind==='sand'?.12:.07,roughnessMap:this.texture('roughness'),roughness:ice?.28:kind==='sand'?.95:.72,
      metalness:ice?.08:.02,clearcoat:ice?.85:.12,clearcoatRoughness:ice?.14:.4,envMapIntensity:ice?1.4:.65,side:THREE.DoubleSide});
  }
  texture(kind){
    if(this.textures.has(kind))return this.textures.get(kind);
    const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');let seed=731;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    if(kind==='micro'||kind==='roughness'){
      const data=ctx.createImageData(512,512);for(let i=0;i<data.data.length;i+=4){const v=kind==='micro'?100+Math.floor(random()*55):145+Math.floor(random()*100);data.data[i]=data.data[i+1]=data.data[i+2]=v;data.data[i+3]=255;}ctx.putImageData(data,0,0);
    }else if(kind==='glow'){
      const grad=ctx.createRadialGradient(256,256,0,256,256,256);grad.addColorStop(0,'#ffffff');grad.addColorStop(.25,'#ffffffaa');grad.addColorStop(.6,'#ffffff35');grad.addColorStop(1,'#ffffff00');ctx.fillStyle=grad;ctx.fillRect(0,0,512,512);
    }else{
      ctx.fillStyle=kind==='ice'?'#d5eff5':kind==='sand'?'#c6a66f':kind==='asphalt'?'#737a7f':'#c5c2b8';ctx.fillRect(0,0,512,512);
      for(let i=0;i<50;i++){const x=random()*512,y=random()*512,r=15+random()*110,grad=ctx.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,i%2?'#10191d0d':'#eff5f00a');grad.addColorStop(1,'#00000000');ctx.fillStyle=grad;ctx.fillRect(x-r,y-r,r*2,r*2);}
      for(let i=0;i<26000;i++){ctx.fillStyle=i%2?'#eef0e51a':'#10192329';const size=1+random()*2;ctx.fillRect(random()*512,random()*512,size,size);}
      for(let i=0;i<(kind==='sand'?0:kind==='asphalt'?10:24);i++){let x=random()*512,y=random()*512;ctx.beginPath();ctx.moveTo(x,y);for(let j=0;j<5;j++){x+=(random()-.4)*15;y+=random()*18;ctx.lineTo(x,y);}ctx.lineWidth=kind==='asphalt'?.8:1.2;ctx.strokeStyle='#18212430';ctx.stroke();}
      if(kind==='ice'){
        for(let i=0;i<12;i++){let x=random()*512,y=random()*512;ctx.beginPath();ctx.moveTo(x,y);for(let j=0;j<8;j++){x+=(random()-.35)*40;y+=(random()-.2)*35;ctx.lineTo(x,y);}ctx.strokeStyle='#24698545';ctx.lineWidth=2.5;ctx.stroke();ctx.strokeStyle='#eeffffb0';ctx.lineWidth=.7;ctx.stroke();}
        for(let i=0;i<120;i++){ctx.fillStyle='#f2ffff44';ctx.beginPath();ctx.ellipse(random()*512,random()*512,2+random()*7,1+random()*2,random()*6,0,Math.PI*2);ctx.fill();}
      }
      if(kind==='sand'){for(let i=0;i<1800;i++){const x=random()*512,y=random()*512;ctx.fillStyle=i%2?'#6f543a55':'#ffe2a666';ctx.beginPath();ctx.ellipse(x,y,1+random()*2,.5+random(),random()*Math.PI,0,Math.PI*2);ctx.fill();}}
      if(kind==='asphalt'){ctx.strokeStyle='#10191d10';ctx.lineWidth=5;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(random()*512,0);ctx.bezierCurveTo(random()*512,150,random()*512,350,random()*512,512);ctx.stroke();}}
    }
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=['micro','roughness'].includes(kind)?THREE.NoColorSpace:THREE.SRGBColorSpace;if(kind!=='glow')texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;this.textures.set(kind,texture);return texture;
  }
  mat(color,roughness=.8,metalness=0){const key=`${color}-${roughness}-${metalness}`;if(!this.materials.has(key)){const weathered=[C.cliff,C.sand,C.cream,C.coral,C.teal,0xa66542,0xe6b478,0xb97c51,0xd79760,0xaa7752].includes(color);this.materials.set(key,activeTrack.id==='ice'&&[0xe0eff2,0xe1f4fa,0xd3e5ed,0xe8f5fa].includes(color)?createSnowMaterial(color):new THREE.MeshStandardMaterial({color,roughness,metalness,map:weathered?this.texture('concrete'):null,bumpMap:weathered?this.texture('micro'):null,bumpScale:weathered?.1:0,envMapIntensity:.75}));}return this.materials.get(key);}
  mesh(geometry,color,x=0,y=0,z=0,parent=this.static){if(!geometry.attributes.uv){const p=geometry.attributes.position,uv=[];for(let i=0;i<p.count;i++)uv.push((p.getX(i)+p.getZ(i))/5,p.getY(i)/3);geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));}const mesh=new THREE.Mesh(geometry,typeof color==='object'?color:this.mat(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  box(x,y,z,w,h,d,color,parent=this.static){return this.mesh(new THREE.BoxGeometry(w,h,d),color,x,y,z,parent);}
  cylinder(x,y,z,r1,r2,h,color,n=8,parent=this.static){return this.mesh(new THREE.CylinderGeometry(r1,r2,h,n),color,x,y,z,parent);}
  ribbon(offset,width,y,color,skip=0,protectedOnly=false){
    const vertices=[],uv=[];
    for(let i=0;i<TRACK.length;i++){
      if(skip&&Math.floor(i/skip)%2)continue;
      if(protectedOnly===true&&!hasBarrier(SEGMENTS[i].start/TRACK_LENGTH))continue;
      if(protectedOnly==='exposed'&&hasBarrier(SEGMENTS[i].start/TRACK_LENGTH))continue;
      const a=SEGMENTS[i],b=SEGMENTS[(i+1)%TRACK.length];
      const ao=typeof offset==='function'?offset(a):offset,bo=typeof offset==='function'?offset(b):offset,aw=typeof width==='function'?width(a):width,bw=typeof width==='function'?width(b):width;
      const ag=iceSplit(a.x),bg=iceSplit(b.x),ranges=ag||bg?[-1,1]:[0];
      for(const side of ranges){
        const al=side===1?Math.max(ao-aw/2,ag):ao-aw/2,ar=side===-1?Math.min(ao+aw/2,-ag):ao+aw/2;
        const bl=side===1?Math.max(bo-bw/2,bg):bo-bw/2,br=side===-1?Math.min(bo+bw/2,-bg):bo+bw/2;
        if(ar<=al&&br<=bl)continue;
        const l0=al,r0=Math.max(al,ar),l1=bl,r1=Math.max(bl,br);
        const p=[[a.x+a.nx*l0,y+a.y,a.z+a.nz*l0],[a.x+a.nx*r0,y+a.y,a.z+a.nz*r0],[b.x+b.nx*l1,y+b.y,b.z+b.nz*l1],[b.x+b.nx*r1,y+b.y,b.z+b.nz*r1]];
        for(const j of [0,1,2,1,3,2]){vertices.push(...p[j]);uv.push(p[j][0]/10,p[j][2]/10);}
      }
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();return this.mesh(geo,color);
  }
  buildTrack(){
    // A narrow raised causeway, with water on both sides. No invisible grass
    // runoff: the top surface ends at the same edge used by the simulation.
    this.ribbon(0,p=>(p.halfWidth+.6)*2,-.18,activeTrack.id==='ice'?0x91c5d8:C.sand);
    if(activeTrack.id==='ice')buildIceShelf(this);
    else for(const side of [-1,1]){
      const vertices=[];for(let i=0;i<SEGMENTS.length;i++){const p=SEGMENTS[i],q=SEGMENTS[(i+1)%SEGMENTS.length],off=side*(p.halfWidth+.6),offQ=side*(q.halfWidth+.6);
        const points=[[p.x+p.nx*off,p.y-.18,p.z+p.nz*off],[q.x+q.nx*offQ,q.y-.18,q.z+q.nz*offQ],[p.x+p.nx*off,p.y-2,p.z+p.nz*off],[q.x+q.nx*offQ,q.y-2,q.z+q.nz*offQ]];for(const j of [0,1,2,1,3,2])vertices.push(...points[j]);}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();const mat=this.mat(C.cliff);mat.side=THREE.DoubleSide;this.mesh(geo,mat);
    }
    this.ribbon(0,p=>p.halfWidth*2+.8,-.05,activeTrack.id==='ice'?0xb8e2ec:0x797d6c);
    this.ribbon(0,p=>p.halfWidth*2,.01,this.roadMaterial(activeTrack.id==='ice'?'ice':activeTrack.id==='desert'?'sand':'asphalt'),0,true);
    this.ribbon(0,p=>(p.halfWidth+.6)*2,.01,this.roadMaterial(activeTrack.id==='ice'?'ice':'sand'),0,'exposed');
    if(activeTrack.id==='ice')this.buildSplitEdges();
    for(const side of [-1,1]){
      // Unprotected sections are bare sand; paint and curbs belong to guarded asphalt.
      if(activeTrack.id==='coast'){this.ribbon(p=>side*(p.halfWidth-.18),.28,.045,0xffce32,0,true);
      this.ribbon(p=>side*(p.halfWidth+.16),.55,.06,C.cream,0,true);
      this.ribbon(p=>side*(p.halfWidth+.16),.55,.065,C.coral,3,true);}
      if(activeTrack.id==='desert')this.ribbon(p=>side*(p.halfWidth-.25),.18,.065,0xf0d6a8,0,'exposed');
      for(let i=0;i<TRACK.length;i+=2){
        const p=SEGMENTS[i],q=SEGMENTS[(i+2)%TRACK.length];if(!hasBarrier(p.start/TRACK_LENGTH,side))continue;
        const x=p.x+p.nx*(p.halfWidth+.28)*side,z=p.z+p.nz*(p.halfWidth+.28)*side,ex=q.x+q.nx*(q.halfWidth+.28)*side,ez=q.z+q.nz*(q.halfWidth+.28)*side;
        const length=Math.hypot(ex-x,ez-z),angle=-Math.atan2(ez-z,ex-x);
        if(activeTrack.id!=='coast'){buildTrackBarrier(this,activeTrack.id,{x,y:p.y,z},{x:ex,y:q.y,z:ez},i);continue;}
        const wall=this.box((x+ex)/2,(p.y+q.y)/2+.64,(z+ez)/2,length+ .04,1.25,.56,Math.floor(i/8)%2?0xc9c9bb:0xb7382b);wall.rotation.y=angle;
        const cap=this.box((x+ex)/2,(p.y+q.y)/2+1.34,(z+ez)/2,length+.04,.16,.68,0x27343d);cap.rotation.y=angle;
        if(!hasBarrier(SEGMENTS[(i+TRACK.length-2)%TRACK.length].start/TRACK_LENGTH,side)||!hasBarrier(q.start/TRACK_LENGTH,side)){
          const post=this.box(x,p.y+1.1,z,.75,2.2,.75,0xffce32);post.rotation.y=angle;
          for(const y of [.4,1,1.6]){const stripe=this.box(x,p.y+y,z,.79,.23,.79,0x151e25);stripe.rotation.y=angle;}
        }
      }
    }
    for(const o of OBSTACLES){
      if(o.kind==='cactus')continue;
      this.cylinder(o.x,.18,o.z,o.radius,o.radius,.36,0x202b32,20);
      this.cylinder(o.x,.72,o.z,o.radius*.93,o.radius*.98,1.08,0xeabf32,20);
      this.cylinder(o.x,.87,o.z,o.radius*.95,o.radius*.95,.32,0x1d2930,20);
      this.cylinder(o.x,1.4,o.z,o.radius*.85,o.radius*.93,.2,0xeabf32,20);
      for(const offset of [-.6,.6]){const stripe=this.box(o.x+Math.cos(trackAt(o.fraction).angle)*offset,1.51,o.z+Math.sin(trackAt(o.fraction).angle)*offset,.35,.025,2.25,0x18252d);stripe.rotation.y=-trackAt(o.fraction).angle;}
      this.cylinder(o.x,1.68,o.z,.13,.13,.48,0xf18e23,8);
    }
    this.ribbon(0,.12,.06,0xb6b89d,5,true);
    const start=trackAt(START_FRACTION);
    const line=new THREE.Group();line.position.set(start.x,start.y+.075,start.z);line.rotation.y=-start.angle;this.static.add(line);
    for(let r=0;r<2;r++)for(let c=0;c<12;c++)this.box((r-.5)*.7,0,(c-5.5)*.9,.7,.02,.9,(r+c)%2?0xf4efd4:0x1c2d34,line);
    for(let i=0;i<MAX_PLAYERS;i++){const p=trackAt(START_FRACTION-(6+Math.floor(i/2)*5.5)/TRACK_LENGTH),g=new THREE.Group();g.position.set(p.x+p.nx*(i%2?-2.3:2.3),p.y+.06,p.z+p.nz*(i%2?-2.3:2.3));g.rotation.y=-p.angle;this.static.add(g);this.box(-1.6,0,0,.12,.02,2.4,0xe2d9bc,g);this.box(0,0,-1.2,3.2,.02,.1,0xe2d9bc,g);this.box(0,0,1.2,3.2,.02,.1,0xe2d9bc,g);}
    // Start-line gantry and its illuminated timing panel.
    const gantry=new THREE.Group();gantry.position.set(start.x,start.y,start.z);gantry.rotation.y=-start.angle;this.static.add(gantry);
    this.box(0,3.2,-(start.halfWidth+1.7),.6,6.4,.6,C.navy,gantry);this.box(0,3.2,start.halfWidth+1.7,.6,6.4,.6,C.navy,gantry);this.box(0,6.3,0,.65,.65,(start.halfWidth+2)*2,C.navy,gantry);
    this.box(0,6.5,0,.8,1.2,8,C.lime,gantry);
    for(let i=0;i<5;i++)this.box(.46,6.55,(i-2)*1.1,.05,.55,.55,0x173b38,gantry);
    const banner=this.makeText('START',512,80,'#d4dce3','#17313c',52);const sign=new THREE.Mesh(new THREE.PlaneGeometry(9,1.5),new THREE.MeshBasicMaterial({map:banner,side:THREE.DoubleSide}));sign.position.set(-.48,6.5,0);sign.rotation.y=-Math.PI/2;gantry.add(sign);sign.userData.sceneryKind='start-sign';
  }
  buildSplitEdges(){
    for(let i=0;i<SEGMENTS.length-1;i++){const a=SEGMENTS[i],b=SEGMENTS[i+1],gap=iceSplit((a.x+b.x)/2);if(gap<=0)continue;const floor=this.box((a.x+b.x)/2,-3.7,(a.z+b.z)/2,Math.hypot(b.x-a.x,b.z-a.z)+.04,.05,gap*2,0x123244);floor.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);}
    for(const side of [-1,1])for(let i=0;i<SEGMENTS.length-1;i+=2){
      const a=SEGMENTS[i],b=SEGMENTS[(i+2)%SEGMENTS.length],gap=iceSplit(a.x),next=iceSplit(b.x);if(gap<.02||next<.02)continue;
      const x=a.x+a.nx*gap*side,z=a.z+a.nz*gap*side,ex=b.x+b.nx*next*side,ez=b.z+b.nz*next*side,length=Math.hypot(ex-x,ez-z),angle=-Math.atan2(ez-z,ex-x);
      const cliff=this.box((x+ex)/2,(a.y+b.y)/2-2.3,(z+ez)/2,length+.03,4.5,.15,0x538d9f);cliff.rotation.y=angle;
      const protectedEdge=hasBarrier(a.start/TRACK_LENGTH,side,true);
      const paint=this.box((x+ex)/2,(a.y+b.y)/2+.05,(z+ez)/2,length+.03,.035,.2,protectedEdge?0xd8f4f8:0xf8cb59);paint.rotation.y=angle;
      if(protectedEdge)buildTrackBarrier(this,'ice',{x,y:a.y,z},{x:ex,y:b.y,z:ez},i);
    }
  }
  makeText(text,w,h,bg,fg,size){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,w,h);x.fillStyle=fg;x.font=`italic 900 ${size}px sans-serif`;x.textAlign='center';x.textBaseline='middle';x.fillText(text,w/2,h/2+3);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
  palm(x,z,scale=1,angle=0){return detailedPalm(this,x,z,scale,angle);}
  rock(x,z,size,color=C.cliff){return detailedRock(this,x,z,size,color);}
  buildScenery(){buildDetailedScenery(this,LANDMARKS);}
  mergeStatic(){
    this.static.updateMatrixWorld(true);const groups=new Map();
    this.static.traverse(obj=>{if(!obj.isMesh)return;let geo=obj.geometry.clone().applyMatrix4(obj.matrixWorld);if(geo.index)geo=geo.toNonIndexed();if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));for(const key of Object.keys(geo.attributes))if(!['position','normal','uv'].includes(key))geo.deleteAttribute(key);
      geo.computeBoundingBox();const center=geo.boundingBox.getCenter(new THREE.Vector3());const key=`${obj.material.uuid}:${Math.floor(center.x/70)}:${Math.floor(center.z/70)}`;
      if(!groups.has(key))groups.set(key,{material:obj.material,geos:[]});groups.get(key).geos.push(geo);
    });
    this.scene.remove(this.static);this.static.traverse(o=>{if(o.isMesh)o.geometry.dispose();});
    for(const {material,geos}of groups.values()){const mesh=new THREE.Mesh(mergeGeometries(geos),material);mesh.castShadow=true;mesh.receiveShadow=true;this.scene.add(mesh);for(const geo of geos)geo.dispose();}
  }
  buildBiome(){buildDetailedBiome(this);}
  buildWater(){
    if(activeTrack.id!=='coast'){
      this.waterMaterial={uniforms:{time:{value:0}}};
      const ground=new THREE.Mesh(new THREE.PlaneGeometry(6000,6000),activeTrack.id==='ice'?this.mat(0xe0eff2):createDesertMaterial(true));if(activeTrack.id==='desert'){ground.material.polygonOffset=true;ground.material.polygonOffsetFactor=2;ground.material.polygonOffsetUnits=4;}ground.rotation.x=-Math.PI/2;ground.position.y=-4;ground.receiveShadow=true;this.scene.add(ground);return;
    }
    const ocean=createCoastalWater(TRACK,SEGMENTS,this.scene.fog,this.atmosphere.profile,this.coastalLandforms);this.waterMaterial=ocean.waterMaterial;this.textures.set('coast-depth',ocean.depthTexture);this.scene.add(ocean.water,ocean.shore);
  }
  setPickupModel(g,kind){
    if(g.userData.kind===kind)return;if(g.userData.model)g.remove(g.userData.model);
    const model=createPickupModel(kind);g.add(model);g.userData.model=model;g.userData.kind=kind;
    g.userData.halo.material.color.setHex(PICKUP_COLORS[kind]);g.userData.ring.material.uniforms.color.value.setHex(PICKUP_COLORS[kind]);g.userData.beacon.material.color.setHex(PICKUP_COLORS[kind]);
  }
  buildPickups(){
    for(const [i,p]of PICKUP_LOCATIONS.entries()){
      const g=new THREE.Group();g.position.set(p.x,p.y+1.9,p.z);
      const {halo,ring}=createPickupGround(p,this.texture('glow'));g.add(halo,ring);
      const beacon=new THREE.Mesh(new THREE.CylinderGeometry(1.85,1.85,.8,24,1,true),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.2,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));beacon.position.y=-1.3;g.add(beacon);
      g.userData={halo,ring,beacon};this.setPickupModel(g,WEAPON_IDS[i%WEAPON_IDS.length]);this.scene.add(g);this.boxes.push(g);
    }
  }
  buildEliminationLine(){
    this.deadline=new THREE.Group();
    const glow=new THREE.MeshBasicMaterial({color:0xff443d,transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false});
    this.box(0,.15,0,1.2,.12,ROAD_WIDTH+2,new THREE.MeshBasicMaterial({color:0xff514f}),this.deadline);
    this.box(0,2.0,0,.1,4,ROAD_WIDTH+2,glow,this.deadline);
    for(const side of [-1,1])this.cylinder(0,2,side*(ROAD_WIDTH/2+1),.15,.15,4,0xff514f,6,this.deadline);
    this.scene.add(this.deadline);this.deadline.visible=false;
  }
  followFrame(frame,dt,cars){
    const aspect=this.container.clientWidth/Math.max(1,this.container.clientHeight);
    const f=this.follow=stepCamera(this.follow,frame,cars,aspect,dt),pose=cameraPose(f);
    // Avoid drawing scenery already hidden by weather; always retain the pack.
    const far=Math.max(this.atmosphere.profile.viewDistance,f.far);
    if(this.camera.aspect!==aspect||this.camera.far!==far){this.camera.aspect=aspect;this.camera.far=far;this.camera.updateProjectionMatrix();}
    this.camera.position.set(pose.x,pose.y,pose.z);this.camera.lookAt(pose.targetX,pose.targetY,pose.targetZ);this.camera.updateMatrixWorld();
    const [sx,sy,sz]=this.atmosphere.profile.sunOffset;this.sun.position.set(f.x+sx,(f.y||0)+sy,f.z+sz);this.sun.target.position.set(f.x,f.y||0,f.z);this.sun.target.updateMatrixWorld();
  }
  createCar(color){
    const g=createSportsCar(color),{paint}=g.userData;
    const shield=new THREE.Mesh(new THREE.SphereGeometry(3.2,20,12),new THREE.MeshPhysicalMaterial({color:0x5acfff,emissive:0x237cbd,emissiveIntensity:.5,transparent:true,opacity:.2,roughness:.18,metalness:.1,depthWrite:false}));shield.position.y=.7;shield.scale.y=.65;shield.visible=false;g.add(shield);g.userData={shield,paint,baseColor:new THREE.Color(color),chassisSize:{length:CAR_LENGTH,width:CAR_WIDTH}};g.rotation.order='YXZ';
    const flame=this.createFlame();flame.scale.x=(FLAME_RANGE-CAR_LENGTH/2)/8.35;g.add(flame);g.userData.flame=flame;const exhaust=new THREE.Group();exhaust.visible=false;for(const side of [-1,1]){const jet=this.createFlame();jet.visible=true;jet.position.set(-2.36,.37,side*.50);jet.rotation.y=Math.PI;jet.scale.set(.32,.13,.13);exhaust.add(jet);}g.add(exhaust);g.userData.boostExhaust=exhaust;
    return g;
  }
  createFlame(){
    if(!this.flameMaterial)this.flameMaterial=new THREE.ShaderMaterial({uniforms:{time:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 vUv;uniform float time;void main(){float x=vUv.x,y=vUv.y*2.-1.;float flicker=sin(x*28.-time*26.+sin(y*12.))*0.10+sin(x*53.-time*39.)*.05;float width=(.09+sqrt(x)*.66)*(1.-pow(x,5.));float edge=abs(y+sin(x*14.-time*19.)*x*.13);float a=1.-smoothstep(width*.6,width+flicker*.6,edge);a*=1.-smoothstep(.7,1.,x);float core=(1.-smoothstep(0.,width*.7,edge))*(1.-x*.65);vec3 col=mix(vec3(1.,.10,.005),vec3(1.,.78,.12),core);col=mix(col,vec3(1.,.97,.65),core*core*.85);gl_FragColor=vec4(col,a*.9);}`});
    const g=new THREE.Group();g.visible=false;g.position.set(CAR_LENGTH/2,.65,0);
    for(const angle of [0,Math.PI/2]){const plane=new THREE.Mesh(new THREE.PlaneGeometry(8.35,4),this.flameMaterial);plane.position.x=4.175;plane.rotation.x=angle;g.add(plane);}return g;
  }
  buildParticles(){
    this.particleMesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:this.texture('glow'),transparent:true,opacity:.5,depthWrite:false}),600);this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.particleMesh.frustumCulled=false;this.particleMesh.count=0;this.scene.add(this.particleMesh);this.fireMesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:this.texture('glow'),transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),600);this.fireMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.fireMesh.frustumCulled=false;this.fireMesh.count=0;this.scene.add(this.fireMesh);this.particleDummy=new THREE.Object3D();this.particleColor=new THREE.Color();
  }
  particle(x,y,z,kind,vx=0,vz=0){
    if(this.particles.length>=600)return;const smoke=kind==='smoke'||kind==='steam';this.particles.push({x,y,z,vx:vx+(Math.random()-.5)*1.4,vz:vz+(Math.random()-.5)*1.4,vy:smoke?2+Math.random()*2:1+Math.random()*3,kind,life:smoke?.8+Math.random()*.8:.25+Math.random()*.4,max:smoke?1.6:.65,size:smoke?.16+Math.random()*.22:.25+Math.random()*.45});
  }
  updateParticles(dt){
    let count=0,fireCount=0;for(const p of this.particles){p.life-=dt;if(p.life<=0)continue;p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;const fade=Math.min(1,p.life/.3),size=p.size*(p.kind!=='fire'?1+(p.max-p.life)*1.4:1)*fade;this.particleDummy.position.set(p.x,p.y,p.z);this.particleDummy.scale.setScalar(size);this.particleDummy.quaternion.copy(this.camera.quaternion);this.particleDummy.updateMatrix();const mesh=p.kind!=='fire'?this.particleMesh:this.fireMesh,index=p.kind!=='fire'?count++:fireCount++;mesh.setMatrixAt(index,this.particleDummy.matrix);this.particleColor.set(p.kind==='steam'?0xd9f5f4:p.kind==='smoke'?0x454950:p.life<.18?0xe64c22:0xffc43d);mesh.setColorAt(index,this.particleColor);}
    this.particles=this.particles.filter(p=>p.life>0);this.particleMesh.count=count;this.particleMesh.instanceMatrix.needsUpdate=true;if(this.particleMesh.instanceColor)this.particleMesh.instanceColor.needsUpdate=true;this.fireMesh.count=fireCount;this.fireMesh.instanceMatrix.needsUpdate=true;if(this.fireMesh.instanceColor)this.fireMesh.instanceColor.needsUpdate=true;
  }
  combatObjects(state,dt,now){
    const sync=(map,list,create,move)=>{const ids=new Set();for(const item of list){ids.add(item.id);let g=map.get(item.id);if(!g){g=create(item);map.set(item.id,g);this.scene.add(g);}move(g,item);}for(const[id,g]of map)if(!ids.has(id)){this.scene.remove(g);g.traverse(o=>{if(o.isMesh||o.isSprite){if(o.isMesh)o.geometry.dispose();if(o.userData.ownedMaterial)o.material.dispose();}});map.delete(id);}};
    sync(this.rockets,state?.projectiles||[],r=>{const g=new THREE.Group();const mesh=new THREE.Mesh(r.kind==='plasma'?new THREE.IcosahedronGeometry(.65,1):new THREE.ConeGeometry(r.kind==='rocket'?.32:.08,r.kind==='rocket'?1.8:1.5,7),new THREE.MeshBasicMaterial({color:r.kind==='plasma'?0x7feaff:0xffc257}));mesh.rotation.z=-Math.PI/2;mesh.userData.ownedMaterial=true;g.add(mesh);if(r.kind==='plasma'){const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:this.texture('glow'),color:0x32eaff,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));halo.scale.set(2.8,2.8,2.8);halo.userData.ownedMaterial=true;g.add(halo);}return g;},(g,r)=>{const pose=g.userData.motion=projectilePose(g.userData.motion,r,state.combatTime??state.time,dt,now);g.position.set(pose.x,pose.y,pose.z);g.rotation.order='YXZ';g.rotation.set(0,-pose.angle,pose.pitch||0);if(r.kind==='rocket'&&this.emitParticles)this.particle(g.position.x,g.position.y,g.position.z,'smoke');});
    sync(this.mines,state?.mines||[],()=>{const g=new THREE.Group();this.cylinder(0,.2,0,.7,.9,.35,0x243541,10,g);this.mesh(new THREE.SphereGeometry(.22,6,4),new THREE.MeshBasicMaterial({color:0xff5446}),0,.5,0,g).userData.ownedMaterial=true;return g;},(g,m)=>{g.position.set(m.x,m.y||0,m.z);g.rotation.set(0,-(m.angle||0),m.pitch||0,'YXZ');g.children[1].visible=Math.sin(now*.012)>-.2;});
    sync(this.chains,state?.chains||[],()=>{const g=new THREE.Group();const ball=this.mesh(new THREE.IcosahedronGeometry(.95,1),0x4b5258,0,0,0,g);for(let i=0;i<8;i++)this.mesh(new THREE.TorusGeometry(.22,.07,4,6),0xa4a9ad,0,0,0,g);return g;},(g,b)=>{const pose=g.userData.motion=projectilePose(g.userData.motion,{...b,vx:b.renderVx??b.vx,vy:b.renderVy??b.vy,vz:b.renderVz??b.vz,angle:0,pitch:0},state.combatTime??state.time,dt,now);const ownerState=state.players.find(p=>p.id===b.owner),ballRoad=nearestTrack(pose.x,pose.z,ownerState?.trackFraction);if(ballRoad.distance<=ballRoad.halfWidth+.6)pose.y=Math.max(pose.y,ballRoad.y+.98);const owner=this.cars.get(b.owner),anchor=owner?owner.localToWorld(new THREE.Vector3(-CAR_LENGTH/2,.9,0)):{x:b.anchorX??pose.x,y:b.anchorY??pose.y,z:b.anchorZ??pose.z};g.children[0].position.set(pose.x,pose.y,pose.z);g.children[0].rotation.z=now*.002;for(let i=1;i<9;i++){const t=i/9,x=pose.x+(anchor.x-pose.x)*t,z=pose.z+(anchor.z-pose.z)*t,road=nearestTrack(x,z,ownerState?.trackFraction),lineY=pose.y+(anchor.y-pose.y)*t,y=road.distance<=road.halfWidth+.6?Math.max(lineY,road.y+.22):lineY;g.children[i].position.set(x,y,z);g.children[i].rotation.set(i%2*Math.PI/2,-Math.atan2(anchor.z-pose.z,anchor.x-pose.x),Math.atan2(anchor.y-pose.y,Math.hypot(anchor.x-pose.x,anchor.z-pose.z)));}});
    for(const e of state?.effects||[])if(!this.seenEffects.has(e.id)){
      this.seenEffects.add(e.id);const duration=e.duration||500;let mesh;const beam=e.toX!==undefined;
      if(beam){const y=e.y??.85,toY=e.toY??y,direction=new THREE.Vector3(e.toX-e.x,toY-y,e.toZ-e.z),length=direction.length();mesh=new THREE.Mesh(new THREE.BoxGeometry(length,e.kind==='rail'?.18:.09,e.kind==='rail'?.4:.12),new THREE.MeshBasicMaterial({color:e.color,transparent:true,opacity:1,depthWrite:false}));mesh.position.set((e.x+e.toX)/2,(y+toY)/2,(e.z+e.toZ)/2);if(length>0)mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),direction.normalize());}
      else{mesh=new THREE.Mesh(new THREE.RingGeometry(.8,1,40),new THREE.MeshBasicMaterial({color:e.color,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(e.x,(e.y??0)+.3,e.z);}
      this.scene.add(mesh);this.effects.set(e.id,{mesh,until:now+Math.min(duration,Math.max(50,e.until-state.time)),duration,max:e.radius||5,beam,kind:e.kind});
      if(e.kind==='explosion')for(let i=0;i<35;i++)this.particle(e.x,(e.y??0)+.7,e.z,i%3?'fire':'smoke',(Math.random()-.5)*14,(Math.random()-.5)*14);
    }
    if(this.seenEffects.size>3000)this.seenEffects=new Set([...this.seenEffects].slice(-1500));
    for(const[id,e]of this.effects){const t=1-(e.until-now)/e.duration;if(t>=1){this.scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();this.effects.delete(id);}else{if(!e.beam)e.mesh.scale.setScalar(1+t*e.max);else if(e.kind==='rail'){e.mesh.scale.z=1+t*5;e.mesh.position.y+=dt*.4;e.mesh.material.color.lerp(new THREE.Color(0x82979e),dt*3);}e.mesh.material.opacity=(1-t)*.85;}}
  }
  updateLightning(state,now){
    const ids=new Set();
    for(const arc of state?.arcs||[]){
      const a=this.cars.get(arc.owner),b=this.cars.get(arc.target);if(!a?.visible||!b?.visible)continue;
      const id=arc.owner+':'+arc.target;ids.add(id);let line=this.lightning.get(id);
      if(!line){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(36),3));line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xb6edff,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));line.frustumCulled=false;const glowGeometry=new THREE.BufferGeometry();glowGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(198),3));const glow=new THREE.Mesh(glowGeometry,new THREE.MeshBasicMaterial({color:0x176cff,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));glow.frustumCulled=false;line.userData.glow=glow;this.scene.add(glow,line);this.lightning.set(id,line);}
      const positions=line.geometry.attributes.position,dx=b.position.x-a.position.x,dz=b.position.z-a.position.z,length=Math.hypot(dx,dz)||1,beat=Math.floor(now/45);
      for(let i=0;i<12;i++){const t=i/11,jitter=i===0||i===11?0:Math.sin(i*79.3+beat*17.7)*.6;positions.setXYZ(i,a.position.x+dx*t-dz/length*jitter,a.position.y+2.6+(b.position.y-a.position.y-1.5)*t+Math.sin(i*9+beat)*Math.sin(t*Math.PI)*.4,a.position.z+dz*t+dx/length*jitter);}
      positions.needsUpdate=true;
      const glow=line.userData.glow.geometry.attributes.position;let vertex=0;
      for(let i=0;i<11;i++){const ax=positions.getX(i),ay=positions.getY(i),az=positions.getZ(i),bx=positions.getX(i+1),by=positions.getY(i+1),bz=positions.getZ(i+1),d=Math.hypot(bx-ax,bz-az)||1,nx=-(bz-az)/d*.1,nz=(bx-ax)/d*.1;const corners=[[ax+nx,ay,az+nz],[ax-nx,ay,az-nz],[bx+nx,by,bz+nz],[bx-nx,by,bz-nz]];for(const j of [0,1,2,1,3,2])glow.setXYZ(vertex++,...corners[j]);}glow.needsUpdate=true;
      if(this.emitParticles)this.particle(b.position.x,b.position.y+1,b.position.z,'steam');
    }
    for(const[id,line]of this.lightning)if(!ids.has(id)){this.scene.remove(line,line.userData.glow);line.userData.glow.geometry.dispose();line.userData.glow.material.dispose();line.geometry.dispose();line.material.dispose();this.lightning.delete(id);}
    const owners=new Set();for(const p of state?.players||[])if(p.firing==='taser'&&!p.eliminated){
      owners.add(p.id);let ring=this.dangerRings.get(p.id);if(!ring){ring=new THREE.Mesh(new THREE.RingGeometry(TASER_RADIUS-.12,TASER_RADIUS,64),new THREE.MeshBasicMaterial({color:0x57c9ff,transparent:true,opacity:.38,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));ring.rotation.x=-Math.PI/2;this.scene.add(ring);this.dangerRings.set(p.id,ring);}const car=this.cars.get(p.id);if(car)ring.position.set(car.position.x,(p.groundY||0)+.09,car.position.z);ring.material.opacity=.25+.12*Math.sin(now*.017);
    }
    for(const[id,ring]of this.dangerRings)if(!owners.has(id)){this.scene.remove(ring);ring.geometry.dispose();ring.material.dispose();this.dangerRings.delete(id);}
  }
  dispose(){
    this.resizeObserver?.disconnect();this.previewTarget?.dispose();
    const geometries=new Set(),materials=new Set(),textures=new Set(this.textures.values());
    this.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);if(m.map)textures.add(m.map);}});
    for(const g of geometries)if(!g.userData.sharedCarResource)g.dispose();for(const m of materials)if(!m.userData.sharedCarResource)m.dispose();for(const t of textures)t.dispose();
    this.environment?.dispose();this.sun.shadow.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();
  }
  resetRound(){
    this.follow=null;this.cameraMode=null;this.particles=[];
    for(const g of this.cars.values())g.userData.snap=true;
    for(const t of this.trails){this.scene.remove(t.mesh);t.mesh.geometry.dispose();t.mesh.material.dispose();}this.trails=[];
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(w&&h)this.renderer.setSize(w,h,false);}
  update(state,localId,localCar,dt,now){
    this.boostPads?.update(state,now);if(this.coastalCrabs)updateCoastalCrabs(this.coastalCrabs,state?.raceTime??now/1000);if(this.desertMoles)updateDesertMoles(this.desertMoles,state?.raceTime??now/1000);if(this.valley)updateGlacierValley(this.valley,now);this.waterMaterial.uniforms.time.value=now/1000;if(this.flameMaterial)this.flameMaterial.uniforms.time.value=now/1000;this.frame++;this.particleClock+=dt;this.emitParticles=this.particleClock>=1/30;if(this.emitParticles)this.particleClock%=1/30;
    const previewProgress=START_FRACTION+((now/1000*22)%TRACK_LENGTH)/TRACK_LENGTH;
    const previewChase=createChase([{progress:previewProgress-START_FRACTION}]);
    const mode=state?`${state.code}:${state.round||1}`:'preview';if(this.cameraMode!==mode){this.follow=null;this.cameraMode=mode;this.seenEffects.clear();}
    this.deadline.visible=!!state&&state.phase!=='lobby';
    if(state?.chase){const d=state.chase;this.deadline.position.set(d.x,d.y||0,d.z);this.deadline.rotation.order='YXZ';this.deadline.rotation.set(0,-d.angle,Math.atan(d.grade||0));this.deadline.scale.z=((d.halfWidth||6)*2+2)/(ROAD_WIDTH+2);}
    const previewFleet=[];
    const inRoom=!!state;this.previewCars.forEach((g,i)=>{g.visible=!inRoom;if(!inRoom){const fraction=previewProgress-i*1.7/TRACK_LENGTH,p=trackAt(fraction),lane=Math.min(p.halfWidth-CAR_WIDTH/2-.5,activeTrack.id==='ice'?iceSplit(p.x)+1.8:1.8),side=i===0?-lane:lane,x=p.x+p.nx*side,z=p.z+p.nz*side;g.position.set(x,p.y,z);g.rotation.set(0,-p.angle,Math.atan(p.grade||0));previewFleet.push({...p,x,z,progress:fraction-START_FRACTION});}});
    const present=new Set();
    if(state)for(const p of state.players){present.add(p.id);let g=this.cars.get(p.id);if(!g){g=this.createCar(p.color);this.scene.add(g);this.cars.set(p.id,g);g.position.set(p.x,0,p.z);g.rotation.y=-p.angle;}
      const car=p.id===localId&&localCar&&!p.wrecked?localCar:p;const a=1;g.userData.snap=false;
      g.position.x+=(car.x-g.position.x)*a;g.position.z+=(car.z-g.position.z)*a;g.rotation.y+=angleDelta(-car.angle,g.rotation.y)*a;
      g.position.y=(car.y||0)+(1-Math.cos(car.roll||0)*Math.cos(car.pitch||0))*.5;g.rotation.x=car.roll||0;g.rotation.z=car.pitch||0;g.visible=(!p.eliminated||p.wrecked)&&g.position.y>-15;
      syncCarWeapon(g,p);
      g.userData.flame.visible=p.firing==='flame'&&!p.eliminated;
      const thrust=boostExhaustStrength(car.padBoostRemaining);g.userData.boostExhaust.visible=thrust>0&&!p.eliminated;for(const jet of g.userData.boostExhaust.children)jet.scale.set(.32*thrust,.13*Math.sqrt(thrust),.13*Math.sqrt(thrust));
      g.userData.shield.visible=p.shield>0&&!p.eliminated;g.userData.shield.material.opacity=.16+Math.sin(now*.006)*.04;
      g.userData.paint.emissive.setHex(p.tased>0?0x2868c5:0);g.userData.paint.emissiveIntensity=p.tased>0?.7:0;
      g.userData.paint.color.copy(g.userData.baseColor).multiplyScalar(p.wrecked?.22:1-damageSeverity(p.health??100)*.396);
      if(g.visible&&this.emitParticles){const level=damageLevel(p.health??100),fx=Math.cos(car.angle),fz=Math.sin(car.angle);if(level>0){for(let j=0;j<level;j++)this.particle(car.x+fx*1.2,g.position.y+.9,car.z+fz*1.2,'smoke',-car.vx*.12,-car.vz*.12);if(level>=3)for(let j=0;j<level-1;j++)this.particle(car.x+fx*1.2+(Math.random()-.5),g.position.y+.7,car.z+fz*1.2+(Math.random()-.5),'fire');}
        if(p.firing==='flame')for(let j=0;j<10;j++){const d=CAR_LENGTH/2+Math.random()*(FLAME_RANGE-CAR_LENGTH/2),spread=(Math.random()-.5)*d*.22,point=g.localToWorld(new THREE.Vector3(d,.65,spread));this.particle(point.x,point.y,point.z,'fire',fx*4,fz*4);}
      }
      if(!p.eliminated&&state.phase==='racing'&&this.frame%4===0&&Math.hypot(car.vx,car.vz)>9){const side=-car.vx*Math.sin(car.angle)+car.vz*Math.cos(car.angle);if(Math.abs(side)>2||car.boost>0)this.addTrail(car,car.boost>0?p.color:0x293c3c);}
    }
    for(const [id,g]of this.cars)if(!present.has(id)){this.scene.remove(g);disposeCarInstance(g);this.cars.delete(id);}
    // Smoothing must never draw two solid chassis inside one another.
    const visibleCars=[...this.cars].filter(([id,g])=>g.visible).map(([id,g])=>{const p=state?.players.find(p=>p.id===id);return {...p,x:g.position.x,z:g.position.z,angle:-g.rotation.y,y:g.position.y,vx:0,vz:0,yawVelocity:0};});
    this.gustTrails?.update(state?.phase==='racing'?state.raceTime:0,visibleCars);
    // Rendering is read-only: physics contacts are solved only on simulation ticks.
    this.followFrame(state?.camera||cameraFrame(previewChase,previewFleet),dt,state?visibleCars:previewFleet);
    this.boxes.forEach((g,i)=>{const pickup=state?.pickups[i];g.visible=!state||pickup?.readyAt<=state.time;this.setPickupModel(g,pickup?.item||WEAPON_IDS[i%WEAPON_IDS.length]);g.userData.model.rotation.y=now*.00045+i;g.position.y=(PICKUP_LOCATIONS[i]?.y||0)+1.9+Math.sin(now*.0017+i)*.18;g.userData.halo.position.y=(PICKUP_LOCATIONS[i]?.y||0)+.08-g.position.y;g.userData.ring.position.y=(PICKUP_LOCATIONS[i]?.y||0)+.13-g.position.y;});
    this.combatObjects(state,dt,now);this.updateLightning(state,now);animateLandmarks(this,now);this.updateParticles(dt);
    for(let i=this.trails.length-1;i>=0;i--){const t=this.trails[i];t.life-=dt;t.mesh.material.opacity=Math.min(.3,t.life*.15);if(t.life<=0){this.scene.remove(t.mesh);t.mesh.geometry.dispose();t.mesh.material.dispose();this.trails.splice(i,1);}}
    this.atmosphere.update(this.camera,now,this.follow?.y||0,state?(state.phase==='racing'?state.raceTime:0):now/1000,this.follow);this.renderer.render(this.scene,this.camera);
  }
  addTrail(car,color){if(this.trails.length>120)return;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.65,.4),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.3,depthWrite:false}));mesh.rotation.set(-Math.PI/2,0,-car.angle);mesh.position.set(car.x-Math.cos(car.angle)*1.25,(car.groundY||0)+.09,car.z-Math.sin(car.angle)*1.25);this.scene.add(mesh);this.trails.push({mesh,life:2});}
  screenPosition(id){const g=this.cars.get(id);if(!g)return null;const p=g.position.clone();p.y+=3.3;p.project(this.camera);const r=this.container.getBoundingClientRect();return {x:r.left+(p.x+1)/2*r.width,y:r.top+(1-p.y)/2*r.height};}
}
