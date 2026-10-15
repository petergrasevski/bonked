import * as THREE from 'three';
import {volcanoRecoveryBoundary,volcanoShrubStyle} from '../shared/volcano-boundary.js';

// Render-only volcanic scrub: irregular woody crowns, low spreading shrubs and
// upright spear-leaf clumps share a restrained, sun-dried palette.
export function buildVolcanoBoundaryBushes(w){
  const leaves=[0x687449,0x7f8052,0x535e40,0x8a7154,0x6d6650].map(c=>w.mat(c));
  const wood=w.mat(0x514135),tips=w.mat(0xb39a70),points=volcanoRecoveryBoundary();
  for(const [index,p]of points.entries()){
    const s=volcanoShrubStyle(index),g=new THREE.Group();g.position.set(p.x,p.y-.12,p.z);g.rotation.y=s.angle;w.static.add(g);
    const mesh=(geo,mat,x,y,z,sx,sy,sz)=>{const m=w.mesh(geo,mat,x,y,z,g);m.scale.set(sx,sy,sz);return m;};
    // Short branching stems remain visible through the broken canopy.
    for(let j=0;j<3;j++){const a=j*2.399+s.seed*6,m=mesh(new THREE.CylinderGeometry(.035,.065,1,4),wood,Math.cos(a)*.18,s.height*.3,Math.sin(a)*.18,1,s.height*.7,1);m.rotation.z=Math.cos(a)*.55;m.rotation.x=Math.sin(a)*.55;}
    if(s.kind===2){
      for(let j=0;j<9;j++){const a=j*2.399+s.seed*4,r=.15+(j%3)*.12,m=mesh(new THREE.ConeGeometry(1,1,3),j%4===0?tips:leaves[s.color],Math.cos(a)*r,s.height*.35,Math.sin(a)*r,.12+s.width*.08,s.height*(.65+(j%4)*.12),.11);m.rotation.z=Math.cos(a)*.55;m.rotation.x=Math.sin(a)*.55;}
    }else for(let j=0;j<s.clusters;j++){
      const a=j*2.399+s.seed*6,r=j===0?0:s.width*(.22+(j%3)*.09),h=s.height*(s.kind===0?.5:.35),m=mesh(new THREE.IcosahedronGeometry(1,s.kind===0?1:0),leaves[(s.color+(j%4===0?1:0))%leaves.length],Math.cos(a)*r,h+Math.sin(j*7+s.seed)*.12,Math.sin(a)*r,s.width*(.4+(j%3)*.06),s.height*(s.kind===0?.45:.29),s.width*(.35+(j%2)*.12));m.rotation.set(a*.3,a,j*.47);
    }
  }
  return points.length;
}
