import * as THREE from 'three';
import {CAR_LENGTH,CAR_WIDTH,MAX_PLAYERS,drivingSurfaceAt} from '../shared/game.js';
const LONG=4,WIDE=2,VERTICES=LONG*WIDE*6,LIFT=.018;
// A soft chassis footprint plus four tyre contacts. All cars share one small
// surface-conforming draw; the real sun shadow still supplies direction/shape.
export function createCarShadows(maxCars=MAX_PLAYERS){
  const geometry=new THREE.BufferGeometry();
  for(const [name,size]of [['position',3],['uv',2],['strength',1]])geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(maxCars*VERTICES*size),size).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0,0);
  const material=new THREE.ShaderMaterial({uniforms:THREE.UniformsUtils.clone(THREE.UniformsLib.fog),transparent:true,depthWrite:false,fog:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
    vertexShader:`attribute float strength;varying vec2 vUv;varying float opacity;
      #include <fog_pars_vertex>
      void main(){vUv=uv;opacity=strength;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader:`varying vec2 vUv;varying float opacity;
      #include <fog_pars_fragment>
      void main(){vec2 p=abs(vUv*2.-1.);float body=(1.-smoothstep(.55,1.,p.x))*(1.-smoothstep(.40,1.,p.y));vec2 tyre=(p-vec2(.54,.60))/vec2(.17,.27);float contact=1.-smoothstep(0.,1.,dot(tyre,tyre));gl_FragColor=vec4(0.,0.,0.,opacity*(body*.8+contact*.3));
      #include <colorspace_fragment>
      #include <fog_fragment>
      }`});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='car-contact-shadows';mesh.frustumCulled=false;mesh.visible=false;mesh.renderOrder=0;
  const points=Array.from({length:(LONG+1)*(WIDE+1)},()=>({x:0,y:0,z:0,u:0,v:0,valid:false}));
  return {mesh,update(cars){
    let count=0,used=0;
    for(const car of cars){
      if(used===maxCars)break;
      if(car.falling||(car.eliminated&&!car.wrecked))continue;
      const floor=drivingSurfaceAt(car.x,car.z,car.trackFraction);if(!floor)continue;
      const height=Math.max(0,(car.y||0)-floor.y),fade=Math.max(0,1-height/1.6);if(!fade||floor.y>(car.y||0)+.5)continue;
      used++;
      const c=Math.cos(car.angle),s=Math.sin(car.angle),normal=floor.surface,sx=normal?-normal.nx/normal.ny:(floor.grade||0)*floor.nz,sz=normal?-normal.nz/normal.ny:-(floor.grade||0)*floor.nx;
      const supported=(x,z)=>{const surface=drivingSurfaceAt(x,z,car.trackFraction);return surface&&Math.abs(surface.y-(floor.y+sx*(x-car.x)+sz*(z-car.z)))<.45?surface:null;};
      for(let i=0;i<=LONG;i++)for(let j=0;j<=WIDE;j++){
        const p=points[i*(WIDE+1)+j],x=(i/LONG-.5)*(CAR_LENGTH+.6),z=(j/WIDE-.5)*(CAR_WIDTH+.9);
        p.x=car.x+x*c-z*s;p.z=car.z+x*s+z*c;p.u=i/LONG;p.v=j/WIDE;
        const surface=supported(p.x,p.z);p.valid=!!surface;p.y=(surface?.y||0)+LIFT;
      }
      for(let i=0;i<LONG;i++)for(let j=0;j<WIDE;j++){
        const a=points[i*(WIDE+1)+j],b=points[(i+1)*(WIDE+1)+j],d=points[i*(WIDE+1)+j+1],e=points[(i+1)*(WIDE+1)+j+1];
        if(!a.valid||!b.valid||!d.valid||!e.valid||!supported((a.x+e.x)/2,(a.z+e.z)/2))continue;
        // Upward winding, so underside/back-face rendering is unnecessary.
        for(const p of [a,d,b,b,d,e]){geometry.attributes.position.setXYZ(count,p.x,p.y,p.z);geometry.attributes.uv.setXY(count,p.u,p.v);geometry.attributes.strength.setX(count,.42*fade*fade);count++;}
      }
    }
    geometry.setDrawRange(0,count);mesh.visible=count>0;
    if(count)for(const attr of Object.values(geometry.attributes)){attr.clearUpdateRanges();attr.addUpdateRange(0,count*attr.itemSize);attr.needsUpdate=true;}
  }};
}
