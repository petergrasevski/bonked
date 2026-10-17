import * as THREE from 'three';
import {nearestTrack} from '../shared/game.js';
import {TRACK_LENGTH} from '../shared/game.js';
import {VOLCANO_CROSSINGS,volcanoCrossingBounds} from '../shared/volcano-lava.js';

// Lava follows the same triangles as the mountainside, including across its banks.
// Metre-based UVs carry the molten detail downhill without stretching at bends.
export function buildVolcanoStreams(w,surface,trackAt){
  const time={value:0};
  const material=new THREE.ShaderMaterial({side:THREE.DoubleSide,fog:true,
    uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),time},
    vertexShader:`varying vec2 flowUv;
      #include <fog_pars_vertex>
      void main(){flowUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader:`uniform float time;varying vec2 flowUv;
      #include <fog_pars_fragment>
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      float fbm(vec2 p){return noise(p)*.57+noise(p*2.07+7.3)*.28+noise(p*4.13+19.1)*.15;}
      void main(){
        vec2 p=vec2(flowUv.x*.18-time*.24,flowUv.y*3.8);
        vec2 warp=vec2(fbm(p*.72),fbm(p*.8+13.7));
        float crust=fbm(p+warp*2.8);
        float edge=abs(flowUv.y)+.11*(noise(vec2(flowUv.x*.65,flowUv.y*7.))-.5);
        float bank=smoothstep(.68,1.,edge);
        float cracks=1.-smoothstep(.015,.065,abs(crust-.51));
        float molten=(1.-smoothstep(.34,.56,crust))*(1.-bank);
        float heat=max(molten*.72,cracks*(1.-bank)*.9);
        vec3 rock=mix(vec3(.025,.012,.009),vec3(.10,.035,.018),crust);
        vec3 lava=mix(vec3(.55,.025,.002),vec3(1.,.12,.003),smoothstep(.1,.65,heat));
        lava=mix(lava,vec3(1.,.42,.035),pow(heat,6.)*.45);
        gl_FragColor=vec4(mix(rock,lava,smoothstep(.1,.8,heat)),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`});
  const channel=(base,start,end,seed,width,branch=0)=>{
    const positions=[],uv=[],indices=[],steps=Math.ceil((end-start)/.8),across=10;
    for(let j=0;j<=steps;j++){
      const u=j/steps,r=start+(end-start)*u;
      const a=base+(Math.sin(u*7+seed)*.032+Math.sin(u*19+seed)*.008)*Math.sin(Math.PI*u)+branch*u;
      const halfWidth=width*(.7+.2*Math.sin(u*17+seed)+.12*Math.sin(u*43+seed))*(1-.8*Math.pow(u,9));
      for(let k=0;k<=across;k++){
        const v=k/across*2-1,angle=a+v*halfWidth/r,x=Math.cos(angle)*r,z=Math.sin(angle)*r;
        // Terrain intentionally has a gap under the road. Keep stream banks
        // below that ribbon instead of lifting missing samples to crater height.
        const ground=surface.sample(x,z),height=ground?.y??nearestTrack(x,z).y-.35;positions.push(x,height+.22,z);uv.push((r-start)*1.25,v);
        if(j&&k){const i=j*(across+1)+k;indices.push(i-across-2,i-1,i-across-1,i-1,i,i-across-1);}
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=w.mesh(geometry,material);mesh.castShadow=false;mesh.receiveShadow=false;
  };
  for(const [i,f]of [.09,.19,.37,.49,.68,.79,.91].entries()){
    const p=trackAt(f),radius=Math.hypot(p.x,p.z),base=Math.atan2(p.z,p.x),end=59+(radius-59)*.90;
    channel(base,55,end,i*2.37,3.4+i%3*.65);
    if(i%2===0)channel(base,55+(end-55)*.48,end-8,i*2.37,1.8,i%4===0?.075:-.07);
  }
  // A continuous overflowing tongue joins the mountain to a shallow, driveable
  // slick across the road. The banks come from the authoritative tyre predicate.
  for(const [index,zone]of VOLCANO_CROSSINGS.entries()){
    const p=trackAt(zone.fraction),radius=Math.hypot(p.x,p.z),innerX=p.x+p.nx*(p.halfWidth+.7),innerZ=p.z+p.nz*(p.halfWidth+.7);
    channel(Math.atan2(innerZ,innerX),55,Math.hypot(innerX,innerZ),index+7,6.2);
    const positions=[],uv=[],indices=[],across=30,along=8;
    for(let j=0;j<=across;j++){
      const lane=1.08-j/across*2.16,[lo,hi]=volcanoCrossingBounds(lane,index);
      for(let k=0;k<=along;k++){
        const distance=lo+(hi-lo)*k/along,q=trackAt(zone.fraction+distance/TRACK_LENGTH);
        positions.push(q.x+q.nx*q.halfWidth*lane,q.y+.075,q.z+q.nz*q.halfWidth*lane);
        uv.push(radius+(1-lane)*p.halfWidth,(k/along*2-1)*.93);
        if(j&&k){const n=j*(along+1)+k;indices.push(n-along-2,n-1,n-along-1,n-1,n,n-along-1);}
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=w.mesh(geometry,material);mesh.name='volcano-lava-crossing';mesh.castShadow=false;mesh.receiveShadow=false;
    // Below the exposed edge the flow spills onto the outer mountainside.
    const outerX=p.x-p.nx*(p.halfWidth+.7),outerZ=p.z-p.nz*(p.halfWidth+.7);
    channel(Math.atan2(outerZ,outerX),Math.hypot(outerX,outerZ),radius+90,index+7,5.5);
  }
  return {time,material};
}
