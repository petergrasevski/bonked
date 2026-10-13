import {SOUND_FILES} from '../public/audio-bank.js';
export function audioContext(){
  const param=()=>({value:0,events:[],setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.value=v;this.events.push(['linear',v,t]);},exponentialRampToValueAtTime(v){this.value=v;},setTargetAtTime(v,t,tau){this.value=v;this.events.push(['target',v,t,tau]);},cancelScheduledValues(){}});
  const nodes=[];const node=()=>{const listeners={};const n={gain:param(),frequency:param(),playbackRate:param(),pan:param(),Q:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connections:[],connect(other){this.connections.push(other);},disconnect(){this.disconnected=true;},start(...args){this.started=args;},stop(t){this.stopped=true;this.stopAt=t;},addEventListener(name,fn){listeners[name]=fn;},end(){this.onended?.();listeners.ended?.();}};nodes.push(n);return n;};
  return {nodes,currentTime:0,sampleRate:48000,destination:{},createGain:node,createDynamicsCompressor:node,createWaveShaper:node,createBufferSource:node,createBiquadFilter:node,createStereoPanner:node,decodeAudioData:async()=>({duration:2})};
}
export function audioBank(){const buffers=new Map(SOUND_FILES.map(name=>[name,{duration:2,name}]));return {buffers,get:name=>buffers.get(name)};}
