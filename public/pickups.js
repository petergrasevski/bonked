import * as THREE from 'three';
import {WEAPON_IDS} from '../shared/combat.js';
export const PICKUP_COLORS={pulse:0xc329ff,rocket:0xff1834,machinegun:0xffdb00,shield:0x00cfff,railgun:0x3262ff,mine:0x8aff00,chain:0xfaf4dc,flame:0xff7200,plasma:0x00ed8a,shotgun:0xff36b5};
const cache=new Map();
// Models share immutable geometry/materials across all pickups on the course.
export function createPickupModel(kind){
  if(!WEAPON_IDS.includes(kind))throw Error(`Unknown pickup: ${kind}`);
  if(cache.has(kind))return cache.get(kind).clone(true);
  const g=new THREE.Group(),color=PICKUP_COLORS[kind];g.name=`pickup-${kind}`;
  const metal=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.35,roughness:.42,metalness:.3});
  const dark=new THREE.MeshStandardMaterial({color:new THREE.Color(color).multiplyScalar(.35),roughness:.5,metalness:.3});
  const accent=new THREE.MeshStandardMaterial({color:new THREE.Color(color).multiplyScalar(.3),roughness:.5,metalness:.05,emissive:color,emissiveIntensity:.6,toneMapped:false});
  const glow=new THREE.MeshBasicMaterial({color,toneMapped:false});
  const brass=new THREE.MeshStandardMaterial({color:0xcaa259,metalness:.55,roughness:.4});
  const add=(geo,mat,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;};
  const box=(x,y,z,w,h,d,mat=dark)=>add(new THREE.BoxGeometry(w,h,d),mat,x,y,z);
  const tube=(x,y,z,r,length,mat=metal)=>{const m=add(new THREE.CylinderGeometry(r,r,length,12),mat,x,y,z);m.rotation.z=Math.PI/2;return m;};
  const ring=(x,y,z,r,mat=accent)=>{const m=add(new THREE.TorusGeometry(r,.08,6,20),mat,x,y,z);m.rotation.y=Math.PI/2;return m;};
  const sphere=(x,y,z,r,mat=glow)=>add(new THREE.SphereGeometry(r,14,10),mat,x,y,z);
  if(kind==='rocket'){
    tube(0,0,0,.32,1.9);const nose=add(new THREE.ConeGeometry(.33,.75,14),accent,1.28,0,0);nose.rotation.z=-Math.PI/2;
    tube(-1.05,0,0,.23,.35,dark);tube(.5,0,0,.335,.16,accent);
    for(let i=0;i<4;i++){const fin=box(-.75,0,0,.7,.07,1.15,accent);fin.rotation.x=i*Math.PI/2;}
  }else if(kind==='pulse'){
    sphere(0,0,0,.55,accent);for(let i=0;i<3;i++){const r=ring(0,0,0,.9,metal);r.rotation.set(i*Math.PI/3,.6+i*.8,.5);}
    for(const x of [-1,1])sphere(x,0,0,.17);box(0,-.65,0,1,.2,.75,metal);
  }else if(kind==='shield'){
    const shape=new THREE.Shape();shape.moveTo(-.8,.8);shape.lineTo(.8,.8);shape.lineTo(.7,-.35);shape.lineTo(0,-1);shape.lineTo(-.7,-.35);shape.closePath();
    const plate=add(new THREE.ExtrudeGeometry(shape,{depth:.2,bevelEnabled:true,bevelSize:.07,bevelThickness:.07,bevelSegments:2,steps:1}),accent);plate.position.z=-.1;
    box(0,.05,.19,.16,1.1,.08,metal);box(0,.3,.19,1,.16,.08,metal);
    const bubble=sphere(0,0,0,1.2,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.13,depthWrite:false}));bubble.castShadow=false;
  }else if(kind==='mine'){
    add(new THREE.CylinderGeometry(.8,1,.35,16),dark);add(new THREE.CylinderGeometry(.6,.75,.22,16),accent,0,.24,0);sphere(0,.47,0,.18,new THREE.MeshBasicMaterial({color:0xff4633}));
    for(let i=0;i<8;i++){const a=i*Math.PI/4;const spike=add(new THREE.ConeGeometry(.12,.42,6),metal,Math.cos(a)*.8,.15,Math.sin(a)*.8);spike.rotation.z=-Math.cos(a)*.8;spike.rotation.x=Math.sin(a)*.8;}
  }else if(kind==='chain'){
    sphere(.6,-.2,0,.65,metal);for(let i=0;i<8;i++){const a=i*Math.PI/4;const spike=add(new THREE.ConeGeometry(.13,.4,6),dark,.6+Math.cos(a)*.64,-.2+Math.sin(a)*.64,0);spike.rotation.z=a-Math.PI/2;}
    for(let i=0;i<6;i++){const link=add(new THREE.TorusGeometry(.15,.045,5,10),metal,-.15-i*.21,.05+i*.15,0);link.rotation.y=i%2*Math.PI/2;}
    box(-1.4,.94,0,.25,.4,.3,accent);
  }else{
    // Distinct silhouettes, not a generic crate or icon pretending to be a model.
    box(-.25,0,0,1.25,.48,.52);box(-.8,-.32,0,.3,.55,.35);box(-1.25,0,0,.65,.32,.44,kind==='shotgun'?brass:accent);
    if(kind==='machinegun'){
      tube(.9,.05,0,.14,1.3,dark);tube(1.62,.05,0,.22,.22,metal);box(-.15,-.5,0,.45,.7,.28,metal);box(-.2,.34,0,.7,.12,.25,accent);
      for(let i=0;i<5;i++)tube(-.55+i*.22,.08,.38,.08,.28,brass);
    }else if(kind==='shotgun'){
      for(const z of [-.17,.17]){tube(.82,.07,z,.135,1.6,metal);tube(1.63,.07,z,.11,.045,dark);}box(.35,-.18,0,.65,.22,.5,brass);
    }else if(kind==='railgun'){
      for(const z of [-.3,.3]){box(.85,.08,z,1.9,.17,.18,metal);box(.85,.19,z,1.7,.045,.08,glow);}
      for(let i=0;i<4;i++)ring(i*.3-.1,0,0,.4);sphere(-.65,.02,0,.24);
    }else if(kind==='flame'){
      tube(.9,.04,0,.22,1.4,dark);tube(1.62,.04,0,.3,.2,metal);
      for(const z of [-.4,.4]){const tank=add(new THREE.CapsuleGeometry(.23,.7,3,10),accent,-.65,.05,z);tank.rotation.z=Math.PI/2;}
      const flame=add(new THREE.ConeGeometry(.2,.6,10),glow,2,.04,0);flame.rotation.z=-Math.PI/2;
    }else if(kind==='plasma'){
      sphere(.4,.08,0,.5,accent);ring(.4,.08,0,.61,metal);tube(1.06,.08,0,.3,.65,dark);ring(1.43,.08,0,.32,glow);box(-.5,.35,0,.55,.16,.35,glow);
    }
  }
  // A readable silhouette at phone scale, with the long axis used by the guns.
  const bounds=new THREE.Box3().setFromObject(g),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  for(const child of g.children)child.position.sub(center);
  g.scale.setScalar(3.3/Math.max(size.x,size.y,size.z));g.userData.kind=kind;
  cache.set(kind,g);return g.clone(true);
}
