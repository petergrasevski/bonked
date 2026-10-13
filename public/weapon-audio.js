const variants=prefix=>[0,1,2].map(i=>`${prefix}-${i}`);
// A transient, a body, and a short tail give each weapon its own silhouette.
export const WEAPON_SOUNDS={
  pulse:{samples:['thump'],layer:variants('shield'),gain:.9,layerGain:.38,rate:.72,duration:.8,priority:70},
  rocket:{samples:variants('explosion'),layer:['flame'],gain:.45,layerGain:.5,rate:1.4,duration:.38,priority:60},
  machinegun:{samples:['gunshot'],layer:variants('clank'),gain:.55,layerGain:.32,rate:1.3,duration:.19,priority:35},
  shield:{samples:variants('shield'),gain:.55,rate:.95,duration:.85,priority:45},
  railgun:{samples:variants('rail'),layer:['thump'],gain:.8,layerGain:.55,rate:.8,duration:.75,priority:75},
  mine:{samples:variants('clank'),layer:variants('shield'),gain:.5,layerGain:.12,rate:1.1,duration:.22,priority:30},
  chain:{samples:variants('metal'),layer:variants('clank'),gain:.65,layerGain:.4,rate:.65,duration:.45,priority:40},
  plasma:{samples:variants('plasma'),layer:['thump'],gain:.65,layerGain:.16,rate:.8,duration:.3,priority:40},
  shotgun:{samples:['shotgun'],layer:variants('clank'),gain:.85,layerGain:.35,rate:.88,duration:.72,priority:65},
  flame:{samples:['flame'],gain:.42,rate:.9,loop:true,priority:40},
  taser:{samples:['taser'],gain:.35,rate:1.6,loop:true,priority:40},
  impact:{samples:variants('metal'),gain:.45,rate:1.3,duration:.25,priority:30},
  explosion:{samples:variants('explosion'),layer:['thump'],gain:.95,layerGain:.55,rate:.85,duration:1.2,priority:80},
};
export function soundPosition(source,listener){
  if(!listener)return {volume:0,pan:0};
  const dx=source.x-listener.x,dz=source.z-listener.z,dy=(source.y||0)-(listener.y||0),d=Math.hypot(dx,dy,dz);
  return {volume:Math.max(0,1-d/100)**2,pan:Math.max(-.85,Math.min(.85,(-dx*Math.sin(listener.angle||0)+dz*Math.cos(listener.angle||0))/30))};
}
export function weaponFocus(event,player){
  if(!player||player.eliminated||player.wrecked||player.falling||player.finished)return false;
  const impact=event.kind==='explosion'||event.kind==='impact';
  // A nearby threat matters even when the shared camera has moved away. Ownership
  // alone must not make a distant rocket detonation sound point-blank.
  return impact?Math.hypot(event.x-player.x,(event.y||0)-(player.y||0),event.z-player.z)<18:event.owner===player.id;
}
export class WeaponAudio {
  constructor(context,{bank,mixer,random=Math.random}={}){
    this.context=context;this.bank=bank;this.mixer=mixer;this.random=random;this.seen=new Set();this.loops=new Map();this.voices=new Set();this.lastVariant=new Map();this.room=null;
  }
  choose(names){
    const available=names.filter(name=>this.bank?.get(name));if(!available.length)return null;
    const key=names.join(','),previous=this.lastVariant.get(key),choices=available.length>1?available.filter(name=>name!==previous):available;
    const name=choices[Math.min(choices.length-1,Math.floor(this.random()*choices.length))];this.lastVariant.set(key,name);return name;
  }
  voice(kind,position,{local=false,priority=0}={}){
    const spec=WEAPON_SOUNDS[kind];if(!spec)return null;
    const name=this.choose(spec.samples);if(!name)return null;
    const importance=spec.priority+priority+(local?65:0)+position.volume*20;
    // Reserve room for a short release on stolen voices. Distant small shots yield first.
    const active=[...this.voices].filter(v=>!v.stopped);
    if(this.voices.size>=40)return null;
    if(active.length>=32){const victim=active.filter(v=>!v.loop).sort((a,b)=>a.priority-b.priority)[0];
      if(!victim||victim.priority>=importance)return null;victim.stop();}
    const c=this.context,t=c.currentTime,filter=c.createBiquadFilter(),level=c.createGain(),pan=c.createStereoPanner();
    filter.type='lowpass';filter.frequency.value=local?14000:1600+position.volume*11000;filter.Q.value=.6;
    filter.connect(level);level.connect(pan);pan.connect(this.mixer?.bus('weapons')||c.destination);
    level.gain.value=local?Math.max(.8,position.volume):position.volume;pan.pan.value=position.pan;
    const sources=[],gains=[],rate=spec.rate*(.975+this.random()*.05),voice={kind,loop:!!spec.loop,priority:importance,level,pan,filter,sources,stopped:false};
    const add=(sample,volume)=>{
      const buffer=this.bank.get(sample),source=c.createBufferSource(),gain=c.createGain();source.buffer=buffer;source.loop=!!spec.loop;source.playbackRate.value=rate;
      source.connect(gain);gain.connect(filter);sources.push(source);gains.push(gain);
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(volume*(.95+this.random()*.05),t+.003);
      source.start(t,spec.loop?this.random()*buffer.duration:0);
      if(!spec.loop){const duration=Math.min(spec.duration,buffer.duration/rate);gain.gain.setTargetAtTime(0,t+duration*.55,Math.max(.015,duration*.14));source.stop(t+duration+.025);}
      source.onended=()=>{source.disconnect();gain.disconnect();voice.ended=(voice.ended||0)+1;
        if(voice.ended===sources.length){for(const n of [filter,level,pan])n.disconnect();this.voices.delete(voice);}};
    };
    voice.stop=()=>{if(voice.stopped)return;voice.stopped=true;const at=c.currentTime;
      for(const g of gains){g.gain.cancelScheduledValues(at);g.gain.setTargetAtTime(0,at,.009);}
      for(const s of sources)s.stop(at+.05);
    };
    add(name,spec.gain);const layer=spec.layer&&this.choose(spec.layer);if(layer)add(layer,spec.layerGain);
    this.voices.add(voice);
    if(!spec.loop&&(local||position.volume>.3)&&['explosion','railgun','shotgun','pulse','rocket'].includes(kind))this.mixer?.accent(kind==='explosion'?1:.6);
    return voice;
  }
  update(state,listener,enabled,playerId=null){
    const c=this.context,key=state?`${state.code}:${state.round}`:null;
    if(key!==this.room){this.stop();this.seen.clear();this.room=key;}
    const active=enabled&&state?.phase==='racing',player=state?.players?.find(car=>car.id===playerId);
    // Consume events even while muted/loading, so unlocking audio never replays old shots.
    for(const event of state?.sounds||[]){if(this.seen.has(event.id))continue;this.seen.add(event.id);
      if(active&&state.time-event.at<500){const p=soundPosition(event,listener),local=weaponFocus(event,player);
        if(local||p.volume>.002)this.voice(event.kind,p,{local});}}
    if(this.seen.size>512)this.seen=new Set([...this.seen].slice(-256));
    const wanted=new Set();
    if(active)for(const car of state.players||[]){
      if(!WEAPON_SOUNDS[car.firing]?.loop||car.eliminated||car.wrecked||car.finished)continue;
      const p=soundPosition(car,listener),local=car.id===playerId;if(!local&&p.volume<.002)continue;
      wanted.add(car.id);let v=this.loops.get(car.id);
      if(v?.kind!==car.firing||v.stopped){v?.stop();v=this.voice(car.firing,p,{local});if(v)this.loops.set(car.id,v);else this.loops.delete(car.id);}
      if(v){v.level.gain.setTargetAtTime(local?Math.max(.8,p.volume):p.volume,c.currentTime,.04);v.pan.pan.setTargetAtTime(p.pan,c.currentTime,.04);v.filter.frequency.setTargetAtTime(local?14000:1600+p.volume*11000,c.currentTime,.08);}
    }
    for(const [id,v]of this.loops)if(!wanted.has(id)){v.stop();this.loops.delete(id);}
    if(!active)for(const v of this.voices)v.stop();
  }
  stop(){for(const v of this.voices)v.stop();this.loops.clear();}
}
