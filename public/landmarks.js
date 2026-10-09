import * as THREE from 'three';
import {trackAt,nearestTrack,TRACK_LENGTH,angleDelta,hasBarrier} from '/shared/game.js';
export const LANDMARKS=[
  {kind:'island',name:'Palm Island',fraction:.025},
  {kind:'volcano',name:'Ember Caldera',fraction:.15},
  {kind:'geyser',name:'Geyser Springs',fraction:.275},
  {kind:'harbour',name:'Cargo Harbour',fraction:.40},
  {kind:'ruins',name:'Sunken Temple',fraction:.525},
  {kind:'waterfall',name:'Twin Falls',fraction:.65},
  {kind:'lighthouse',name:'Beacon Point',fraction:.775},
  {kind:'shipwreck',name:'Wreck Bay',fraction:.90},
];
export function buildLandmarks(w){
  const animated=[];
  const glow=color=>new THREE.MeshBasicMaterial({color,toneMapped:false});
  for(const landmark of LANDMARKS){
    const p=trackAt(landmark.fraction),before=trackAt(landmark.fraction-.008),after=trackAt(landmark.fraction+.008);
    let side=1; // Camera is on the positive normal: tall landmarks remain in view.
    const radius=landmark.kind==='volcano'?17:landmark.kind==='waterfall'?13:landmark.kind==='harbour'?14:11;
    let x,z,best=null;
    // Keep large silhouettes beside the road, clear of every neighbouring bend.
    placement: for(const sign of [side,-side])for(let distance=p.halfWidth+radius+1.5;distance<65;distance+=3){
      const tx=p.x+p.nx*distance*sign,tz=p.z+p.nz*distance*sign,t=nearestTrack(tx,tz),clearance=t.distance-t.halfWidth;
      if(clearance>=radius+1){best={x:tx,z:tz,side:sign};break placement;}
    }
    if(!best)best={x:p.x+p.nx*(p.halfWidth+radius+5),z:p.z+p.nz*(p.halfWidth+radius+5),side:1};
    ({x,z,side}=best);const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=-p.angle;w.static.add(g);
    const box=(a,b,c,d,e,f,color)=>w.box(a,b,c,d,e,f,color,g);
    const cylinder=(a,b,c,r1,r2,h,color,n=16)=>w.cylinder(a,b,c,r1,r2,h,color,n,g);
    const mesh=(geo,color,a=0,b=0,c=0)=>w.mesh(geo,color,a,b,c,g);
    if(landmark.kind==='island'){
      // A continuous landmass under this guarded section: the road crosses its centre.
      for(let d=-68;d<=68;d+=9){const f=landmark.fraction+d/TRACK_LENGTH;if(!hasBarrier(f))continue;const q=trackAt(f),r=13+8*Math.cos(d/90);
        w.cylinder(q.x,-2,q.z,r,r+2,3.2,0x736957,20);w.cylinder(q.x,-.34,q.z,r-.6,r,.12,0x689454,20);
        for(const sign of [-1,1])if(Math.abs(d)%3===2){const offset=q.halfWidth+5;w.palm(q.x+q.nx*offset*sign,q.z+q.nz*offset*sign,1.45,q.angle);}
      }
      // Stone gateway makes the crossing recognizable from either direction.
      const gate=new THREE.Group();gate.position.set(p.x,0,p.z);gate.rotation.y=-p.angle;w.static.add(gate);
      for(const sign of [-1,1]){w.box(0,3,sign*(p.halfWidth+1.5),2,6,2,0xbca97d,gate);w.mesh(new THREE.ConeGeometry(2.2,2,4),0x657e4d,0,6.9,sign*(p.halfWidth+1.5),gate);}
      w.box(0,6,0,1.1,.8,(p.halfWidth+2)*2,0xbca97d,gate);
      continue;
    }
    cylinder(0,-2,0,radius,radius+2,3.4,0x625c51,20);
    if(landmark.kind==='volcano'){
      mesh(new THREE.CylinderGeometry(5.2,17,15.2,22,1,true),0x443f42,0,6.9,0);
      const rim=mesh(new THREE.TorusGeometry(5.1,.65,7,22),0x292a31,0,14.45,0);rim.rotation.x=-Math.PI/2;
      const lava=mesh(new THREE.CircleGeometry(4.65,24),glow(0xff5b13),0,14.42,0);lava.rotation.x=-Math.PI/2;
      const core=mesh(new THREE.CircleGeometry(2.8,20),glow(0xffbe22),0,14.44,0);core.rotation.x=-Math.PI/2;
      for(let i=0;i<7;i++){const a=i*Math.PI*2/7,start=new THREE.Vector3(Math.cos(a)*5.8,14,Math.sin(a)*5.8),end=new THREE.Vector3(Math.cos(a)*16.1,1.2,Math.sin(a)*16.1),mid=start.clone().add(end).multiplyScalar(.5),flow=mesh(new THREE.CylinderGeometry(.18,.32,start.distanceTo(end),6),glow(i%2?0xff7918:0xef3d0e),mid.x,mid.y,mid.z);flow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),start.clone().sub(end).normalize());}
      animated.push({kind:'volcano',x,z,y:15,phase:0,mesh:core});
    }else if(landmark.kind==='geyser'){
      cylinder(0,-.05,0,10.5,11,1,0xd7c499,24);
      const pool=mesh(new THREE.CircleGeometry(8.8,32),glow(0x3eafbc),0,.48,0);pool.rotation.x=-Math.PI/2;
      for(const r of [3,5.8,8.5]){const ring=mesh(new THREE.TorusGeometry(r,.35,6,32),0xbad8c7,0,.51,0);ring.rotation.x=-Math.PI/2;}
      cylinder(0,.8,0,1.7,2.6,1.5,0xe2d6b5);
      const jet=new THREE.Group();jet.position.set(x,1,z);w.scene.add(jet);
      for(let i=0;i<7;i++){const a=i*2.4,water=w.mesh(new THREE.CylinderGeometry(.22,.48,1,7),new THREE.MeshBasicMaterial({color:i%2?0xdbfaff:0x68dcec,transparent:true,opacity:.8}),Math.sin(a)*.55,0,Math.cos(a)*.55,jet);water.rotation.z=Math.sin(a)*.035;}
      animated.push({kind:'geyser',x,z,y:1,mesh:jet,phase:1});
    }else if(landmark.kind==='harbour'){
      box(0,.05,0,27,.65,22,0x998778);
      for(let row=0;row<2;row++)for(let i=0;i<3;i++){const color=[0x308d94,0xc25e39,0xdbba49][i];box((i-1)*6,1.5+row*2.8,3,5.5,2.7,10,color);for(let j=-4;j<=4;j++)box((i-1)*6,1.5+row*2.8,3+j,5.6,.07,.08,0x354650);}
      for(const a of [-8,8])box(a,8,-6,.9,16,.9,0xe5af31);box(0,16,-6,20,.9,1.4,0xe5af31);box(0,17,-6,.6,2.5,.6,0xe5af31);box(3,11,-6,.16,9,.16,0x27353b);box(3,6.5,-6,2,.4,2,0x27353b);
      for(let i=-10;i<=10;i+=4)cylinder(i,-.4,-11,.4,.5,3,0x4a4140);
    }else if(landmark.kind==='ruins'){
      cylinder(0,.4,0,10,11,1.2,0xb4ae87,8);box(0,1.1,0,15,.8,12,0xc4b88c);
      for(const a of [-5,0,5])for(const b of [-4,4]){cylinder(a,4.6,b,.75,.95,6.6,0xd7caa5,10);box(a,7.9,b,2.1,.6,2.1,0xcabc97);}
      box(0,8.45,-4,13,.65,2,0xcabc97);box(0,8.45,4,13,.65,2,0xcabc97);
      const roof=mesh(new THREE.ConeGeometry(8.7,3,4),0xbda77c,0,10,0);roof.rotation.y=Math.PI/4;roof.scale.z=.7;
      for(let i=0;i<4;i++){const ruin=cylinder(-6+i*3,1.6,8,.8,.8,4,0xcabc97,10);ruin.rotation.z=1.2;}
    }else if(landmark.kind==='waterfall'){
      for(const a of [-7,0,7]){const rock=mesh(new THREE.DodecahedronGeometry(7,1),0x7b8472,a,5,2);rock.scale.set(.75,1.5,.7);}
      box(0,12,2,21,.5,6,0x629361);
      const falls=new THREE.Group();falls.position.set(x,0,z);falls.rotation.y=-p.angle;w.scene.add(falls);
      const material=new THREE.MeshBasicMaterial({color:0x9fe5e9,transparent:true,opacity:.78,map:w.texture('asphalt')});material.map=material.map.clone();material.map.repeat.set(1,3);
      for(const a of [-5,5]){w.box(a,5.2,-1.8,3.5,13,.24,material,falls);const foam=w.mesh(new THREE.CircleGeometry(4.5,20),new THREE.MeshBasicMaterial({color:0xe6fbf1,transparent:true,opacity:.6}),a,-1.7,-2,falls);foam.rotation.x=-Math.PI/2;}
      animated.push({kind:'waterfall',mesh:falls,material});
    }else if(landmark.kind==='lighthouse'){
      cylinder(0,6,0,2.5,3.6,13,0xe8dfbd,18);for(const y of [3,7,11])cylinder(0,y,0,3.4-y*.07,3.5-y*.07,1.4,0xc65342,18);
      cylinder(0,13.2,0,3.8,3.8,.6,0x263944,18);cylinder(0,14.4,0,2.2,2.2,2,0x9ccbc9,16);mesh(new THREE.ConeGeometry(3.3,2,16),0xb94938,0,16,0);
      box(-6,1.3,3,5,2.6,6,0xe8dfbd);box(-6,2.9,3,6,.5,7,0xb94938);
      const beam=new THREE.Group();beam.position.set(x,14.3,z);w.scene.add(beam);
      const light=w.mesh(new THREE.ConeGeometry(5,30,16,1,true),new THREE.MeshBasicMaterial({color:0xffe5a0,transparent:true,opacity:.1,blending:THREE.AdditiveBlending,depthWrite:false}),15,0,0,beam);light.rotation.z=Math.PI/2;
      animated.push({kind:'lighthouse',mesh:beam});
    }else if(landmark.kind==='shipwreck'){
      const hull=mesh(new THREE.SphereGeometry(1,16,8),0x713d35,0,1,0);hull.scale.set(16,4,5);hull.rotation.z=.13;
      box(-1,4,0,22,.5,7,0x9c7454);box(-5,6.1,0,6,4,6,0xc5bba0);box(-5,8.4,0,7,.6,7,0x524b46);
      const mast=cylinder(4,9,0,.25,.4,15,0x544c43,8);mast.rotation.z=-.28;box(6,11,0,.2,.3,10,0x544c43);
      const sail=mesh(new THREE.PlaneGeometry(5,6),new THREE.MeshStandardMaterial({color:0xe0cda3,side:THREE.DoubleSide}),7,10,1);sail.rotation.y=.6;
      for(const a of [-13,13]){const rib=box(a,3.5,0,1.1,6,8,0x3a3333);rib.rotation.z=a>0?-.25:.3;}
    }
  }
  return animated;
}
export function animateLandmarks(w,now){
  for(const l of w.landmarks){
    if(l.kind==='lighthouse')l.mesh.rotation.y=now*.00035;
    if(l.kind==='waterfall')l.material.map.offset.y=-now*.00035;
    if(l.kind==='geyser'){
      const cycle=(now/1000+l.phase)%8,height=3+18*Math.pow(Math.max(0,Math.sin(cycle/8*Math.PI)),3);
      for(const [i,mesh]of l.mesh.children.entries()){const h=height*(.7+.3*Math.sin(now*.012+i)**2);mesh.scale.y=h;mesh.position.y=h/2;}
      if(w.emitParticles&&Math.hypot(w.camera.position.x-l.x,w.camera.position.z-l.z)<150)for(let i=0;i<2;i++)w.particle(l.x+(Math.random()-.5)*2,height,l.z+(Math.random()-.5)*2,'steam');
    }
    if(l.kind==='volcano'){l.mesh.scale.setScalar(.93+Math.sin(now*.004)*.07);if(w.emitParticles&&Math.hypot(w.camera.position.x-l.x,w.camera.position.z-l.z)<150){w.particle(l.x+(Math.random()-.5)*3,l.y,l.z+(Math.random()-.5)*3,'smoke');if(Math.random()<.3)w.particle(l.x,l.y,l.z,'fire',(Math.random()-.5)*3,(Math.random()-.5)*3);}}
  }
}
