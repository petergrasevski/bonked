import {sampleLoop} from './audio-bank.js';
import {soundPosition} from './weapon-audio.js';
import {desertStormAt,stormCoverage} from '../shared/desert-storm.js';
const clamp=v=>Math.max(0,Math.min(1,v));
export function skidParameters(car,track='coast'){
  const speed=Math.hypot(car.vx||0,car.vz||0),slip=Math.abs(-(car.vx||0)*Math.sin(car.angle||0)+(car.vz||0)*Math.cos(car.angle||0));
  const grounded=!car.eliminated&&!car.finished&&!car.falling&&!car.overturned&&!car.wrecked&&Math.abs((car.y||0)-(car.groundY||0))<.15&&Math.abs(car.roll||0)<.3;
  const strength=grounded&&!car.nudgeMoved&&!(car.nudgeTime>0)?clamp((slip-2.8)/7)*clamp((speed-6)/6):0;
  return {strength:strength*(track==='ice'?.48:1),rate:.86+clamp(speed/45)*.24,cutoff:track==='ice'?2200:track==='desert'?4400:6400};
}
export function ambienceParameters(state,listener){
  const track=state?.trackId||'coast',storm=track==='desert'&&listener?stormCoverage(desertStormAt(state.raceTime||0),listener.x,listener.z):0;
  return {coast:track==='coast'?.32:0,wind:track==='ice'?.35:track==='desert'?.17+.35*storm:.09,cutoff:track==='ice'?4700:track==='desert'?2600+2200*storm:3000};
}
export class RoadAudio {
  constructor(context,{bank,mixer}={}){this.context=context;this.bank=bank;this.mixer=mixer;this.skids=new Map();this.ambience=new Map();this.room=null;}
  create(name,bus,cutoff){
    const c=this.context,filter=c.createBiquadFilter(),pan=c.createStereoPanner();filter.type='lowpass';filter.frequency.value=cutoff;filter.Q.value=.6;
    filter.connect(pan);pan.connect(this.mixer?.bus(bus)||c.destination);
    const loop=sampleLoop(c,this.bank.get(name),filter,{offset:Math.random()*this.bank.get(name).duration});
    loop.source.addEventListener('ended',()=>{filter.disconnect();pan.disconnect();},{once:true});return {...loop,filter,pan};
  }
  update(state,listener,enabled,playerId=null){
    const c=this.context,t=c.currentTime,key=state?`${state.code}:${state.round}:${state.trackId}`:null;
    if(key!==this.room){this.stop();this.room=key;}
    if(!enabled||!['countdown','racing'].includes(state?.phase)||!listener){this.stop();return;}
    const amb=ambienceParameters(state,listener);
    for(const name of ['coast','wind']){
      let loop=this.ambience.get(name);if(!loop&&amb[name]>0&&this.bank.get(name)){loop=this.create(name,'ambience',amb.cutoff);this.ambience.set(name,loop);}
      if(loop){loop.gain.gain.setTargetAtTime(amb[name],t,.6);loop.filter.frequency.setTargetAtTime(amb.cutoff,t,.7);}
    }
    const wanted=new Set();
    if(state.phase==='racing'&&this.bank.get('skid')){
      // Local grip feedback wins; keep no more than three opponents' skids in the mix.
      const candidates=(state.players||[]).map(car=>({car,p:skidParameters(car,state.trackId),spatial:soundPosition(car,listener)}))
        .filter(({p,spatial,car})=>p.strength>.005&&(car.id===playerId||spatial.volume>.01))
        .sort((a,b)=>(b.car.id===playerId?10:0)+b.spatial.volume*b.p.strength-((a.car.id===playerId?10:0)+a.spatial.volume*a.p.strength)).slice(0,4);
      for(const {car,p,spatial}of candidates){wanted.add(car.id);let loop=this.skids.get(car.id);
        if(!loop){loop=this.create('skid','tyres',p.cutoff);this.skids.set(car.id,loop);}
        const local=car.id===playerId,volume=p.strength*(local?.42:spatial.volume*.2);
        loop.gain.gain.setTargetAtTime(volume,t,.065);loop.source.playbackRate.setTargetAtTime(p.rate,t,.1);loop.filter.frequency.setTargetAtTime(p.cutoff,t,.12);loop.pan.pan.setTargetAtTime(spatial.pan,t,.08);
      }
    }
    for(const [id,loop]of this.skids)if(!wanted.has(id)){loop.stop();this.skids.delete(id);}
  }
  stop(){for(const loop of [...this.skids.values(),...this.ambience.values()])loop.stop();this.skids.clear();this.ambience.clear();}
}
