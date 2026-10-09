import * as THREE from 'three';
import {buildLandmarks,animateLandmarks,LANDMARKS} from './landmarks.js';
import { createPickupModel, PICKUP_COLORS } from './pickups.js';
import { WEAPON_IDS } from '/shared/combat.js';
import { RoundedBoxGeometry } from '/vendor/RoundedBoxGeometry.js';
import { mergeGeometries } from '/vendor/BufferGeometryUtils.js';
import { TRACK, SEGMENTS, ROAD_WIDTH, trackAt, angleDelta, COLORS, TRACK_LENGTH, START_FRACTION, PICKUP_LOCATIONS, spawnCar, hasBarrier, damageLevel, CAR_LENGTH, CAR_WIDTH, SURFACE_HALF_WIDTH, nearestTrack, collideCars, OBSTACLES } from '/shared/game.js';
import { cameraFrame, createChase } from '/shared/chase.js';
const C={asphalt:0x394951,sand:0x938d7c,cliff:0x777568,cream:0xc8c6b7,coral:0xae6654,navy:0x263941,teal:0x497475,lime:0xd4f65e};
export class World{
  constructor(container){
    this.container=container;this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x536675);
    this.scene.fog=new THREE.FogExp2(0x667986,.0018);
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.camera=new THREE.OrthographicCamera(-60,60,40,-40,.1,300);this.camera.position.set(0,90,64);this.camera.lookAt(0,0,0);
    this.scene.add(new THREE.HemisphereLight(0xc4d6e5,0x555344,1.55));
    const sun=new THREE.DirectionalLight(0xffe6c8,3.1);sun.position.set(-45,75,-38);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-68,right:68,top:58,bottom:-58,near:1,far:180});sun.shadow.radius=3;sun.shadow.normalBias=.07;sun.shadow.bias=-.0004;this.scene.add(sun);this.sun=sun;this.scene.add(sun.target);
    this.materials=new Map();this.textures=new Map();this.static=new THREE.Group();this.scene.add(this.static);this.cars=new Map();this.boxes=[];this.rockets=new Map();this.effects=new Map();this.trails=[];this.frame=0;this.mines=new Map();this.chains=new Map();this.seenEffects=new Set();this.particles=[];this.particleClock=0;
    this.buildTrack();this.buildScenery();this.landmarks=buildLandmarks(this);this.mergeStatic();this.buildWater();this.buildPickups();this.buildEliminationLine();this.buildParticles();
    this.previewCars=COLORS.map((color,i)=>{const mesh=this.createCar(color);this.scene.add(mesh);return mesh;});
    this.resize();this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);
    this.renderer.compile(this.scene,this.camera);
  }
  texture(kind){
    if(this.textures.has(kind))return this.textures.get(kind);
    const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');let seed=731;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    if(kind==='glow'){
      const grad=ctx.createRadialGradient(256,256,0,256,256,256);grad.addColorStop(0,'#ffffff');grad.addColorStop(.25,'#ffffffaa');grad.addColorStop(.6,'#ffffff35');grad.addColorStop(1,'#ffffff00');ctx.fillStyle=grad;ctx.fillRect(0,0,512,512);
    }else{
      ctx.fillStyle=kind==='asphalt'?'#737a7f':'#c5c2b8';ctx.fillRect(0,0,512,512);
      for(let i=0;i<50;i++){const x=random()*512,y=random()*512,r=15+random()*110,grad=ctx.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,i%2?'#10191d23':'#eff5f012');grad.addColorStop(1,'#00000000');ctx.fillStyle=grad;ctx.fillRect(x-r,y-r,r*2,r*2);}
      for(let i=0;i<26000;i++){ctx.fillStyle=i%2?'#eef0e51a':'#10192329';const size=1+random()*2;ctx.fillRect(random()*512,random()*512,size,size);}
      for(let i=0;i<(kind==='asphalt'?10:24);i++){let x=random()*512,y=random()*512;ctx.beginPath();ctx.moveTo(x,y);for(let j=0;j<5;j++){x+=(random()-.4)*15;y+=random()*18;ctx.lineTo(x,y);}ctx.lineWidth=kind==='asphalt'?.8:1.2;ctx.strokeStyle='#18212430';ctx.stroke();}
      if(kind==='asphalt'){ctx.strokeStyle='#10191d10';ctx.lineWidth=5;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(random()*512,0);ctx.bezierCurveTo(random()*512,150,random()*512,350,random()*512,512);ctx.stroke();}}
    }
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;if(kind!=='glow')texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;this.textures.set(kind,texture);return texture;
  }
  mat(color,roughness=.8,metalness=0){const key=`${color}-${roughness}-${metalness}`;if(!this.materials.has(key)){const weathered=[C.cliff,C.sand,C.cream,C.coral,C.teal].includes(color);this.materials.set(key,new THREE.MeshStandardMaterial({color,roughness,metalness,map:weathered?this.texture('concrete'):null}));}return this.materials.get(key);}
  mesh(geometry,color,x=0,y=0,z=0,parent=this.static){if(!geometry.attributes.uv){const p=geometry.attributes.position,uv=[];for(let i=0;i<p.count;i++)uv.push((p.getX(i)+p.getZ(i))/5,p.getY(i)/3);geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));}const mesh=new THREE.Mesh(geometry,typeof color==='object'?color:this.mat(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  box(x,y,z,w,h,d,color,parent=this.static){return this.mesh(new THREE.BoxGeometry(w,h,d),color,x,y,z,parent);}
  cylinder(x,y,z,r1,r2,h,color,n=8,parent=this.static){return this.mesh(new THREE.CylinderGeometry(r1,r2,h,n),color,x,y,z,parent);}
  ribbon(offset,width,y,color,skip=0,protectedOnly=false){
    const vertices=[],uv=[];
    for(let i=0;i<TRACK.length;i++){
      if(skip&&Math.floor(i/skip)%2)continue;
      if(protectedOnly&&!hasBarrier(SEGMENTS[i].start/TRACK_LENGTH))continue;
      const a=SEGMENTS[i],b=SEGMENTS[(i+1)%TRACK.length];
      const ao=typeof offset==='function'?offset(a):offset,bo=typeof offset==='function'?offset(b):offset,aw=typeof width==='function'?width(a):width,bw=typeof width==='function'?width(b):width;
      const p=[[a.x+a.nx*(ao-aw/2),y,a.z+a.nz*(ao-aw/2)],[a.x+a.nx*(ao+aw/2),y,a.z+a.nz*(ao+aw/2)],[b.x+b.nx*(bo-bw/2),y,b.z+b.nz*(bo-bw/2)],[b.x+b.nx*(bo+bw/2),y,b.z+b.nz*(bo+bw/2)]];
      for(const j of [0,1,2,1,3,2]){vertices.push(...p[j]);uv.push(p[j][0]/10,p[j][2]/10);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();return this.mesh(geo,color);
  }
  buildTrack(){
    // A narrow raised causeway, with water on both sides. No invisible grass
    // runoff: the top surface ends at the same edge used by the simulation.
    this.ribbon(0,p=>(p.halfWidth+.6)*2,-.18,C.sand);
    for(const side of [-1,1]){
      const vertices=[];for(let i=0;i<SEGMENTS.length;i++){const p=SEGMENTS[i],q=SEGMENTS[(i+1)%SEGMENTS.length],off=side*(p.halfWidth+.6),offQ=side*(q.halfWidth+.6);
        const points=[[p.x+p.nx*off,-.18,p.z+p.nz*off],[q.x+q.nx*offQ,-.18,q.z+q.nz*offQ],[p.x+p.nx*off,-4,p.z+p.nz*off],[q.x+q.nx*offQ,-4,q.z+q.nz*offQ]];for(const j of [0,1,2,1,3,2])vertices.push(...points[j]);}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();const mat=this.mat(C.cliff);mat.side=THREE.DoubleSide;this.mesh(geo,mat);
    }
    this.ribbon(0,p=>p.halfWidth*2+.8,-.05,0x797d6c);
    this.ribbon(0,p=>p.halfWidth*2,.01,new THREE.MeshStandardMaterial({map:this.texture('asphalt'),color:0x939fa5,roughness:.72,metalness:.06,side:THREE.DoubleSide}));
    for(const side of [-1,1]){
      // Exposed edges have flat yellow paint; only protected edges have raised walls.
      this.ribbon(p=>side*(p.halfWidth-.18),.28,.045,0xffce32);
      this.ribbon(p=>side*(p.halfWidth+.16),.55,.06,C.cream,0,true);
      this.ribbon(p=>side*(p.halfWidth+.16),.55,.065,C.coral,3,true);
      for(let i=0;i<TRACK.length;i+=2){
        const p=SEGMENTS[i],q=SEGMENTS[(i+2)%TRACK.length];if(!hasBarrier(p.start/TRACK_LENGTH))continue;
        const x=p.x+p.nx*(p.halfWidth+.28)*side,z=p.z+p.nz*(p.halfWidth+.28)*side,ex=q.x+q.nx*(q.halfWidth+.28)*side,ez=q.z+q.nz*(q.halfWidth+.28)*side;
        const length=Math.hypot(ex-x,ez-z),angle=-Math.atan2(ez-z,ex-x);
        const wall=this.box((x+ex)/2,.64,(z+ez)/2,length+ .04,1.25,.56,Math.floor(i/8)%2?0xc9c9bb:0xb7382b);wall.rotation.y=angle;
        const cap=this.box((x+ex)/2,1.34,(z+ez)/2,length+.04,.16,.68,0x27343d);cap.rotation.y=angle;
        if(!hasBarrier(SEGMENTS[(i+TRACK.length-2)%TRACK.length].start/TRACK_LENGTH)||!hasBarrier(q.start/TRACK_LENGTH)){
          const post=this.box(x,1.1,z,.75,2.2,.75,0xffce32);post.rotation.y=angle;
          for(const y of [.4,1,1.6]){const stripe=this.box(x,y,z,.79,.23,.79,0x151e25);stripe.rotation.y=angle;}
        }
      }
    }
    for(const o of OBSTACLES){
      this.cylinder(o.x,.18,o.z,o.radius,o.radius,.36,0x202b32,20);
      this.cylinder(o.x,.72,o.z,o.radius*.93,o.radius*.98,1.08,0xeabf32,20);
      this.cylinder(o.x,.87,o.z,o.radius*.95,o.radius*.95,.32,0x1d2930,20);
      this.cylinder(o.x,1.4,o.z,o.radius*.85,o.radius*.93,.2,0xeabf32,20);
      for(const offset of [-.6,.6]){const stripe=this.box(o.x+Math.cos(trackAt(o.fraction).angle)*offset,1.51,o.z+Math.sin(trackAt(o.fraction).angle)*offset,.35,.025,2.25,0x18252d);stripe.rotation.y=-trackAt(o.fraction).angle;}
      this.cylinder(o.x,1.68,o.z,.13,.13,.48,0xf18e23,8);
    }
    this.ribbon(0,.12,.06,0xb6b89d,5);
    const start=trackAt(START_FRACTION);
    const line=new THREE.Group();line.position.set(start.x,.075,start.z);line.rotation.y=-start.angle;this.static.add(line);
    for(let r=0;r<2;r++)for(let c=0;c<12;c++)this.box((r-.5)*.7,0,(c-5.5)*.9,.7,.02,.9,(r+c)%2?0xf4efd4:0x1c2d34,line);
    for(let i=0;i<6;i++){const p=trackAt(START_FRACTION-(6+Math.floor(i/2)*5.5)/TRACK_LENGTH),g=new THREE.Group();g.position.set(p.x+p.nx*(i%2?-2.3:2.3),.06,p.z+p.nz*(i%2?-2.3:2.3));g.rotation.y=-p.angle;this.static.add(g);this.box(-1.6,0,0,.12,.02,2.4,0xe2d9bc,g);this.box(0,0,-1.2,3.2,.02,.1,0xe2d9bc,g);this.box(0,0,1.2,3.2,.02,.1,0xe2d9bc,g);}
    // Start-line gantry and its illuminated timing panel.
    const gantry=new THREE.Group();gantry.position.set(start.x,0,start.z);gantry.rotation.y=-start.angle;this.static.add(gantry);
    this.box(0,3.2,-(start.halfWidth+1.7),.6,6.4,.6,C.navy,gantry);this.box(0,3.2,start.halfWidth+1.7,.6,6.4,.6,C.navy,gantry);this.box(0,6.3,0,.65,.65,(start.halfWidth+2)*2,C.navy,gantry);
    this.box(0,6.5,0,.8,1.2,8,C.lime,gantry);
    for(let i=0;i<5;i++)this.box(.46,6.55,(i-2)*1.1,.05,.55,.55,0x173b38,gantry);
    const banner=this.makeText('START',512,80,'#d4f65e','#17313c',52);const sign=new THREE.Mesh(new THREE.PlaneGeometry(9,1.5),new THREE.MeshBasicMaterial({map:banner,side:THREE.DoubleSide}));sign.position.set(start.x,6.1,start.z+1.1);this.scene.add(sign);
  }
  makeText(text,w,h,bg,fg,size){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,w,h);x.fillStyle=fg;x.font=`italic 900 ${size}px sans-serif`;x.textAlign='center';x.textBaseline='middle';x.fillText(text,w/2,h/2+3);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
  palm(x,z,scale=1,angle=0){
    const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);g.rotation.y=angle;this.static.add(g);
    const trunk=this.cylinder(.5,2.7,0,.23,.4,5.4,0x997658,7,g);trunk.rotation.z=-.15;
    for(let i=0;i<7;i++){
      const a=i/7*Math.PI*2,leaf=new THREE.Group();leaf.position.set(.9,5.3,0);leaf.rotation.y=a;g.add(leaf);
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1.7,.5,-.65,3.8,-.8,0,0,0,0,3.8,-.8,0,1.7,.5,.65],3));geo.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,0,1,1,1,0,0,1,1,1,0],2));geo.computeVertexNormals();const mat=this.mat(i%2?0x588851:0x799851);mat.side=THREE.DoubleSide;this.mesh(geo,mat,0,0,0,leaf);
      this.cylinder(.8,5.1,.1,.25,.25,.35,0x735635,6,g);
    }
  }
  rock(x,z,s,color=C.cliff){const rock=this.mesh(new THREE.DodecahedronGeometry(s,1),color,x,-.6+s*.36,z);rock.scale.set(1,.65,.85);rock.rotation.set(.2,x*.7,.15);}
  buildScenery(){
    // Populate the full coastal route at car scale, instead of stretching old props.
    const count=Math.ceil(TRACK_LENGTH/24);
    for(let i=0;i<count;i++){
      if(LANDMARKS.some(l=>Math.abs(((i/count-l.fraction+.5)%1+1)%1-.5)*TRACK_LENGTH<45))continue;
      const p=trackAt(i/count),inside=-(25+(i%3)*5),x=p.x+p.nx*inside,z=p.z+p.nz*inside;
      if(nearestTrack(x,z).distance<19)continue;
      this.cylinder(x,-2,z,6,7,3.5,C.cliff,12);
      this.palm(x,z,.85+(i%4)*.13,p.angle);
      for(let j=0;j<3;j++)this.rock(p.x+p.nx*(p.halfWidth+3+j*.8)+Math.cos(p.angle)*j*3,p.z+p.nz*(p.halfWidth+3+j*.8)+Math.sin(p.angle)*j*3,1.3+(i+j)%3*.6);
      const grass=this.mesh(new THREE.CircleGeometry(6,12),i%2?0x89956a:0x95a076,x,-.18,z);grass.rotation.x=-Math.PI/2;
      if(i%4===0&&nearestTrack(x-p.nx*7,z-p.nz*7).distance>20){
        this.cylinder(x-p.nx*7,-2,z-p.nz*7,10,11,3.5,C.cliff,12);
        const g=new THREE.Group();g.position.set(x-p.nx*7,0,z-p.nz*7);g.rotation.y=-p.angle;this.static.add(g);
        this.box(0,1.7,0,8,3.4,6,C.cream,g);this.box(0,3.6,0,9,.4,7,i%8?C.coral:C.teal,g);
        this.box(0,1.8,3.05,5.6,1.6,.1,0x2c6272,g);
        for(let j=-2;j<=2;j++)this.box(j*1.1,1.8,3.12,.1,1.7,.15,C.cream,g);
        this.box(0,.1,5,12,.2,3,0xa38d68,g);
        for(let j=-1;j<=1;j++){this.cylinder(j*3,1.35,5,.08,.08,2.7,C.cream,6,g);this.mesh(new THREE.ConeGeometry(1.4,.55,8),i%8?C.cream:C.coral,j*3,2.7,5,g);}
      }
      if(i%7===0){
        const poleX=p.x-p.nx*(p.halfWidth+3),poleZ=p.z-p.nz*(p.halfWidth+3);
        this.cylinder(poleX,3,poleZ,.11,.13,6,C.navy,6);const flag=this.box(poleX+.7,5.5,poleZ,1.5,1.1,.04,C.lime);flag.rotation.y=-p.angle;
      }
      if(i%9===0&&nearestTrack(x-p.nx*10,z-p.nz*10).distance>20){this.cylinder(x-p.nx*10+4,-2,z-p.nz*10,11,12,3.5,C.cliff,12);const g=new THREE.Group();g.position.set(x-p.nx*10,0,z-p.nz*10);g.rotation.y=-p.angle;this.static.add(g);
        for(let j=0;j<3;j++){this.box(j*4,1.4,0,3.5,2.8,8,[C.coral,C.teal,0xd2b46e][j],g);for(let k=0;k<10;k++)this.box(j*4,1.4,-3.6+k*.8,3.6,.08,.1,C.navy,g);}
      }
      if(i%6===0){
        const boat=new THREE.Group();boat.position.set(p.x+p.nx*25,-1.8,p.z+p.nz*25);boat.rotation.y=-p.angle;this.static.add(boat);
        const hull=this.mesh(new THREE.SphereGeometry(1,10,6),C.cream,0,.2,0,boat);hull.scale.set(1,.5,2.4);this.cylinder(0,2,0,.06,.08,4.5,0xceb787,6,boat);
        const sail=new THREE.BufferGeometry();sail.setAttribute('position',new THREE.Float32BufferAttribute([0,4.3,0,0,.7,0,0,.7,2],3));sail.computeVertexNormals();const mat=this.mat(C.cream);mat.side=THREE.DoubleSide;this.mesh(sail,mat,0,0,0,boat);
      }
    }
  }
  mergeStatic(){
    this.static.updateMatrixWorld(true);const groups=new Map();
    this.static.traverse(obj=>{if(!obj.isMesh)return;let geo=obj.geometry.clone().applyMatrix4(obj.matrixWorld);if(geo.index)geo=geo.toNonIndexed();if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));for(const key of Object.keys(geo.attributes))if(!['position','normal','uv'].includes(key))geo.deleteAttribute(key);
      geo.computeBoundingBox();const center=geo.boundingBox.getCenter(new THREE.Vector3());const key=`${obj.material.uuid}:${Math.floor(center.x/70)}:${Math.floor(center.z/70)}`;
      if(!groups.has(key))groups.set(key,{material:obj.material,geos:[]});groups.get(key).geos.push(geo);
    });
    this.scene.remove(this.static);this.static.traverse(o=>{if(o.isMesh)o.geometry.dispose();});
    for(const {material,geos}of groups.values()){const mesh=new THREE.Mesh(mergeGeometries(geos),material);mesh.castShadow=true;mesh.receiveShadow=true;this.scene.add(mesh);for(const geo of geos)geo.dispose();}
  }
  buildWater(){
    this.waterMaterial=new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:`varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vPos;uniform float time;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    void main(){vec2 p=vPos.xy;float n=noise(p*.1+time*.035)*.55+noise(p*.4-time*.05)*.3+noise(p*1.2+time*.08)*.15;float wave=sin(p.x*.7+p.y*.5+time*.8+n*4.)*sin(p.x*.3-p.y*.9+time*.5);float glint=pow(max(0.,wave),18.)*.11;vec3 col=mix(vec3(.075,.145,.18),vec3(.17,.265,.29),n);col+=glint;gl_FragColor=vec4(col,1.);}`});
    const water=new THREE.Mesh(new THREE.PlaneGeometry(5000,5000),this.waterMaterial);water.rotation.x=-Math.PI/2;water.position.y=-2.1;this.scene.add(water);
    const foam=new THREE.MeshBasicMaterial({color:0xb7ced0,map:this.texture('asphalt'),transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide});for(const side of [-1,1])this.scene.add(this.ribbon(p=>side*(p.halfWidth+.95),.7,-2.05,foam));
  }
  setPickupModel(g,kind){
    if(g.userData.kind===kind)return;if(g.userData.model)g.remove(g.userData.model);
    const model=createPickupModel(kind);g.add(model);g.userData.model=model;g.userData.kind=kind;
    g.userData.halo.material.color.setHex(PICKUP_COLORS[kind]);g.userData.ring.material.color.setHex(PICKUP_COLORS[kind]);g.userData.beacon.material.color.setHex(PICKUP_COLORS[kind]);
  }
  buildPickups(){
    for(const [i,p]of PICKUP_LOCATIONS.entries()){
      const g=new THREE.Group();g.position.set(p.x,1.9,p.z);
      const halo=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshBasicMaterial({map:this.texture('glow'),color:0xffffff,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));halo.rotation.x=-Math.PI/2;g.add(halo);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(1.85,.13,6,32),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1,toneMapped:false}));ring.rotation.x=-Math.PI/2;g.add(ring);
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
  followFrame(frame,dt){
    if(!this.follow)this.follow={...frame};
    const t=1-Math.exp(-dt*12),f=this.follow;
    f.x+=(frame.x-f.x)*t;f.z+=(frame.z-f.z)*t;f.angle+=angleDelta(frame.angle,f.angle)*t;
    // Grow immediately to keep both ends in frame; ease inward when the route bends.
    f.halfWidth=Math.max(frame.halfWidth,f.halfWidth+(frame.halfWidth-f.halfWidth)*t);
    f.halfHeight=Math.max(frame.halfHeight,f.halfHeight+(frame.halfHeight-f.halfHeight)*t);
    const aspect=this.container.clientWidth/Math.max(1,this.container.clientHeight);
    const halfW=Math.max(f.halfWidth,f.halfHeight*aspect),halfH=halfW/aspect;
    this.camera.left=-halfW;this.camera.right=halfW;this.camera.top=halfH;this.camera.bottom=-halfH;this.camera.updateProjectionMatrix();
    const nx=-Math.sin(f.angle),nz=Math.cos(f.angle);
    this.camera.position.set(f.x+nx*60,90,f.z+nz*60);this.camera.lookAt(f.x,0,f.z);
    this.sun.position.set(f.x-45,75,f.z-38);this.sun.target.position.set(f.x,0,f.z);this.sun.target.updateMatrixWorld();
  }
  createCar(color){
    const g=new THREE.Group(),paint=new THREE.MeshStandardMaterial({color,metalness:.25,roughness:.46});
    const body=(x,y,z,w,h,d,material)=>this.mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(.1,h*.22)),material,x,y,z,g);
    body(0,.57,0,3.5,.68,1.85,paint);body(.35,.86,0,2.15,.22,1.7,paint);
    const cabin=body(-.45,1.12,0,1.55,.65,1.5,this.mat(0x19303d,.22,.25));cabin.rotation.z=-.06;
    body(-.48,1.47,0,.95,.08,1.45,paint);
    this.box(1.05,.94,0,1.0,.035,.24,0xf2edd8,g);this.box(-1.35,.94,0,.6,.03,.24,0xf2edd8,g);this.box(-.5,1.52,0,.9,.02,.22,0xf2edd8,g);
    this.box(-1.55,1.14,0,.22,.15,2.15,0x19303a,g);this.box(-1.55,.96,-.65,.12,.35,.1,0x19303a,g);this.box(-1.55,.96,.65,.12,.35,.1,0x19303a,g);
    this.box(1.76,.57,0,.08,.26,1.5,0x203039,g);this.box(-1.76,.49,0,.08,.2,1.5,0x203039,g);
    const lights=new THREE.MeshStandardMaterial({color:0xfff3c5,emissive:0xffe2a1,emissiveIntensity:1.6});
    for(const side of [-1,1]){this.box(1.8,.78,side*.59,.06,.19,.38,lights,g);this.box(-1.8,.75,side*.62,.06,.17,.32,0xf5463b,g);for(const x of [-1.07,1.04]){const tyre=this.cylinder(x,.39,side*.98,.43,.43,.28,0x152328,10,g);tyre.rotation.x=Math.PI/2;const hub=this.cylinder(x,.39,side*1.135,.22,.22,.018,0x96a6a6,8,g);hub.rotation.x=Math.PI/2;}}
    // Per-car geometry batching keeps the six-player scene affordable on phones.
    g.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(g),size=bounds.getSize(new THREE.Vector3()),centre=bounds.getCenter(new THREE.Vector3());const fit=new THREE.Matrix4().makeScale(CAR_LENGTH/size.x,.64,CAR_WIDTH/size.z).multiply(new THREE.Matrix4().makeTranslation(-centre.x,0,-centre.z));const groups=new Map();g.traverse(o=>{if(o.isMesh){let geo=o.geometry.clone().applyMatrix4(o.matrixWorld);if(geo.index)geo=geo.toNonIndexed();const arr=groups.get(o.material)||[];arr.push(geo);groups.set(o.material,arr);}});g.clear();
    for(const [m,geos]of groups){const mesh=new THREE.Mesh(mergeGeometries(geos),m);mesh.castShadow=true;mesh.receiveShadow=true;mesh.geometry.applyMatrix4(fit);g.add(mesh);geos.forEach(geo=>geo.dispose());}
    const shield=new THREE.Mesh(new THREE.SphereGeometry(3.2,20,12),new THREE.MeshPhysicalMaterial({color:0x5acfff,emissive:0x237cbd,emissiveIntensity:.5,transparent:true,opacity:.2,roughness:.18,metalness:.1,depthWrite:false}));shield.position.y=.7;shield.scale.y=.65;shield.visible=false;g.add(shield);g.userData={shield,paint,baseColor:new THREE.Color(color),chassisSize:{length:CAR_LENGTH,width:CAR_WIDTH}};g.rotation.order='YXZ';
    const flame=this.createFlame();g.add(flame);g.userData.flame=flame;
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
    const sync=(map,list,create,move)=>{const ids=new Set();for(const item of list){ids.add(item.id);let g=map.get(item.id);if(!g){g=create(item);map.set(item.id,g);this.scene.add(g);}move(g,item);}for(const[id,g]of map)if(!ids.has(id)){this.scene.remove(g);g.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(o.userData.ownedMaterial)o.material.dispose();}});map.delete(id);}};
    sync(this.rockets,state?.projectiles||[],r=>{const g=new THREE.Group();const mesh=new THREE.Mesh(r.kind==='plasma'?new THREE.IcosahedronGeometry(.65,1):new THREE.ConeGeometry(r.kind==='rocket'?.32:.08,r.kind==='rocket'?1.8:1.5,7),new THREE.MeshBasicMaterial({color:r.kind==='plasma'?0x7feaff:0xffc257}));mesh.rotation.z=-Math.PI/2;mesh.userData.ownedMaterial=true;g.add(mesh);return g;},(g,r)=>{g.position.set(r.x,r.y||.7,r.z);g.rotation.y=-r.angle;if(r.kind==='rocket'&&this.emitParticles)this.particle(r.x,.8,r.z,'smoke');});
    sync(this.mines,state?.mines||[],()=>{const g=new THREE.Group();this.cylinder(0,.2,0,.7,.9,.35,0x243541,10,g);this.mesh(new THREE.SphereGeometry(.22,6,4),new THREE.MeshBasicMaterial({color:0xff5446}),0,.5,0,g).userData.ownedMaterial=true;return g;},(g,m)=>{g.position.set(m.x,0,m.z);g.children[1].visible=Math.sin(now*.012)>-.2;});
    sync(this.chains,state?.chains||[],()=>{const g=new THREE.Group();const ball=this.mesh(new THREE.IcosahedronGeometry(.95,1),0x4b5258,0,0,0,g);for(let i=0;i<8;i++)this.mesh(new THREE.TorusGeometry(.22,.07,4,6),0xa4a9ad,0,0,0,g);return g;},(g,b)=>{g.children[0].position.set(b.x,.75,b.z);g.children[0].rotation.z=now*.002;for(let i=1;i<9;i++){const t=i/9;g.children[i].position.set(b.x+((b.anchorX??b.x)-b.x)*t,.4,b.z+((b.anchorZ??b.z)-b.z)*t);g.children[i].rotation.set(i%2*Math.PI/2,-Math.atan2((b.anchorZ??b.z)-b.z,(b.anchorX??b.x)-b.x),0);}});
    for(const e of state?.effects||[])if(!this.seenEffects.has(e.id)){
      this.seenEffects.add(e.id);const duration=e.duration||500;let mesh;const beam=e.toX!==undefined;
      if(beam){const length=Math.hypot(e.toX-e.x,e.toZ-e.z);mesh=new THREE.Mesh(new THREE.BoxGeometry(length,e.kind==='rail'?.18:.09,e.kind==='rail'?.4:.12),new THREE.MeshBasicMaterial({color:e.color,transparent:true,opacity:1,depthWrite:false}));mesh.position.set((e.x+e.toX)/2,.85,(e.z+e.toZ)/2);mesh.rotation.y=-Math.atan2(e.toZ-e.z,e.toX-e.x);}
      else{mesh=new THREE.Mesh(new THREE.RingGeometry(.8,1,40),new THREE.MeshBasicMaterial({color:e.color,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(e.x,.3,e.z);}
      this.scene.add(mesh);this.effects.set(e.id,{mesh,until:now+Math.min(duration,Math.max(50,e.until-state.time)),duration,max:e.radius||5,beam,kind:e.kind});
      if(e.kind==='explosion')for(let i=0;i<35;i++)this.particle(e.x,.7,e.z,i%3?'fire':'smoke',(Math.random()-.5)*14,(Math.random()-.5)*14);
    }
    if(this.seenEffects.size>3000)this.seenEffects=new Set([...this.seenEffects].slice(-1500));
    for(const[id,e]of this.effects){const t=1-(e.until-now)/e.duration;if(t>=1){this.scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();this.effects.delete(id);}else{if(!e.beam)e.mesh.scale.setScalar(1+t*e.max);else if(e.kind==='rail'){e.mesh.scale.z=1+t*5;e.mesh.position.y+=dt*.4;e.mesh.material.color.lerp(new THREE.Color(0x82979e),dt*3);}e.mesh.material.opacity=(1-t)*.85;}}
  }
  resetRound(){
    this.follow=null;this.cameraMode=null;this.particles=[];
    for(const g of this.cars.values())g.userData.snap=true;
    for(const t of this.trails){this.scene.remove(t.mesh);t.mesh.geometry.dispose();t.mesh.material.dispose();}this.trails=[];
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(w&&h)this.renderer.setSize(w,h,false);}
  update(state,localId,localCar,dt,now){
    this.waterMaterial.uniforms.time.value=now/1000;if(this.flameMaterial)this.flameMaterial.uniforms.time.value=now/1000;this.frame++;this.particleClock+=dt;this.emitParticles=this.particleClock>=1/30;if(this.emitParticles)this.particleClock%=1/30;
    const previewProgress=START_FRACTION+((now/1000*22)%TRACK_LENGTH)/TRACK_LENGTH;
    const previewChase=createChase([{progress:previewProgress-START_FRACTION}]);
    const mode=state?`${state.code}:${state.round||1}`:'preview';if(this.cameraMode!==mode){this.follow=null;this.cameraMode=mode;this.seenEffects.clear();}
    this.followFrame(state?.camera||cameraFrame(previewChase),dt);
    this.deadline.visible=!!state&&state.phase!=='lobby';
    if(state?.chase){const d=state.chase;this.deadline.position.set(d.x,0,d.z);this.deadline.rotation.y=-d.angle;this.deadline.scale.z=((d.halfWidth||6)*2+2)/(ROAD_WIDTH+2);}
    const inRoom=!!state;this.previewCars.forEach((g,i)=>{g.visible=!inRoom;if(!inRoom){const p=trackAt(previewProgress-i*5/TRACK_LENGTH);g.position.set(p.x,0,p.z);g.rotation.y=-p.angle;}});
    const present=new Set();
    if(state)for(const p of state.players){present.add(p.id);let g=this.cars.get(p.id);if(!g){g=this.createCar(p.color);this.scene.add(g);this.cars.set(p.id,g);g.position.set(p.x,0,p.z);g.rotation.y=-p.angle;}
      const car=p.id===localId&&localCar&&!p.wrecked?localCar:p;const a=g.userData.snap?1:1-Math.exp(-dt*18);g.userData.snap=false;
      g.position.x+=(car.x-g.position.x)*a;g.position.z+=(car.z-g.position.z)*a;g.rotation.y+=angleDelta(-car.angle,g.rotation.y)*a;
      g.position.y=(car.y||0)+(1-Math.cos(car.roll||0)*Math.cos(car.pitch||0))*.5;g.rotation.x=car.roll||0;g.rotation.z=car.pitch||0;g.visible=(!p.eliminated||p.wrecked)&&g.position.y>-15;
      g.userData.flame.visible=p.firing==='flame'&&!p.eliminated;
      g.userData.shield.visible=p.shield>0&&!p.eliminated;g.userData.shield.material.opacity=.16+Math.sin(now*.006)*.04;
      g.userData.paint.color.copy(g.userData.baseColor).multiplyScalar(p.wrecked?.22:1-(100-(p.health??100))*.004);
      if(g.visible&&this.emitParticles){const level=damageLevel(p.health??100),fx=Math.cos(car.angle),fz=Math.sin(car.angle);if(level>0){for(let j=0;j<level;j++)this.particle(car.x+fx*1.2,g.position.y+.9,car.z+fz*1.2,'smoke',-car.vx*.12,-car.vz*.12);if(level>=3)for(let j=0;j<level-1;j++)this.particle(car.x+fx*1.2+(Math.random()-.5),g.position.y+.7,car.z+fz*1.2+(Math.random()-.5),'fire');}
        if(p.firing==='flame')for(let j=0;j<10;j++){const d=CAR_LENGTH/2+Math.random()*7.5,spread=(Math.random()-.5)*d*.22;this.particle(car.x+fx*d-fz*spread,g.position.y+.65,car.z+fz*d+fx*spread,'fire',fx*4,fz*4);}
      }
      if(!p.eliminated&&state.phase==='racing'&&this.frame%4===0&&Math.hypot(car.vx,car.vz)>9){const side=-car.vx*Math.sin(car.angle)+car.vz*Math.cos(car.angle);if(Math.abs(side)>2||car.boost>0)this.addTrail(car,car.boost>0?p.color:0x293c3c);}
    }
    for(const [id,g]of this.cars)if(!present.has(id)){this.scene.remove(g);g.traverse(o=>{if(o.isMesh)o.geometry.dispose();});this.cars.delete(id);}
    // Smoothing must never draw two solid chassis inside one another.
    const visibleCars=[...this.cars].filter(([id,g])=>g.visible).map(([id,g])=>{const p=state?.players.find(p=>p.id===id);return {...p,x:g.position.x,z:g.position.z,angle:-g.rotation.y,y:g.position.y,vx:0,vz:0,yawVelocity:0};});
    collideCars(visibleCars,{damage:false});for(const car of visibleCars){const g=this.cars.get(car.id);g.position.x=car.x;g.position.z=car.z;}
    this.boxes.forEach((g,i)=>{const pickup=state?.pickups[i];g.visible=!state||pickup?.readyAt<=state.time;this.setPickupModel(g,pickup?.item||WEAPON_IDS[i%WEAPON_IDS.length]);g.userData.model.rotation.y=now*.00045+i;g.position.y=1.9+Math.sin(now*.0017+i)*.18;g.userData.halo.position.y=.08-g.position.y;g.userData.ring.position.y=.13-g.position.y;});
    this.combatObjects(state,dt,now);animateLandmarks(this,now);this.updateParticles(dt);
    for(let i=this.trails.length-1;i>=0;i--){const t=this.trails[i];t.life-=dt;t.mesh.material.opacity=Math.min(.3,t.life*.15);if(t.life<=0){this.scene.remove(t.mesh);t.mesh.geometry.dispose();t.mesh.material.dispose();this.trails.splice(i,1);}}
    this.renderer.render(this.scene,this.camera);
  }
  addTrail(car,color){if(this.trails.length>120)return;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.65,.4),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.3,depthWrite:false}));mesh.rotation.set(-Math.PI/2,0,-car.angle);mesh.position.set(car.x-Math.cos(car.angle)*1.25,.09,car.z-Math.sin(car.angle)*1.25);this.scene.add(mesh);this.trails.push({mesh,life:2});}
  screenPosition(id){const g=this.cars.get(id);if(!g)return null;const p=g.position.clone();p.y+=3.3;p.project(this.camera);const r=this.container.getBoundingClientRect();return {x:r.left+(p.x+1)/2*r.width,y:r.top+(1-p.y)/2*r.height};}
}
