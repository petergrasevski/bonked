import {START_FRACTION, trackAt, angleDelta, CAR_LENGTH, CAR_WIDTH} from './game.js';

export const CAMERA_FOV = 58;
const TARGET_HEIGHT = 1.5;

// Solve the perspective frustum directly: no scene raycasts or collision work.
// Positive along points down the road; positive up points toward the screen top.
export function cameraDistance(frame,cars,aspect){
  const c=Math.cos(frame.angle),s=Math.sin(frame.angle),sp=Math.sin(frame.pitch),cp=Math.cos(frame.pitch);
  const tanY=Math.tan(CAMERA_FOV*Math.PI/360),tanX=tanY*Math.max(.35,aspect);
  let distance=14.4;
  const include=(x,y,z,sideMargin,topMargin,bottomMargin)=>{
    const dx=x-frame.x,dz=z-frame.z,dy=y-(frame.y||0)-TARGET_HEIGHT;
    const along=dx*c+dz*s,right=-dx*s+dz*c,up=along*sp+dy*cp,depth=along*cp-dy*sp;
    distance=Math.max(distance,Math.abs(right)/(tanX*sideMargin)-depth,Math.abs(up)/(tanY*(up>=0?topMargin:bottomMargin))-depth,2-depth);
  };
  // Tighter framing brings the pack closer while retaining space around cars.
  // The rear strip exposes the death line as it gets close, without following it.
  for(let i=0;i<=16;i++){
    const p=trackAt(START_FRACTION+frame.from+(frame.to-frame.from)*i/16);
    for(const side of [-1,1])include(p.x+p.nx*(p.halfWidth+1)*side,p.y||0,p.z+p.nz*(p.halfWidth+1)*side,.98,.98,.98);
  }
  for(const car of cars){
    if(car.eliminated)continue;
    // A camera-aligned envelope contains every chassis heading. A rotating
    // body box makes zoom breathe as the tail swings during a drift, even when
    // the car's position is steady. Keep actual position/height containment.
    const radius=Math.hypot(CAR_LENGTH/2+.65,CAR_WIDTH/2+.65);
    for(const x of [-radius,radius])for(const z of [-radius,radius])for(const y of [-1,4]){
      include(car.x+x*c-z*s,(car.y||0)+y,car.z+x*s+z*c,.96,.89,.72);
    }
  }
  return distance;
}

export function stepCamera(previous,target,cars,aspect,dt,profile={}){
  const amount=Math.max(0,Math.min(1,((target.spread||0)-18)/70)),spread=amount*amount*(3-2*amount);
  const pitch=Number.isFinite(profile.pitch)?profile.pitch+((profile.spreadPitch??profile.pitch)-profile.pitch)*spread:target.pitch+(profile.pitchOffset||0);
  target={...target,angle:target.angle+(profile.yawOffset||0)+(profile.spreadYawOffset||0)*spread,pitch};
  const frame=previous?{...previous}:{...target};
  const move=1-Math.exp(-dt*7),turn=1-Math.exp(-dt*2.8),tilt=1-Math.exp(-dt*1.8);
  frame.y=(frame.y||0)+((target.y||0)-(frame.y||0))*move;frame.x+=(target.x-frame.x)*move;frame.z+=(target.z-frame.z)*move;
  frame.angle+=angleDelta(target.angle,frame.angle)*turn;frame.pitch+=(target.pitch-frame.pitch)*tilt;
  frame.from=target.from;frame.to=target.to;frame.spread=target.spread;
  const required=cameraDistance(frame,cars,aspect);
  // Ease the normal dolly motion; retain a hard containment floor on rapid impacts.
  const desired=required*1.02,old=previous?.distance??desired;
  frame.distance=Math.max(required,old+(desired-old)*(1-Math.exp(-dt*(desired>old?5:1.7))));
  frame.far=Math.max(240,frame.distance+160);
  const c=Math.cos(frame.angle),s=Math.sin(frame.angle),cp=Math.cos(frame.pitch),sp=Math.sin(frame.pitch);
  for(const car of cars)if(!car.eliminated){const depth=frame.distance+((car.x-frame.x)*c+(car.z-frame.z)*s)*cp-((car.y||0)-(frame.y||0)-TARGET_HEIGHT)*sp;frame.far=Math.max(frame.far,depth+12);}
  return frame;
}

export function cameraPose(frame){
  const behind=frame.distance*Math.cos(frame.pitch);
  return {x:frame.x-Math.cos(frame.angle)*behind,y:(frame.y||0)+TARGET_HEIGHT+frame.distance*Math.sin(frame.pitch),z:frame.z-Math.sin(frame.angle)*behind,targetX:frame.x,targetY:(frame.y||0)+TARGET_HEIGHT,targetZ:frame.z};
}

// Local viewpoint never considers opponents or track progress.
export function stepPersonalCamera(previous,car,dt){
  const target={x:car.x+Math.cos(car.angle)*4,y:(car.y||0)+.5,z:car.z+Math.sin(car.angle)*4,angle:car.angle,pitch:.42,distance:24,far:350,spread:0,from:0,to:0};
  if(!previous)return target;
  const move=1-Math.exp(-Math.max(0,dt)*12),turn=1-Math.exp(-Math.max(0,dt)*7);
  return {...target,x:previous.x+(target.x-previous.x)*move,y:(previous.y||0)+(target.y-(previous.y||0))*move,z:previous.z+(target.z-previous.z)*move,angle:previous.angle+angleDelta(target.angle,previous.angle)*turn};
}
