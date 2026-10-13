import * as THREE from 'three';
import {CAR_LENGTH,CAR_WIDTH,NUDGE_DURATION,roadSurfaceAt} from '../shared/game.js';
const SKID_CAPACITY=512,SKID_LIFE=1.8,STREAK_LIFE=.28;
function ribbons(capacity,color,life,streak=false){
  const geometry=new THREE.BufferGeometry(),positions=new Float32Array(capacity*18),births=new Float32Array(capacity*6),uvs=new Float32Array(capacity*12);
  for(let i=0;i<capacity;i++)uvs.set([0,0,1,0,0,1,1,0,1,1,0,1],i*12);
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('born',new THREE.BufferAttribute(births,1).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setDrawRange(0,0);
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time:{value:0},life:{value:life},color:{value:new THREE.Color(color)},streak:{value:streak?1:0}},
    vertexShader:`attribute float born;varying float birth;varying vec2 vUv;void main(){birth=born;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float time,life,streak;uniform vec3 color;varying float birth;varying vec2 vUv;void main(){float age=(time-birth)/life;if(age>=1.)discard;float edge=1.-smoothstep(.15,1.,abs(vUv.y*2.-1.));float tip=mix(1.,sin(vUv.x*3.14159265),streak);float fade=1.-smoothstep(mix(.5,0.,streak),1.,age);gl_FragColor=vec4(color,edge*tip*fade*mix(.55,.85,streak));
    #include <colorspace_fragment>
    }`});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.visible=false;mesh.renderOrder=streak?5:1;
  return mesh;
}
function writeQuad(mesh,index,points,born){
  const positions=mesh.geometry.attributes.position,births=mesh.geometry.attributes.born;
  for(const [i,corner]of [0,1,2,1,3,2].entries()){const p=points[corner],vertex=index*6+i;positions.setXYZ(vertex,p.x,p.y,p.z);births.setX(vertex,born);}
}
const grounded=car=>!car.eliminated&&!car.finished&&!car.falling&&!car.overturned&&!car.wrecked&&(car.y||0)-(car.groundY||0)<.15;
const pose=car=>({x:car.x,z:car.z,angle:car.angle});
// Fixed buffers: tyre marks stay in the world; five soft streaks follow each shove.
export function createNudgeEffects(maxCars=8){
  const group=new THREE.Group(),skids=ribbons(SKID_CAPACITY,0x17232b,SKID_LIFE),streaks=ribbons(maxCars*5,0xdaf6ff,STREAK_LIFE,true),records=new Map();
  group.name='nudge-feedback';skids.name='nudge-skid-marks';streaks.name='nudge-motion-streaks';group.add(skids,streaks);
  let nextSkid=0,skidCount=0,lastSkid=-Infinity;
  function tyreMarks(from,to,hint,now){
    let written=false;
    for(const axle of [-1,1])for(const side of [-1,1]){
      const wheel=p=>({x:p.x+Math.cos(p.angle)*axle*CAR_LENGTH*.3-Math.sin(p.angle)*side*CAR_WIDTH*.43,z:p.z+Math.sin(p.angle)*axle*CAR_LENGTH*.3+Math.cos(p.angle)*side*CAR_WIDTH*.43});
      const a=wheel(from),b=wheel(to),dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<.025||length>4)continue;
      const wx=-dz/length*.14,wz=dx/length*.14,points=[{x:a.x-wx,z:a.z-wz},{x:b.x-wx,z:b.z-wz},{x:a.x+wx,z:a.z+wz},{x:b.x+wx,z:b.z+wz}];
      let supported=true;for(const p of points){const road=roadSurfaceAt(p.x,p.z,hint);if(!road){supported=false;break;}p.y=road.y+.045;}
      if(!supported)continue;
      writeQuad(skids,nextSkid,points,now);nextSkid=(nextSkid+1)%SKID_CAPACITY;skidCount=Math.min(SKID_CAPACITY,skidCount+1);lastSkid=now;written=true;
    }
    return written;
  }
  return {group,skids,streaks,reset(){records.clear();nextSkid=skidCount=0;lastSkid=-Infinity;for(const mesh of [skids,streaks]){mesh.visible=false;mesh.geometry.setDrawRange(0,0);}},update(now,cars){
    skids.material.uniforms.time.value=streaks.material.uniforms.time.value=now;
    let lineCount=0,dirty=false;const present=new Set();
    for(const car of cars){
      present.add(car.id);let r=records.get(car.id);const previous=r?.pose,cooldown=car.nudgeCooldown||0;
      if(!r){r={pose:pose(car),cooldown:0,burst:-Infinity,mark:pose(car),markAt:now};records.set(car.id,r);}
      const valid=grounded(car),nudging=valid&&(car.nudgeTime>0||car.nudgeMoved),recent=valid&&cooldown>.65;
      if(recent&&cooldown>r.cooldown+.2&&now-r.burst>.45){
        r.burst=now;r.angle=car.nudgeAngle??car.angle;r.direction=car.nudgeDirection||1;r.markAt=now-1/60;
        const amount=CAR_WIDTH*Math.min(NUDGE_DURATION,Math.max(0,.8-cooldown))/NUDGE_DURATION;
        r.mark=previous||{x:car.x+Math.sin(r.angle)*r.direction*amount,z:car.z-Math.cos(r.angle)*r.direction*amount,angle:car.angle};
      }
      if(nudging&&now-r.burst<STREAK_LIFE){if(now-r.markAt>=1/60-1e-6){dirty=tyreMarks(r.mark,car,car.trackFraction,now)||dirty;r.mark=pose(car);r.markAt=now;}}
      else{r.mark=pose(car);r.markAt=now;}
      const age=now-r.burst;
      if(valid&&age<STREAK_LIFE&&lineCount<maxCars*5){
        const fx=Math.cos(r.angle),fz=Math.sin(r.angle),nx=-fz*r.direction,nz=fx*r.direction;
        for(let i=0;i<5;i++){
          const along=(i-2)*.95,length=(2.3+(i%3)*.55)*(1+age*2),width=.075+(i%2)*.035,y=(car.y||0)+.4+(i%2)*.35;
          const x=car.x+fx*along-nx*.8,z=car.z+fz*along-nz*.8;
          writeQuad(streaks,lineCount++,[{x:x-nx*length-fx*width,y,z:z-nz*length-fz*width},{x:x-fx*width,y,z:z-fz*width},{x:x-nx*length+fx*width,y,z:z-nz*length+fz*width},{x:x+fx*width,y,z:z+fz*width}],r.burst);
        }
      }
      r.pose=pose(car);r.cooldown=cooldown;
    }
    for(const id of records.keys())if(!present.has(id))records.delete(id);
    skids.visible=now-lastSkid<SKID_LIFE;skids.geometry.setDrawRange(0,skidCount*6);
    if(dirty){skids.geometry.attributes.position.needsUpdate=true;skids.geometry.attributes.born.needsUpdate=true;}
    streaks.visible=lineCount>0;streaks.geometry.setDrawRange(0,lineCount*6);
    if(lineCount){streaks.geometry.attributes.position.needsUpdate=true;streaks.geometry.attributes.born.needsUpdate=true;}
  }};
}
