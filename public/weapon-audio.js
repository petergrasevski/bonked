// Procedural effects: no downloads, one shared audio context, bounded voices.
export const WEAPON_SOUNDS={
  pulse:{type:'sine',from:170,to:35,duration:.65,noise:.12},
  rocket:{type:'sawtooth',from:100,to:35,duration:.45,noise:.8},
  machinegun:{type:'square',from:180,to:65,duration:.065,noise:.8},
  shield:{type:'sine',from:300,to:1150,duration:.65,noise:.03},
  railgun:{type:'sawtooth',from:1800,to:70,duration:.32,noise:.45},
  mine:{type:'triangle',from:680,to:200,duration:.12,noise:.12},
  chain:{type:'square',from:250,to:65,duration:.25,noise:.55},
  plasma:{type:'sine',from:1050,to:150,duration:.22,noise:.08},
  shotgun:{type:'triangle',from:130,to:30,duration:.3,noise:1},
  flame:{type:'sawtooth',from:55,noise:.95,loop:true},
  taser:{type:'sawtooth',from:115,noise:.35,loop:true},
  impact:{type:'triangle',from:240,to:40,duration:.1,noise:.7},
  explosion:{type:'sine',from:90,to:22,duration:.7,noise:1},
};
export function soundPosition(source,listener){
  if(!listener)return {volume:0,pan:0};
  const dx=source.x-listener.x,dz=source.z-listener.z,d=Math.hypot(dx,dz);
  return {volume:Math.max(0,1-d/100)**2,pan:Math.max(-.85,Math.min(.85,(-dx*Math.sin(listener.angle||0)+dz*Math.cos(listener.angle||0))/30))};
}
export class WeaponAudio{
  constructor(context){
    this.context=context;this.seen=new Set();this.loops=new Map();this.voices=new Set();this.room=null;
    this.master=context.createGain();this.master.gain.value=0;this.master.connect(context.destination);
    this.noise=context.createBuffer(1,context.sampleRate,context.sampleRate);
    const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  }
  voice(kind,position){
    const spec=WEAPON_SOUNDS[kind];if(!spec||this.voices.size>=32)return null;
    const ctx=this.context,t=ctx.currentTime,o=ctx.createOscillator(),n=ctx.createBufferSource(),ng=ctx.createGain(),filter=ctx.createBiquadFilter(),envelope=ctx.createGain(),level=ctx.createGain(),pan=ctx.createStereoPanner();
    o.type=spec.type;o.frequency.setValueAtTime(spec.from,t);n.buffer=this.noise;n.loop=true;
    ng.gain.value=spec.noise;filter.type='lowpass';filter.frequency.value=kind==='taser'?4200:kind==='flame'?850:kind==='shield'?1800:6500;
    o.connect(envelope);n.connect(ng);ng.connect(filter);filter.connect(envelope);envelope.connect(level);level.connect(pan);pan.connect(this.master);
    level.gain.value=position.volume;pan.pan.value=position.pan;
    const volume=spec.loop?.035:kind==='machinegun'?.055:.1;
    envelope.gain.setValueAtTime(.0001,t);envelope.gain.exponentialRampToValueAtTime(volume,t+.006);
    const voice={kind,level,pan,stop:()=>{if(voice.stopped)return;voice.stopped=true;const at=ctx.currentTime;envelope.gain.cancelScheduledValues(at);envelope.gain.setTargetAtTime(.0001,at,.008);o.stop(at+.04);n.stop(at+.04);}};
    this.voices.add(voice);o.onended=()=>{for(const node of [o,n,ng,filter,envelope,level,pan])node.disconnect();this.voices.delete(voice);};
    o.start(t);n.start(t);
    if(!spec.loop){o.frequency.exponentialRampToValueAtTime(spec.to,t+spec.duration);envelope.gain.exponentialRampToValueAtTime(.0001,t+spec.duration);o.stop(t+spec.duration+.02);n.stop(t+spec.duration+.02);}
    return voice;
  }
  update(state,listener,enabled){
    const ctx=this.context,key=state?`${state.code}:${state.round}`:null;
    if(key!==this.room){this.stop();this.seen.clear();this.room=key;}
    const active=enabled&&state?.phase==='racing';this.master.gain.setTargetAtTime(active?.65:0,ctx.currentTime,.015);
    // Consume muted events too, so enabling sound never replays old gunfire.
    for(const event of state?.sounds||[]){if(this.seen.has(event.id))continue;this.seen.add(event.id);if(active&&state.time-event.at<500){const p=soundPosition(event,listener);if(p.volume>.002)this.voice(event.kind,p);}}
    if(this.seen.size>512){const latest=[...this.seen].slice(-256);this.seen=new Set(latest);}
    const wanted=new Set();
    if(active)for(const car of state.players){if(!WEAPON_SOUNDS[car.firing]?.loop||car.eliminated)continue;const p=soundPosition(car,listener);if(p.volume<.002)continue;wanted.add(car.id);let voice=this.loops.get(car.id);if(voice?.kind!==car.firing){voice?.stop();voice=this.voice(car.firing,p);if(voice)this.loops.set(car.id,voice);}if(voice){voice.level.gain.setTargetAtTime(p.volume,ctx.currentTime,.04);voice.pan.pan.setTargetAtTime(p.pan,ctx.currentTime,.04);}}
    for(const [id,voice]of this.loops)if(!wanted.has(id)){voice.stop();this.loops.delete(id);}
    if(!active)for(const voice of this.voices)voice.stop();
  }
  stop(){for(const voice of this.voices)voice.stop();this.loops.clear();this.master.gain.setValueAtTime(0,this.context.currentTime);}
}
