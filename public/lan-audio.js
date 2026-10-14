import {AudioBank} from './audio-bank.js';
import {AudioMixer} from './audio-mixer.js';
import {EngineAudio,raceListener} from './engine-audio.js';
import {WeaponAudio} from './weapon-audio.js';
import {RoadAudio} from './road-audio.js';
// Only the shared screen plays sound; phones stay quiet in the same room.
export class LANAudio{
  constructor(){this.muted=false;}
  unlock(){
    if(!this.context){this.context=new(window.AudioContext||window.webkitAudioContext)();this.bank=new AudioBank(this.context);this.mixer=new AudioMixer(this.context);const options={bank:this.bank,mixer:this.mixer};this.engines=new EngineAudio(this.context,options);this.weapons=new WeaponAudio(this.context,options);this.road=new RoadAudio(this.context,options);this.bank.load().catch(()=>{});}
    this.context.resume().catch(()=>{});
  }
  update(state,view,enabled){
    if(!this.context)return;enabled=enabled&&!this.muted;const listener=raceListener(state,view);
    this.engines.update(state,listener,enabled,null);this.weapons.update(state,listener,enabled,null);this.road.update(state,listener,enabled,null);this.mixer.update(enabled);
  }
  stop(){this.engines?.stop();this.weapons?.stop();this.road?.stop();this.mixer?.stop();}
}
