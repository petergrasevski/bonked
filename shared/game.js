export const MAX_PLAYERS = 6;
export const LAPS = 3;
export const STEP = 1 / 60;
export const ROAD_WIDTH = 12;
export const TOP_SPEED = 36;
export const SURFACE_HALF_WIDTH = ROAD_WIDTH / 2 + .6;
export const START_BOOST_SECONDS = .8;
export const START_SPIN_SECONDS = 1.1;
export const healthSpeedFactor = health => .6 + .4 * (Math.max(1, Math.min(100, health)) - 1) / 99;
export function launchResult(pressedAt,startAt){
  if(!Number.isFinite(pressedAt))return 'normal';
  const lead=startAt-pressedAt;
  return lead>2000?'spinout':Math.abs(lead-1000)<=20?'boost':'normal';
}
export function applyLaunch(car,pressedAt,startAt){
  car.launchResult=launchResult(pressedAt,startAt);
  if(car.launchResult==='boost')car.boost=START_BOOST_SECONDS;
  if(car.launchResult==='spinout')car.spinout=START_SPIN_SECONDS;
}
// Only the current uninterrupted hold counts. A late or implausible timestamp
// falls back to receipt time; the client never chooses its launch outcome.
export function recordLaunchInput(player,input,at,now,startAt){
  if(input.throttle<=.1||input.reverse){player.accelPressedAt=null;return;}
  if(player.input.throttle>.1&&!player.input.reverse&&now-player.lastInput<=250)return;
  player.accelPressedAt=Number.isFinite(at)&&at>=now-250&&at<=now+50?Math.min(at,now):now;
  player.accelPressedAt=Math.max(startAt-3300,player.accelPressedAt);
}
export const CAR_LENGTH = 4.9;
export const CAR_WIDTH = 2.1;
export const TARGET_TRACK_LENGTH = 3466.9092022732743 * .7;
export const START_FRACTION = .012;
export const REVERSE_HOLD_MS = 700;
export const brakeMode = heldMs => ({ brake: heldMs >= 0 && heldMs < REVERSE_HOLD_MS, reverse: heldMs >= REVERSE_HOLD_MS });
export const COLORS = ['#ff514f', '#388bff', '#ffd139', '#44db89', '#b681ff', '#ff893e'];
export const COLOR_NAMES = ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange'];
export const NEUTRAL = Object.freeze({ steer: 0, throttle: 0, reverse: false, brake: false, fire: false });
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function angleDelta(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
const anchors = [[-260,150],[-210,150],[-175,115],[-140,160],[-95,165],[-60,110],[-15,115],[25,165],[85,165],[110,120],[70,70],[100,40],[160,50],[200,120],[245,150],[280,105],[270,35],[225,5],[250,-45],[295,-80],[275,-140],[200,-165],[145,-135],[170,-85],[120,-60],[85,-105],[60,-170],[-10,-170],[-45,-115],[-85,-105],[-125,-165],[-200,-155],[-235,-110],[-195,-65],[-225,-25],[-280,-60],[-305,0],[-260,50],[-285,100]];
function spline(p0, p1, p2, p3, t) {
  return p1 + .5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}
export const TRACK = Array.from({ length: 1500 }, (_, i) => {
  const f = i / 1500 * anchors.length, j = Math.floor(f), t = f - j, n = anchors.length;
  return { x: spline(anchors[(j+n-1)%n][0], anchors[j][0], anchors[(j+1)%n][0], anchors[(j+2)%n][0], t), z: spline(anchors[(j+n-1)%n][1], anchors[j][1], anchors[(j+1)%n][1], anchors[(j+2)%n][1], t) };
});
// Preserve the requested 30% length reduction while authoring turns independently.
const rawLength=TRACK.reduce((sum,p,i)=>sum+Math.hypot(p.x-TRACK[(i+1)%TRACK.length].x,p.z-TRACK[(i+1)%TRACK.length].z),0);
for(const p of TRACK){p.x*=TARGET_TRACK_LENGTH/rawLength;p.z*=TARGET_TRACK_LENGTH/rawLength;}
export function hasBarrier(fraction){const section=Math.floor(((fraction%1+1)%1)*24);return ![3,8,14,19].includes(section);}
let length = 0;
export const SEGMENTS = TRACK.map((p, i) => {
  const q = TRACK[(i + 1) % TRACK.length], dx = q.x-p.x, dz = q.z-p.z, len = Math.hypot(dx,dz);
  const s = { ...p, dx, dz, len, start: length, nx: -dz/len, nz: dx/len };
  length += len; return s;
});
export const TRACK_LENGTH = length;
// Smooth widening around bends and three passing plazas, shared by rendering and physics.
export const PLAZAS=[.10,.30,.70];
const arcDistance=(a,b)=>Math.abs(((a-b+.5)%1+1)%1-.5)*TRACK_LENGTH;
for(let i=0;i<SEGMENTS.length;i++){
  const s=SEGMENTS[i],before=SEGMENTS[(i+SEGMENTS.length-10)%SEGMENTS.length],after=SEGMENTS[(i+10)%SEGMENTS.length];
  const bend=Math.abs(angleDelta(Math.atan2(after.dz,after.dx),Math.atan2(before.dz,before.dx)));
  let halfWidth=6+Math.min(3,bend*3.5);
  for(const f of PLAZAS){const d=arcDistance(s.start/TRACK_LENGTH,f);if(d<65)halfWidth=Math.max(halfWidth,6+6*(1+Math.cos(Math.PI*d/65))/2);}
  let clearance=Infinity;
  for(let j=0;j<SEGMENTS.length;j+=3){const q=SEGMENTS[j];if(arcDistance(s.start/TRACK_LENGTH,q.start/TRACK_LENGTH)>45)clearance=Math.min(clearance,Math.hypot(s.x-q.x,s.z-q.z));}
  s.halfWidth=Math.max(6,Math.min(halfWidth,(clearance-3)/2));
}
for(let i=0;i<SEGMENTS.length;i++)SEGMENTS[i].nextHalfWidth=SEGMENTS[(i+1)%SEGMENTS.length].halfWidth;
export function trackAt(fraction) {
  const d = ((fraction % 1 + 1) % 1) * TRACK_LENGTH;
  const s = SEGMENTS.find(s => s.start+s.len >= d) || SEGMENTS.at(-1);
  const t = (d-s.start)/s.len;
  return { x:s.x+s.dx*t, z:s.z+s.dz*t, angle:Math.atan2(s.dz,s.dx), nx:s.nx, nz:s.nz, halfWidth:s.halfWidth+(s.nextHalfWidth-s.halfWidth)*t };
}
export function nearestTrack(x,z) {
  let best = { distance: Infinity };
  for (const s of SEGMENTS) {
    const t = clamp(((x-s.x)*s.dx+(z-s.z)*s.dz)/(s.len*s.len),0,1);
    const px=s.x+s.dx*t, pz=s.z+s.dz*t, d=Math.hypot(x-px,z-pz);
    if(d<best.distance) best={x:px,z:pz,distance:d,fraction:(s.start+s.len*t)/TRACK_LENGTH,nx:s.nx,nz:s.nz,halfWidth:s.halfWidth+(s.nextHalfWidth-s.halfWidth)*t};
  }
  return best;
}
export const roadHalfWidth=fraction=>trackAt(fraction).halfWidth;
export const surfaceHalfWidth=fraction=>roadHalfWidth(fraction)+.6;
export const OBSTACLES=PLAZAS.flatMap((fraction,index)=>[-8,8].map((offset,i)=>{
  const f=fraction+offset/TRACK_LENGTH,p=trackAt(f);
  return {id:`island-${index}-${i}`,fraction:f,x:p.x,z:p.z,radius:1.65,height:1.5};
}));
export function constrainObstacles(car){
  if(car.falling||car.y>1.5)return;
  const c=Math.cos(car.angle),s=Math.sin(car.angle);
  for(const o of OBSTACLES){
    if(Math.hypot(car.x-o.x,car.z-o.z)>o.radius+CAR_LENGTH)return;
    const ox=(o.x-car.x)*c+(o.z-car.z)*s,oz=-(o.x-car.x)*s+(o.z-car.z)*c;
    const qx=clamp(ox,-CAR_LENGTH/2,CAR_LENGTH/2),qz=clamp(oz,-CAR_WIDTH/2,CAR_WIDTH/2);
    let dx=qx-ox,dz=qz-oz,d=Math.hypot(dx,dz),depth=o.radius-d;
    if(depth<=0)continue;
    if(d<1e-6){const ex=CAR_LENGTH/2-Math.abs(ox),ez=CAR_WIDTH/2-Math.abs(oz);if(ex<ez){dx=ox>0?-1:1;dz=0;depth=o.radius+ex;}else{dx=0;dz=oz>0?-1:1;depth=o.radius+ez;}d=1;}
    const nx=(dx*c-dz*s)/d,nz=(dx*s+dz*c)/d;
    car.x+=nx*(depth+.002);car.z+=nz*(depth+.002);
    const impact=-(car.vx*nx+car.vz*nz);
    if(impact>0){const speedBefore=Math.hypot(car.vx,car.vz);car.vx+=nx*impact*1.15;car.vz+=nz*impact*1.15;car.impactTime=.4;if(car.wallCooldown<=0&&impact>4){damageCar(car,wallDamage(speedBefore,Math.hypot(car.vx,car.vz)));car.wallCooldown=.2;}}
  }
}
export function spawnCar(slot=0,startFraction=START_FRACTION) {
  const fraction = startFraction - (6 + Math.floor(slot/2)*5.5)/TRACK_LENGTH;
  const p=trackAt(fraction), side=slot%2===0?-2.3:2.3;
  return { x:p.x+p.nx*side,z:p.z+p.nz*side,angle:p.angle,vx:0,vz:0,progress:fraction-START_FRACTION,trackFraction:fraction,lap:1,item:null,boost:0,spinout:0,launchResult:null,stun:0,finished:false,finishTime:null,eliminated:false,eliminatedAt:null,health:100,shield:0,ammo:0,fireCooldown:0,firing:null,y:0,vy:0,roll:0,pitch:0,rollVelocity:0,pitchVelocity:0,yawVelocity:0,impactTime:0,wallCooldown:0,contactCooldown:0,wrecked:false,overturned:false,falling:false };
}
export function sanitizeInput(raw) {
  return { steer: Number.isFinite(raw?.steer)?clamp(raw.steer,-1,1):0,throttle:Number.isFinite(raw?.throttle)?clamp(raw.throttle,0,1):0,reverse:raw?.reverse===true,brake:raw?.brake===true,fire:raw?.fire===true };
}
export function damageLevel(health){return clamp(Math.floor((100-health)/20),0,4);}
export function damageCar(car,amount){
  if(car.wrecked||car.eliminated||car.finished||car.shield>0)return false;
  car.health=Math.max(0,car.health-Math.max(0,amount));
  if(car.health<=0){
    car.wrecked=true;car.eliminated=true;car.item=null;car.ammo=0;car.firing=null;car.shield=0;
    if(!car.falling){car.vy=Math.max(car.vy,10);car.y=Math.max(car.y,.1);}car.rollVelocity+=5;car.pitchVelocity+=6;
    car.vx+=Math.cos(car.angle)*12;car.vz+=Math.sin(car.angle)*12;car.impactTime=2;
  }
  return true;
}
export function launchCar(car,up,side=0,fore=0){
  if(car.shield>0||car.wrecked||car.eliminated)return;
  car.y=Math.max(car.y,.08);car.vy=Math.max(car.vy,up);
  car.rollVelocity=clamp(car.rollVelocity+side*up*.65,-10,10);
  car.pitchVelocity=clamp(car.pitchVelocity+fore*up*.45,-10,10);
  car.yawVelocity+=side*.8;car.impactTime=1.5;
}
function verticalStep(car,dt){
  if(car.y>0||car.vy>0||car.falling){
    car.vy-=22*dt;car.y+=car.vy*dt;car.roll+=car.rollVelocity*dt;car.pitch+=car.pitchVelocity*dt;
    car.rollVelocity*=Math.exp(-.22*dt);car.pitchVelocity*=Math.exp(-.22*dt);
    if(car.falling){if(car.y< -2.1&&!car.wrecked){car.shield=0;damageCar(car,100);}return;}
    if(car.y<=0){
      car.y=0;car.vy=0;
      const upsideDown=Math.cos(car.roll)*Math.cos(car.pitch)<-.15;
      car.overturned=upsideDown;car.roll=upsideDown?Math.PI:0;car.pitch=0;car.rollVelocity=0;car.pitchVelocity=0;
      car.vx*=car.wrecked?.5:.18;car.vz*=car.wrecked?.5:.18;car.impactTime=.8;
    }
  }
}
export function wallDamage(speedBefore,speedAfter){return Math.max(0,speedBefore-speedAfter-1.5)*.3;}
export function constrainRoad(car){
  const t=nearestTrack(car.x,car.z);
  // Only the road causeway supports cars. Both exposed edges drop into water.
  if(car.falling)return t;
  if(t.distance>t.halfWidth+.6){if(car.y<.5)car.falling=true;return t;}
  const extent=Math.abs(Math.cos(car.angle)*t.nx+Math.sin(car.angle)*t.nz)*CAR_LENGTH/2+Math.abs(-Math.sin(car.angle)*t.nx+Math.cos(car.angle)*t.nz)*CAR_WIDTH/2;
  const limit=t.halfWidth-extent;
  if(car.y<1.4&&hasBarrier(t.fraction)&&t.distance>limit){
    const nx=(car.x-t.x)/(t.distance||1),nz=(car.z-t.z)/(t.distance||1);
    car.x=t.x+nx*limit;car.z=t.z+nz*limit;
    const impact=car.vx*nx+car.vz*nz;
    if(impact>0){const speedBefore=Math.hypot(car.vx,car.vz);car.vx-=nx*impact*1.12;car.vz-=nz*impact*1.12;car.impactTime=Math.max(car.impactTime,.3);
      if(car.wallCooldown<=0&&impact>4){damageCar(car,wallDamage(speedBefore,Math.hypot(car.vx,car.vz)));car.wallCooldown=.2;}
    }
  }
  constrainObstacles(car);
  return t;
}
export function stepCar(car, input, dt=STEP) {
  if(car.eliminated&&!car.wrecked){car.vx=0;car.vz=0;return;}
  for(const key of ['boost','stun','shield','impactTime','wallCooldown','contactCooldown'])car[key]=Math.max(0,(car[key]||0)-dt);
  verticalStep(car,dt);
  if(car.falling&&car.y< -20){car.vx=0;car.vz=0;return;}
  const spinStep=Math.min(car.spinout||0,dt);car.spinout=Math.max(0,(car.spinout||0)-dt);
  if(spinStep)car.angle+=Math.PI*2*spinStep/START_SPIN_SECONDS;
  const uncontrolled=spinStep>0||car.wrecked||car.overturned||car.y>.05||car.falling;
  if(uncontrolled){
    const drag=car.y>.05||car.falling?.15:car.wrecked?2.4:3;
    car.vx*=Math.exp(-drag*dt);car.vz*=Math.exp(-drag*dt);car.angle+=car.yawVelocity*dt;
  }else{
    if(car.finished)input=NEUTRAL;
    let c=Math.cos(car.angle),s=Math.sin(car.angle);
    let forward=car.vx*c+car.vz*s,lateral=-car.vx*s+car.vz*c;
    const speedFactor=healthSpeedFactor(car.health),maxSpeed=TOP_SPEED*speedFactor*(car.boost>0?1.1:1);
    const force=car.stun>0?0:input.reverse?-24*speedFactor:forward>=maxSpeed&&car.impactTime>0?0:input.throttle*37.2*speedFactor*(car.boost>0?1.35:1);
    forward+=force*dt;forward*=Math.exp(-(input.brake?1.7:Math.abs(force)>0?.64:1.5)*dt);
    // External impacts may exceed engine top speed; they decay instead of being erased.
    if(car.impactTime<=0)forward=clamp(forward,-14.4*speedFactor,maxSpeed);
    lateral*=Math.exp(-(car.impactTime>0?.65:input.brake?1.5:9.5)*dt);
    const turn=input.steer*(input.brake?2.9:2.05)*clamp(Math.abs(forward)/7,0,1)*Math.sign(forward);
    car.angle+=(turn+car.yawVelocity)*dt;
    const nc=Math.cos(car.angle),ns=Math.sin(car.angle),grip=input.brake?.2:.65;
    c=c*(1-grip)+nc*grip;s=s*(1-grip)+ns*grip;
    car.vx=c*forward-s*lateral;car.vz=s*forward+c*lateral;
  }
  car.yawVelocity*=Math.exp(-3*dt);car.x+=car.vx*dt;car.z+=car.vz*dt;
  const track=constrainRoad(car);
  let diff=track.fraction-car.trackFraction;if(diff>.5)diff-=1;if(diff<-.5)diff+=1;
  if(track.distance<track.halfWidth+5&&!car.falling&&!car.eliminated)car.progress+=clamp(diff,-.01,.01);
  car.trackFraction=track.fraction;car.lap=clamp(Math.floor(Math.max(0,car.progress))+1,1,LAPS);
}
export function carContact(a,b){
  const fa={x:Math.cos(a.angle),z:Math.sin(a.angle)},sa={x:-fa.z,z:fa.x},fb={x:Math.cos(b.angle),z:Math.sin(b.angle)},sb={x:-fb.z,z:fb.x};
  const dx=b.x-a.x,dz=b.z-a.z;let depth=Infinity,nx=0,nz=0;
  for(const axis of [fa,sa,fb,sb]){
    const ra=Math.abs(fa.x*axis.x+fa.z*axis.z)*CAR_LENGTH/2+Math.abs(sa.x*axis.x+sa.z*axis.z)*CAR_WIDTH/2;
    const rb=Math.abs(fb.x*axis.x+fb.z*axis.z)*CAR_LENGTH/2+Math.abs(sb.x*axis.x+sb.z*axis.z)*CAR_WIDTH/2;
    const d=dx*axis.x+dz*axis.z,overlap=ra+rb-Math.abs(d);if(overlap<=0)return null;
    if(overlap<depth){depth=overlap;nx=axis.x*(d<0?-1:1);nz=axis.z*(d<0?-1:1);}
  }
  // Centre of the overlapping contact face, rather than an arbitrary support
  // corner. Nearly parallel bumpers must not produce a huge false spin impulse.
  const tx=-nz,tz=nx;
  const radius=(f,s,x,z)=>Math.abs(f.x*x+f.z*z)*CAR_LENGTH/2+Math.abs(s.x*x+s.z*z)*CAR_WIDTH/2;
  const at=a.x*tx+a.z*tz,bt=b.x*tx+b.z*tz,ar=radius(fa,sa,tx,tz),br=radius(fb,sb,tx,tz);
  const tangent=(Math.max(at-ar,bt-br)+Math.min(at+ar,bt+br))/2;
  const normal=(a.x*nx+a.z*nz+radius(fa,sa,nx,nz)+b.x*nx+b.z*nz-radius(fb,sb,nx,nz))/2;
  return {depth,nx,nz,x:nx*normal+tx*tangent,z:nz*normal+tz*tangent};
}
export function collideCars(cars,{road=false,damage=true}={}){
  for(let pass=0;pass<6;pass++){for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
    const a=cars[i],b=cars[j];if((a.eliminated&&!a.wrecked)||(b.eliminated&&!b.wrecked)||Math.abs(a.y-b.y)>1.3||a.falling||b.falling)continue;
    const hit=carContact(a,b);if(!hit)continue;const {nx,nz}=hit;
    const ma=a.wrecked?.4:1,mb=b.wrecked?.4:1,inertia=(CAR_LENGTH**2+CAR_WIDTH**2)/12;
    const ax=hit.x-a.x,az=hit.z-a.z,bx=hit.x-b.x,bz=hit.z-b.z;
    const va=(a.vx-a.yawVelocity*az)*nx+(a.vz+a.yawVelocity*ax)*nz,vb=(b.vx-b.yawVelocity*bz)*nx+(b.vz+b.yawVelocity*bx)*nz;
    const speed=va-vb,ta=ax*nz-az*nx,tb=bx*nz-bz*nx;
    const push=(hit.depth+.002)/(ma+mb);a.x-=nx*push*ma;a.z-=nz*push*ma;b.x+=nx*push*mb;b.z+=nz*push*mb;
    if(speed>0){const impulse=speed*1.08/(ma+mb+ta*ta*ma/inertia+tb*tb*mb/inertia);
      a.vx-=nx*impulse*ma;a.vz-=nz*impulse*ma;b.vx+=nx*impulse*mb;b.vz+=nz*impulse*mb;
      a.yawVelocity=clamp(a.yawVelocity-ta*impulse*ma/inertia,-3,3);b.yawVelocity=clamp(b.yawVelocity+tb*impulse*mb/inertia,-3,3);
      // A little contact friction makes rubbing doors and clipping a rear
      // quarter transfer sideways motion, while retaining deliberate drift.
      const tx=-nz,tz=nx,tangentSpeed=(b.vx-a.vx)*tx+(b.vz-a.vz)*tz;
      const friction=clamp(-tangentSpeed/(ma+mb),-impulse*.25,impulse*.25);
      a.vx-=tx*friction*ma;a.vz-=tz*friction*ma;b.vx+=tx*friction*mb;b.vz+=tz*friction*mb;
      a.impactTime=b.impactTime=.65;
      if(damage&&pass===0&&speed>7){if(a.contactCooldown<=0){damageCar(a,(speed-7)*.35);a.contactCooldown=.2;}if(b.contactCooldown<=0){damageCar(b,(speed-7)*.35);b.contactCooldown=.2;}}
    }
  }
    if(road)for(const car of cars)if(!car.eliminated||car.wrecked)constrainRoad(car);
  }
}
// Swept ray against the oriented chassis: fast bullets cannot tunnel between snapshots.
export function rayCar(x,z,dx,dz,car,padding=0){
  const c=Math.cos(car.angle),s=Math.sin(car.angle),ox=(x-car.x)*c+(z-car.z)*s,oz=-(x-car.x)*s+(z-car.z)*c,rx=dx*c+dz*s,rz=-dx*s+dz*c;
  let lo=0,hi=1;
  for(const [o,d,extent]of [[ox,rx,CAR_LENGTH/2+padding],[oz,rz,CAR_WIDTH/2+padding]]){
    if(Math.abs(d)<1e-9){if(Math.abs(o)>extent)return null;continue;}
    let a=(-extent-o)/d,b=(extent-o)/d;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;
  }
  return lo;
}
export const PICKUP_LOCATIONS = Array.from({length:48},(_,i)=>{
  const p=trackAt(START_FRACTION+(30+i*TRACK_LENGTH/48)/TRACK_LENGTH);
  if(OBSTACLES.some(o=>Math.hypot(o.x-p.x,o.z-p.z)<7)){p.x+=p.nx*5;p.z+=p.nz*5;}return p;
});
export function botInput(car){
  const p=trackAt(car.trackFraction+Math.max(7,Math.hypot(car.vx,car.vz)*.35)/TRACK_LENGTH);
  for(const f of PLAZAS){const d=arcDistance(car.trackFraction,f);if(d<48){const side=car.botLane||1,offset=side*5*Math.min(1,(48-d)/18);p.x+=p.nx*offset;p.z+=p.nz*offset;}}
  const target=Math.atan2(p.z-car.z,p.x-car.x);
  const error=angleDelta(target,car.angle);
  const ahead=trackAt(car.trackFraction+24/TRACK_LENGTH),bend=Math.abs(angleDelta(ahead.angle,car.angle));const desired=clamp(36-bend*20,13,36);
  return {steer:clamp(error*2.5,-1,1),throttle:Math.hypot(car.vx,car.vz)>desired?0:1,reverse:false,brake:Math.abs(error)>1.1,fire:false};
}
