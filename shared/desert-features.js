// One authored layout shared by road physics, scenery, weapons and clients.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const wrap=f=>f-Math.floor(f);
export const DESERT_JUMPS=Object.freeze([.085,.415,.80,.925].map((fraction,id)=>Object.freeze({id:`desert-jump-${id}`,fraction,length:10,height:1.8})));
export const DESERT_MOUNTAIN=Object.freeze({start:.145,ascentEnd:.215,bridgeEnd:.285,end:.395,height:36});
export const DESERT_MOLE_ZONE=Object.freeze({center:.665,length:252,transition:21,halfWidth:15.12});
export const DESERT_NARROW=Object.freeze({start:.872,narrowStart:.902,narrowEnd:.914,end:.983});
export const DESERT_CACTI=Object.freeze([.035,.115,.445,.545,.765,.845,.97].map((fraction,i)=>({fraction,side:i%2?1:-1})));
export const MOLE_CYCLE=6;
function plazaWeight(fraction,trackLength){const z=DESERT_MOLE_ZONE,d=Math.abs(wrap(fraction)-z.center)*trackLength;return 1-smooth((d-z.length/2)/z.transition);}
export function desertElevation(fraction,originalElevation,trackLength){
  const f=wrap(fraction),m=DESERT_MOUNTAIN;
  const mountain=f<m.start||f>m.end?0:f<m.ascentEnd?smooth((f-m.start)/(m.ascentEnd-m.start)):f<=m.bridgeEnd?1:1-smooth((f-m.bridgeEnd)/(m.end-m.bridgeEnd));
  const elevation=originalElevation+(m.height-originalElevation)*mountain;
  return trackLength?elevation*(1-plazaWeight(f,trackLength)):elevation;
}
export function desertHalfWidth(fraction,trackLength){const f=wrap(fraction),n=DESERT_NARROW,t=f<n.start||f>n.end?0:f<n.narrowStart?smooth((f-n.start)/(n.narrowStart-n.start)):f<=n.narrowEnd?1:1-smooth((f-n.narrowEnd)/(n.end-n.narrowEnd));return 9+(DESERT_MOLE_ZONE.halfWidth-9)*plazaWeight(fraction,trackLength)-4.5*t;}
export function desertHasBarrier(fraction){const f=wrap(fraction),m=DESERT_MOUNTAIN;return !(f>=m.start&&f<m.ascentEnd||f>m.bridgeEnd&&f<=m.end);}
export function desertRampLift(fraction,trackLength){
  const f=wrap(fraction);for(const ramp of DESERT_JUMPS){const distance=(ramp.fraction-f)*trackLength;if(distance>=0&&distance<ramp.length)return ramp.height*(1-distance/ramp.length);}return 0;
}
export function desertRampGrade(fraction,trackLength){const f=wrap(fraction),ramp=DESERT_JUMPS.find(r=>{const d=(r.fraction-f)*trackLength;return d>=0&&d<r.length;});return ramp?ramp.height/ramp.length:0;}
export function desertMoles(trackLength){
  const pairs=[[-18,10],[-9,18],[-16,7],[-8,16],[-19,12],[-12,20]];
  // Keep the existing staggered rows, then crowd the inside racing line.
  const rows=9,zone=DESERT_MOLE_ZONE;
  const field=Array.from({length:rows},(_,row)=>pairs[row%pairs.length].map((offset,column)=>({id:`desert-mole-${row}-${column}`,fraction:zone.center+((row+.5)/rows-.5)*zone.length/trackLength,lateral:Math.sign(offset)*Math.max(6,Math.abs(offset)*.7),radius:1.7,height:2.5,phase:(row*1.73+column*2.61)%MOLE_CYCLE}))).flat();
  // Positive lateral is the right/inner side of this bend. The outer line stays
  // less crowded, while two central heads discourage driving straight through.
  const cluster=[[-42,-1],[42,1.5],[-66,14],[-38,10],[-10,15],[18,11],[46,14],[74,10]];
  const moles=field.concat(cluster.map(([distance,lateral],i)=>({id:`desert-mole-cluster-${i}`,fraction:zone.center+distance/trackLength,lateral,radius:1.7,height:2.5,phase:(.85+i*1.37)%MOLE_CYCLE})));
  // Leave the field authored in place; only tuck edge hazards inside the fence.
  return moles.map(m=>({...m,lateral:clamp(m.lateral,-zone.halfWidth+m.radius+.65,zone.halfWidth-m.radius-.65)}));
}
export function moleState(mole,raceSeconds=0){
  const phase=((raceSeconds+(mole.phase||0))%MOLE_CYCLE+MOLE_CYCLE)%MOLE_CYCLE;
  const rise=phase<2.6?0:phase<2.95?smooth((phase-2.6)/.35):phase<4.7?1:phase<5.3?1-smooth((phase-4.7)/.6):0;
  return {rise,warning:phase>=2&&phase<2.6?(phase-2)/.6:0,active:rise>.24};
}
export const moleEmergence=(mole,raceSeconds=0)=>moleState(mole,raceSeconds).rise;
