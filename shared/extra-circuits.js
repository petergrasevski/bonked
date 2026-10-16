// Circuit geometry and clock-driven machinery live here so rendering, server
// simulation and replay all use the same definitions. No wall-clock randomness.
export const EXTRA_CIRCUITS=['factory','volcano'];
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const FACTORY_BELTS=[{fraction:.16,length:230},{fraction:.46,length:230},{fraction:.77,length:220}];
export const FACTORY_TABLES=[.33,.64];
export const FACTORY_PRESSES=[.25,.56,.86];
export const VOLCANO_HOT=[{fraction:.19,length:145},{fraction:.49,length:170},{fraction:.79,length:135}];
export const VOLCANO_VENTS=Array.from({length:18},(_,i)=>.08+i*.05+Math.sin(i*2.7)*.008);
export const circuitDistance=(a,b,length)=>Math.abs(((a-b+.5)%1+1)%1-.5)*length;
export function zoneAt(zones,fraction,length){return zones.find(z=>circuitDistance(fraction,z.fraction,length)<z.length/2);}
const spline=(a,b,c,d,t)=>b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));
const layouts={
  factory:[[-270,-140],[-120,-140],[80,-140],[245,-125],[285,-40],[230,35],[110,35],[85,110],[220,150],[160,225],[-40,225],[-100,145],[-235,165],[-300,65],[-220,-10],[-290,-65]],
};
export function extraCircuitPoints(id){
  return Array.from({length:1500},(_,i)=>{
    const f=i/1500,a=f*TAU;
    if(id==='volcano'){
      const radius=265+38*Math.sin(a*3)+20*Math.cos(a*5);
      return {x:Math.sin(a)*radius,z:-Math.cos(a)*radius*.84,y:140+12*(.5-.5*Math.cos(a*2))};
    }
    const points=layouts[id],n=points.length,t=f*n,j=Math.floor(t),u=t-j;
    const x=spline(points[(j+n-1)%n][0],points[j][0],points[(j+1)%n][0],points[(j+2)%n][0],u);
    const z=spline(points[(j+n-1)%n][1],points[j][1],points[(j+1)%n][1],points[(j+2)%n][1],u);
    return {x,z,y:5};
  });
}
export const FACTORY_ROTOR_RADIUS=24;
export const FACTORY_ROTOR_SPEED=.234;
export function extraHalfWidth(id,fraction,length){
  if(id==='factory'){
    let width=9+2*Math.sin(fraction*TAU*3)**2;
    for(const f of FACTORY_TABLES){const d=circuitDistance(fraction,f,length);if(d<50)width=Math.max(width,24*Math.cos(d/50*Math.PI/2));}
    return width;
  }
  return 8.5+1.5*Math.sin(fraction*TAU*3)**2;
}
export function extraHasBarrier(id,fraction,side,length,insideSide=1,turn=0){
  if(!side)return extraHasBarrier(id,fraction,-1,length,insideSide,turn)||extraHasBarrier(id,fraction,1,length,insideSide,turn);
  if(id==='volcano')return side>0;
  if(FACTORY_TABLES.some(f=>circuitDistance(fraction,f,length)<43))return false;
  if(factoryTipAt(fraction,length,3)&&side<0)return false;
  if(side===-insideSide&&Math.abs(turn)>.065)return false;
  return ![{fraction:.095,length:65,side:-1},{fraction:.40,length:75,side:1},{fraction:.72,length:70,side:-1},{fraction:.94,length:60,side:1}].some(z=>z.side===side&&circuitDistance(fraction,z.fraction,length)<z.length/2);
}
// Reverse every three seconds, easing through zero over one and a half seconds. Integrate
// that same velocity for the tread UVs so a reversal never teleports the texture.
export function beltDirection(seconds,index=0){
  const t=Math.max(0,(seconds+index*.6)/1.5);if(t<2)return 1;
  const phase=(t-2)%4;
  return phase<1?Math.cos(Math.PI*phase):phase<2?-1:phase<3?-Math.cos(Math.PI*(phase-2)):1;
}
export function beltTravel(seconds,index=0){
  const t=Math.max(0,(seconds+index*.6)/1.5);if(t<2)return t*1.5;
  const phase=(t-2)%4;
  return 1.5*(2+(phase<1?Math.sin(Math.PI*phase)/Math.PI:phase<2?-(phase-1):phase<3?-1-Math.sin(Math.PI*(phase-2))/Math.PI:phase-4));
}
export function ventState(seconds,index=0){
  const phase=((seconds+index*.37)%3+3)%3;
  return {warning:phase>=1.5&&phase<2.1,active:phase>=2.1,power:phase>=2.1?Math.sin((phase-2.1)/.9*Math.PI):0};
}
export function pressState(seconds,index=0){
  const phase=((seconds+index*.73)%3+3)%3;
  const smooth=t=>t*t*(3-2*t);
  const stroke=phase<2?0:phase<2.2?smooth((phase-2)/.2):phase<2.65?1:1-smooth((phase-2.65)/.35);
  const clock=seconds+index*.73,cycle=Math.floor(clock/3),stamp=cycle*3+2;
  const sample=phase<2?clock:stamp;
  const previous=.335+.2*Math.sin((stamp-3)*1.7+index),moving=.335+.2*Math.sin(sample*1.7+index),blend=smooth(clamp(phase/.6,0,1));
  const lane=previous+(moving-previous)*blend;
  return {warning:phase>=1.2&&phase<2,active:stroke>.9,stroke,lane,width:.85,steam:phase>=2&&phase<2.4};
}
export const heatSpeedMultiplier=heat=>1.4+.4*clamp(heat,0,3)/3;
export const heatDamageRate=heat=>heat>1?(10+5*(clamp(heat,1,3)-1))*2/3:0;
export const heatFlameStrength=heat=>heat>1?.2+.8*(clamp(heat,1,3)-1)/2:0;
const heatDamageIntegral=heat=>heat>1?(10*(heat-1)+2.5*(heat-1)**2)*2/3:0;
export function advanceCircuitHeat(car,onHotLane,dt){
  if(car.eliminated||car.finished)return 0;
  const before=clamp(car.circuitHeat||0,0,3),after=clamp(before+(onHotLane?dt:-dt),0,3);
  car.circuitHeat=after;
  // Integrate through the one-second threshold and the cap exactly, including
  // cooling damage. This avoids timestep-dependent free heat at lane boundaries.
  return Math.abs(heatDamageIntegral(after)-heatDamageIntegral(before))+Math.max(0,dt-Math.abs(after-before))*heatDamageRate(after);
}
// Signed lane ratios make the hazards readable: central lanes stay safe,
// while marked side lanes trade speed against exposure.
export function circuitSurface(id,fraction,lateral,halfWidth,length,seconds,insideSide=1){
  const lane=lateral/halfWidth;
  if(id==='factory'){
    const press=FACTORY_PRESSES.findIndex(f=>circuitDistance(fraction,f,length)<4);
    if(press>=0){const state=pressState(seconds,press);if(Math.abs(lane*insideSide-state.lane)<state.width/2)return {kind:'press',...state};}
    const zone=zoneAt(FACTORY_BELTS,fraction,length),index=FACTORY_BELTS.indexOf(zone);
    if(zone&&Math.abs(lane)>.18&&Math.abs(lane)<.88)return {kind:'belt',flow:Math.sign(lane)*beltDirection(seconds,index)*15};
    const table=FACTORY_TABLES.findIndex(f=>Math.hypot(circuitDistance(fraction,f,length),lateral)<24);
    if(table>=0){const along=(((fraction-FACTORY_TABLES[table]+.5)%1+1)%1-.5)*length,inner=Math.hypot(along,lateral)<11.3;return {kind:'table',spin:FACTORY_ROTOR_SPEED*(table%2?-1:1)*(inner?-1.2:1),along};}
  }
  if(id==='volcano'){
    if(volcanoLavaBounds(fraction,length)?.some(([lo,hi])=>lane>lo&&lane<hi))return {kind:'heat'};
    const vent=VOLCANO_VENTS.findIndex((f,i)=>{const v=volcanoVentSpec(i),along=(((fraction-f+.5)%1+1)%1-.5)*length,across=lateral-v.lane*halfWidth,c=Math.cos(v.yaw),s=Math.sin(v.yaw);return ((along*c+across*s)/(4.5*v.scale))**2+((-along*s+across*c)/2)**2<1;});
    if(vent>=0)return {kind:'vent',...ventState(seconds,vent)};
  }
  return {kind:'road'};
}
export function applyCircuitForces(car,id,road,length,seconds,dt){
  if(!EXTRA_CIRCUITS.includes(id)||car.falling||car.eliminated||car.finished||car.overturned||car.y-road.y>.55)return;
  const lateral=(car.x-road.x)*road.nx+(car.z-road.z)*road.nz;
  const surface=circuitSurface(id,road.fraction,lateral,road.halfWidth,length,seconds,road.insideSide);
  const fx=road.nz,fz=-road.nx;
  car.pressCooldown=Math.max(0,(car.pressCooldown||0)-dt);
  if(surface.kind==='press'&&surface.active&&(car.pressCooldown||0)<=0){car.vx*=.3;car.vz*=.3;car.stun=Math.max(car.stun||0,.35);car.pressCooldown=1.1;}
  if(surface.kind==='belt'){car.vx+=fx*surface.flow*dt;car.vz+=fz*surface.flow*dt;}
  if(surface.kind==='table'){const fore=-surface.spin*lateral,across=surface.spin*surface.along;car.vx+=(fx*fore+road.nx*across)*2.5*dt;car.vz+=(fz*fore+road.nz*across)*2.5*dt;}
  if(surface.kind==='vent'&&surface.active&&surface.power>.35&&(car.ventCooldown||0)<=0){car.vy=8;car.rampFlight=true;car.y=road.y+.08;car.edgeBalance=false;car.ventCooldown=1.1;}
  car.ventCooldown=Math.max(0,(car.ventCooldown||0)-dt);
}

// A longitudinal taper and irregular banks are shared by the visible lava and heat test.
export function volcanoLavaBounds(fraction,length){
  const zone=zoneAt(VOLCANO_HOT,fraction,length);if(!zone)return null;
  const u=(((fraction-zone.fraction+.5)%1+1)%1-.5)*length/zone.length+.5;
  const taper=Math.pow(Math.sin(Math.PI*u),.45),wave=Math.sin(u*29+zone.fraction*47)*.065+Math.sin(u*71)*.025;
  const center=.69+Math.sin(u*11)*.045,width=.36*taper;
  return [[Math.max(.22,center-width+wave),Math.min(.99,center+width+wave*.3)]];
}
export const FACTORY_TIP={fraction:.88,length:30,buttonOffset:26,maxAngle:35*Math.PI/180,dropSeconds:.25,holdSeconds:1.5,riseSeconds:1.55,rearmSeconds:.5};
export const FACTORY_TIPS=[
  {...FACTORY_TIP,stateKey:'factoryTipAt'},
  {...FACTORY_TIP,fraction:.70,buttonOffset:-36,stateKey:'factoryTip2At'},
];
export function factoryTipAt(fraction,length,margin=0){return FACTORY_TIPS.find(tip=>circuitDistance(fraction,tip.fraction,length)<tip.length/2+margin);}
export function factoryTipAngle(seconds,at){
  if(!Number.isFinite(at))return 0;const age=seconds-at;
  const {dropSeconds:drop,holdSeconds:hold,riseSeconds:rise,maxAngle}=FACTORY_TIP;
  if(age<0||age>=drop+hold+rise)return 0;
  if(age<drop)return maxAngle*(age/drop)**2;
  if(age<drop+hold)return maxAngle;
  const u=(age-drop-hold)/rise;return maxAngle*(1-u*u*(3-2*u));
}

// Seeded placement is identical for physics and rendering, including claw yaw.
export function volcanoVentSpec(index){
  const fraction=VOLCANO_VENTS[index];let lane=[-.62,.12,-.38,.08,.61,-.05,.48][index%7];
  if(VOLCANO_HOT.some(z=>Math.abs(fraction-z.fraction)<.065)&&lane>.3)lane=.08;
  return {fraction,lane,yaw:Math.sin(index*2.399+1)*.95,scale:.8+(index%4)*.11,claws:3+index%2};
}
