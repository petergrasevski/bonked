import * as THREE from 'three';
import {BOOST_PADS} from '../shared/game.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Clip the decal against road triangles, retaining each triangle's exact grade.
// A centre-point tilt sinks the outer corners into curved mountain slopes.
export function padSurfaceGeometry(pad,margin=0,lift=.035){
  const c=Math.cos(pad.angle),s=Math.sin(pad.angle),vertices=[],locals=[];
  const local=([x,y,z])=>({x:(x-pad.x)*c+(z-pad.z)*s,z:-(x-pad.x)*s+(z-pad.z)*c,y});
  for(const triangle of pad.surface){
    let polygon=triangle.map(local);
    for(const [axis,limit,sign]of [['x',pad.length/2+margin,1],['x',pad.length/2+margin,-1],['z',pad.width/2+margin,1],['z',pad.width/2+margin,-1]]){
      const clipped=[];
      for(let i=0;i<polygon.length;i++){
        const a=polygon[i],b=polygon[(i+1)%polygon.length],da=limit-sign*a[axis],db=limit-sign*b[axis];
        if(da>=0)clipped.push(a);
        if((da>=0)!==(db>=0)){const t=da/(da-db);clipped.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});}
      }
      polygon=clipped;
    }
    for(let i=1;i<polygon.length-1;i++)for(const p of [polygon[0],polygon[i],polygon[i+1]]){
      vertices.push(pad.x+p.x*c-p.z*s,p.y+.01+lift,pad.z+p.x*s+p.z*c);locals.push(p.x,p.z);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('padLocal',new THREE.Float32BufferAttribute(locals,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(vertices.length),3));geometry.computeVertexNormals();return geometry;
}
// Three batched draws for the entire course. Geometry is static; only colours
// change on consumption, while the shared shader steps the chevrons at 3 fps.
export function buildBoostPads(scene){
  const pads=[...BOOST_PADS],ranges=[];
  const build=(margin,lift)=>{const sources=pads.map(p=>padSurfaceGeometry(p,margin,lift));let start=0;const spans=sources.map(g=>{const count=g.attributes.position.count,span={start,count};start+=count;return span;});const geometry=mergeGeometries(sources);sources.forEach(g=>g.dispose());ranges.push(spans);return geometry;};
  const conveyor=new THREE.ShaderMaterial({uniforms:{phase:{value:0}},transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
    vertexShader:`attribute vec2 padLocal;attribute vec3 color;varying vec2 vLocal;varying vec3 vTint;void main(){vLocal=padLocal;vTint=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float phase;varying vec2 vLocal;varying vec3 vTint;void main(){float moving=step(.4,vTint.g);float band=mod(vLocal.x-phase*moving+abs(vLocal.y)*.85+5.,2.5);float line=1.-smoothstep(.11,.18,abs(band-1.25));float edge=1.-smoothstep(1.05,1.25,abs(vLocal.y));gl_FragColor=vec4(vTint,line*edge);}`});
  const base=new THREE.Mesh(build(0,.035),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.35,metalness:.1,transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide}));
  const chevrons=new THREE.Mesh(build(0,.055),conveyor);
  const glow=new THREE.Mesh(build(.3,.075),new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide}));
  const meshes=[base,chevrons,glow];for(const mesh of meshes){mesh.userData.sceneryKind='boost-pads';scene.add(mesh);}
  const ready=new THREE.Color(0x79d5ff),off=new THREE.Color(0x122331),light=new THREE.Color(0x57eaff),dull=new THREE.Color(0x245068),blue=new THREE.Color(0x13bfff),black=new THREE.Color(0),last=[];
  const update=(state,now)=>{
    conveyor.uniforms.phase.value=padAnimationPhase(now);glow.material.opacity=.22+.015*Math.sin(now*.004);
    const statuses=new Map((state?.boostPads||[]).map(p=>[p.id,p]));
    for(let i=0;i<pads.length;i++){
      const active=!state||(statuses.get(pads[i].id)?.readyAt||0)<=(state.raceTime||0);if(last[i]===active)continue;last[i]=active;
      const colors=active?[ready,light,blue]:[off,dull,black];
      meshes.forEach((mesh,j)=>{const attr=mesh.geometry.attributes.color,{start,count}=ranges[j][i],color=colors[j];for(let v=start;v<start+count;v++)attr.setXYZ(v,color.r,color.g,color.b);attr.needsUpdate=true;});
    }
  };
  update(null,0);return {update,base,chevrons,glow,ranges,pads};
}
export const padAnimationPhase=now=>(Math.floor(now*3/1000)%3)*(2.5/3);
