import * as THREE from 'three';
import {VOLCANO_VENTS,volcanoVentSpec} from '../shared/extra-circuits.js';
import {trackAt} from '../shared/game.js';
export function createSteamVents(w){
  const origins=[],seeds=[];
  for(const [index,f]of VOLCANO_VENTS.entries()){
    const p=trackAt(f),spec=volcanoVentSpec(index),g=new THREE.Group(),yaw=p.angle+spec.yaw;
    g.position.set(p.x+p.nx*p.halfWidth*spec.lane,p.y+.055,p.z+p.nz*p.halfWidth*spec.lane);g.rotation.y=-yaw;w.static.add(g);
    // Parallel jagged claw marks vary in count, length, yaw and lateral placement.
    for(let claw=0;claw<spec.claws;claw++){
      const offset=(claw-(spec.claws-1)/2)*.78,length=(5.1+Math.sin(index*3+claw)*1.3)*spec.scale,outline=[];
      const curve=t=>offset+Math.sin(t*3+index+claw)*.17;
      for(let side of [-1,1])for(let j=0;j<=8;j++){
        const t=side<0?j/8:1-j/8,x=(t-.5)*length,width=.04+.18*Math.sin(Math.PI*t)+.06*Math.abs(Math.sin(j*5+index));outline.push([x,curve(t)+side*width]);
      }
      const shape=new THREE.Shape();outline.forEach(([x,z],j)=>j?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();
      const pit=w.mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:0x100e12,side:THREE.DoubleSide}),0,.018,0,g);pit.rotation.x=Math.PI/2;
      for(let j=0;j<outline.length;j++){
        const [x,z]=outline[j],[nx,nz]=outline[(j+1)%outline.length],dx=nx-x,dz=nz-z,len=Math.hypot(dx,dz);
        const lip=w.box((x+nx)/2,.05,(z+nz)/2,len+.04,.12,.13,(j+claw)%3?0x633b34:0x96533c,g);lip.rotation.y=-Math.atan2(dz,dx);
      }
    }
    // Each wisp has its own birth position distributed along the claw openings.
    for(let j=0;j<80;j++){
      const x=Math.sin(j*4.9+index)*1.7*spec.scale,z=(j%spec.claws-(spec.claws-1)/2)*.78;
      origins.push(g.position.x+Math.cos(yaw)*x-Math.sin(yaw)*z,p.y+.15,g.position.z+Math.sin(yaw)*x+Math.cos(yaw)*z);seeds.push(index,j/80,j<20?0:1);
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(origins,3));geo.setAttribute('ventSeed',new THREE.Float32BufferAttribute(seeds,3));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0}},
    vertexShader:`uniform float time;attribute vec3 ventSeed;varying float opacity,grain;void main(){
      float seed=ventSeed.y,jet=ventSeed.z;float clock=time+ventSeed.x*.37;
      float age=jet>.5?mod(clock-2.1-(seed-.25)/.75*.65+6.,3.):mod(clock+seed*8.,2.4);
      float duration=jet>.5?1.25:2.4;float alive=1.-step(duration,age);
      vec3 p=position;float speed=jet>.5?10.+seed*3.:1.2;
      p.y+=age*speed;p.x+=sin(seed*173.+ventSeed.x)*(.8+age*.7);p.z+=cos(seed*91.+ventSeed.x)*(.5+age*.65);
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp((jet>.5?1.1+age*1.8:1.+age*.9)*520./-mv.z,1.,130.);
      opacity=alive*(jet>.5?.32:.2)*smoothstep(0.,.12,age)*(1.-smoothstep(duration*.6,duration,age));grain=seed*15.+age*.5;
    }`,
    fragmentShader:`varying float opacity,grain;void main(){vec2 p=gl_PointCoord*2.-1.;float r=length(p);float wisps=.8+.2*sin(p.x*9.+grain)*sin(p.y*7.-grain);float a=(1.-smoothstep(.15,1.,r))*wisps*opacity;gl_FragColor=vec4(vec3(.85,.86,.84),a);}`});
  const mesh=new THREE.Points(geo,material);mesh.frustumCulled=false;mesh.name='volcano-steam';w.scene.add(mesh);
  return {update(seconds){material.uniforms.time.value=seconds;}};
}
