import {soundPosition} from './weapon-audio.js';
import {engineAudible} from './audio.js';

// Listen at the camera's ground target, so the race stays audible after death.
export function raceListener(state,view){
  for(const p of [view,state?.camera])if(Number.isFinite(p?.x)&&Number.isFinite(p?.z))return {x:p.x,y:p.y||0,z:p.z,angle:p.angle||0};
  const cars=state?.players?.filter(c=>!c.eliminated&&!c.falling)||[];
  if(!cars.length)return null;
  return {x:cars.reduce((n,c)=>n+c.x,0)/cars.length,z:cars.reduce((n,c)=>n+c.z,0)/cars.length,angle:cars[0].angle||0};
}
const shifts=[10,17,24,31],ratios=[525,305,218,165,140];
export function engineParameters(car,previousGear=0){
  const speed=Math.hypot(car.vx||0,car.vz||0),forward=(car.vx||0)*Math.cos(car.angle||0)+(car.vz||0)*Math.sin(car.angle||0);
  let gear=previousGear;while(gear<4&&speed>shifts[gear])gear++;while(gear>0&&speed<shifts[gear-1]-2)gear--;
  if(forward<-.5)gear=0;
  const throttle=Math.max(0,Math.min(1,car.input?.reverse?1:car.input?.throttle||0));
  const rpm=Math.min(6700,850+speed*(forward<-.5?340:ratios[gear])+throttle*220);
  return {gear,rpm,load:throttle,speed,shifted:gear!==previousGear};
}
export class EngineAudio{
  constructor(context){
    this.context=context;this.engines=new Map();this.room=null;
    this.master=context.createGain();this.master.gain.value=0;
    this.compressor=context.createDynamicsCompressor();this.compressor.threshold.value=-18;this.compressor.knee.value=12;this.compressor.ratio.value=3;this.compressor.attack.value=.012;this.compressor.release.value=.18;
    this.master.connect(this.compressor);this.compressor.connect(context.destination);
    // Rounded, uneven combustion pulses rather than a raw sawtooth buzz.
    const real=new Float32Array(25),imag=new Float32Array(25);
    for(let h=1;h<25;h++){const amplitude=Math.exp(-h*.24)/Math.sqrt(h)*(h%2?.8:1);real[h]=amplitude*Math.cos(h*.31);imag[h]=amplitude*Math.sin(h*.31);}
    this.wave=context.createPeriodicWave(real,imag);
    this.noise=context.createBuffer(1,context.sampleRate*2,context.sampleRate);const data=this.noise.getChannelData(0);let last=0;
    for(let i=0;i<data.length;i++){last=.82*last+.18*(Math.random()*2-1);data[i]=last*2;}
  }
  create(id){
    const c=this.context,t=c.currentTime,nodes=[],node=type=>{const n=c[type]();nodes.push(n);return n;};
    const exhaust=node('createOscillator'),rumble=node('createOscillator'),intake=node('createBufferSource'),filter=node('createBiquadFilter'),rumbleGain=node('createGain'),airFilter=node('createBiquadFilter'),airGain=node('createGain'),level=node('createGain'),pan=node('createStereoPanner');
    exhaust.setPeriodicWave(this.wave);rumble.type='sine';intake.buffer=this.noise;intake.loop=true;
    filter.type='lowpass';filter.Q.value=.65;airFilter.type='bandpass';airFilter.Q.value=.6;rumbleGain.gain.value=.35;airGain.gain.value=.035;level.gain.value=0;
    exhaust.connect(filter);rumble.connect(rumbleGain);rumbleGain.connect(filter);filter.connect(level);intake.connect(airFilter);airFilter.connect(airGain);airGain.connect(level);level.connect(pan);pan.connect(this.master);
    exhaust.frequency.value=30;rumble.frequency.value=30;filter.frequency.value=500;airFilter.frequency.value=900;
    exhaust.start(t);rumble.start(t);intake.start(t);
    const timbre=1+([...String(id)].reduce((n,ch)=>n+ch.charCodeAt(0),0)%11-5)*.004;
    const engine={gear:0,shiftUntil:0,timbre,exhaust,rumble,filter,airFilter,airGain,level,pan};
    engine.stop=()=>{level.gain.cancelScheduledValues(c.currentTime);level.gain.setTargetAtTime(.00001,c.currentTime,.008);for(const source of [exhaust,rumble,intake])source.stop(c.currentTime+.05);exhaust.onended=()=>nodes.forEach(n=>n.disconnect());};
    return engine;
  }
  update(state,listener,enabled){
    const c=this.context,key=state?`${state.code}:${state.round}`:null;if(this.room!==key){this.stop();this.room=key;}
    const active=enabled&&['countdown','racing'].includes(state?.phase);this.master.gain.setTargetAtTime(active?.8:0,c.currentTime,.025);
    const wanted=new Set();
    if(active)for(const car of state.players){
      if(!engineAudible('racing',car,true,true,true))continue;
      const spatial=soundPosition(car,listener);if(spatial.volume<.003)continue;
      wanted.add(car.id);let e=this.engines.get(car.id);if(!e){e=this.create(car.id);e.gear=engineParameters(car).gear;this.engines.set(car.id,e);}
      const p=engineParameters(car,e.gear);if(p.shifted)e.shiftUntil=c.currentTime+.12;e.gear=p.gear;
      const shift=c.currentTime<e.shiftUntil,load=shift?.2:p.load,rpm=p.rpm*e.timbre;
      e.exhaust.frequency.setTargetAtTime(rpm/30,c.currentTime,shift?.045:.1);
      e.rumble.frequency.setTargetAtTime(rpm/60,c.currentTime,.13);
      e.filter.frequency.setTargetAtTime(320+rpm*.16+load*650,c.currentTime,.08);
      e.airFilter.frequency.setTargetAtTime(420+rpm*.15,c.currentTime,.12);e.airGain.gain.setTargetAtTime(.025+load*.16,c.currentTime,.1);
      e.level.gain.setTargetAtTime(spatial.volume*(.032+load*.024+Math.min(p.speed/36,1)*.013)*(shift?.7:1),c.currentTime,.06);
      e.pan.pan.setTargetAtTime(spatial.pan,c.currentTime,.07);
    }
    for(const[id,e]of this.engines)if(!wanted.has(id)){e.stop();this.engines.delete(id);}
  }
  stop(){for(const e of this.engines.values())e.stop();this.engines.clear();this.master.gain.cancelScheduledValues(this.context.currentTime);this.master.gain.setValueAtTime(0,this.context.currentTime);}
}
