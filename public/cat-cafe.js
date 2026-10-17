import * as THREE from 'three';
import {ARENA_PLATFORMS,ARENA_RAMPS,ARENA_PROPS} from '/shared/arena.js';
export function buildCatCafe(world){
  const group=new THREE.Group();world.static.add(group);
  const materials=new Map();const mat=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.72}));return materials.get(color);};
  function mesh(geometry,color,x,y,z,parent=group){const m=new THREE.Mesh(geometry,mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  const box=(x,y,z,w,h,d,color)=>mesh(new THREE.BoxGeometry(w,h,d),color,x,y,z);
  box(0,-.6,0,160,1.2,160,0xb98861);
  for(let i=-80;i<=80;i+=10){box(i,.008,0,.12,.02,160,0x916445);for(let j=-75;j<80;j+=20)box(i+5,.01,j,10,.02,.1,0x916445);}
  for(const side of [-1,1]){box(side*80,8,0,2,16,162,0xe8d6be);box(0,8,side*80,160,16,2,0xe8d6be);box(side*79,1,0,.2,2,160,0x658e82);box(0,1,side*79,160,2,.2,0x658e82);}
  // Window panels and warm café wall trim.
  for(const x of [-60,-30,0,30,60]){box(x,10,-78.8,20,8,.25,0x83b9c0);box(x,10,-78.5,.4,8,.3,0xffedcf);box(x,10,-78.5,20,.4,.3,0xffedcf);}
  for(const p of ARENA_PLATFORMS){box(p.x,p.h/2,p.z,p.w,p.h,p.d,p.color);box(p.x,p.h+.08,p.z,p.w,.16,p.d,0xf3ddba);}
  for(const r of ARENA_RAMPS){
    const low=r.base+r.rise*(.5-r.sign/2),high=r.base+r.rise*(.5+r.sign/2),vertices=[r.x-r.w/2,low,r.z-r.d/2,r.x-r.w/2,high,r.z+r.d/2,r.x+r.w/2,low,r.z-r.d/2,r.x+r.w/2,low,r.z-r.d/2,r.x-r.w/2,high,r.z+r.d/2,r.x+r.w/2,high,r.z+r.d/2];
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();mesh(geo,0xcda172,0,.04,0).material.side=THREE.DoubleSide;
    for(let i=1;i<12;i++){const t=i/12;box(r.x,r.base+r.rise*(r.sign>0?t:1-t)+.08,r.z-r.d/2+t*r.d,r.w,.12,.18,0x87654a);}
  }
  for(const p of ARENA_PROPS){
    if(p.kind==='coffee'){
      mesh(new THREE.CylinderGeometry(5,4,11,28),p.color,p.x,5.5,p.z);mesh(new THREE.CylinderGeometry(4.6,4.6,.3,28),0x4e2c20,p.x,11.1,p.z);
      const handle=mesh(new THREE.TorusGeometry(2.6,.8,8,20),p.color,p.x+4.6,6,p.z);handle.rotation.y=Math.PI/2;
      mesh(new THREE.CylinderGeometry(6.4,6.4,.45,32),p.color,p.x,.3,p.z);
    }else if(p.kind==='cat'){
      const body=mesh(new THREE.SphereGeometry(1,20,12),p.color,p.x,3,p.z);body.scale.set(7.5,3,4.5);
      const head=mesh(new THREE.SphereGeometry(3.6,20,16),p.color,p.x+4,4,p.z);
      for(const side of [-1,1]){const ear=mesh(new THREE.ConeGeometry(1.6,3,3),p.color,p.x+4,7,p.z+side*2);ear.rotation.x=side*.2;
        mesh(new THREE.SphereGeometry(.25,10,8),0x25332e,p.x+7,4.8,p.z+side*1.3);
        box(p.x+6.9,4,p.z+side*2,.15,.12,2,0xf3e1d5);
      }
      mesh(new THREE.SphereGeometry(.4,10,8),0xe9aaa8,p.x+7.5,4,p.z);
      const tail=mesh(new THREE.TorusGeometry(3,.8,8,20,Math.PI*1.5),p.color,p.x-6,3,p.z+2);tail.rotation.x=Math.PI/2;
    }else{box(p.x,p.h/2,p.z,p.w,p.h,p.d,p.color);box(p.x,p.h+.05,p.z,4,.15,4,0xf3dcaa);}
  }
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#365c50';ctx.fillRect(0,0,1024,256);ctx.fillStyle='#ffead1';ctx.font='bold 100px sans-serif';ctx.textAlign='center';ctx.fillText('CAT CAFÉ CLASH',512,135);ctx.font='36px sans-serif';ctx.fillText('COFFEE · CATS · CHAOS',512,205);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(45,11.25),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas)}));sign.position.set(0,13,78.8);sign.rotation.y=Math.PI;group.add(sign);
  return group;
}
