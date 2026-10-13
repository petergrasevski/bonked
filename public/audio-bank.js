// All samples are local CC0 assets. Provenance and processing live in sounds/sources.json.
export const SOUND_FILES = [
  'engine-idle','engine-low','engine-mid','engine-high','coast','wind','skid',
  'gunshot','shotgun','flame','taser','thump',
  ...['plasma','rail','explosion','shield','metal','clank'].flatMap(kind=>[0,1,2].map(i=>`${kind}-${i}`)),
];
export class AudioBank {
  constructor(context,{fetcher=globalThis.fetch}={}) { this.context=context;this.fetcher=fetcher;this.buffers=new Map();this.errors=new Map();this.loading=null; }
  get(name) { return this.buffers.get(name); }
  // Four requests at a time; decode once and share buffers across all cars/voices.
  load() {
    if(this.loading)return this.loading;
    const pending=SOUND_FILES.filter(name=>!this.buffers.has(name));
    this.loading=(async()=>{
      await Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{
        while(pending.length){
          const name=pending.shift(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
          try{
            const response=await this.fetcher(`/sounds/${name}.wav`,{signal:controller.signal});
            if(!response.ok)throw new Error(`HTTP ${response.status}`);
            const buffer=await this.context.decodeAudioData(await response.arrayBuffer());
            this.buffers.set(name,buffer);this.errors.delete(name);
          }catch(error){this.errors.set(name,String(error.message||error));}
          finally{clearTimeout(timer);}
        }
      }));
      return {loaded:this.buffers.size,failed:[...this.errors.keys()]};
    })().finally(()=>{this.loading=null;});
    return this.loading;
  }
}
export function sampleLoop(context,buffer,destination,{offset=0,rate=1}={}) {
  const source=context.createBufferSource(),gain=context.createGain();
  source.buffer=buffer;source.loop=true;source.playbackRate.value=rate;gain.gain.value=0;
  source.connect(gain);gain.connect(destination);source.start(context.currentTime,offset%buffer.duration);
  let stopped=false;
  return {source,gain,stop(){if(stopped)return;stopped=true;const at=context.currentTime;
    gain.gain.cancelScheduledValues(at);gain.gain.setTargetAtTime(0,at,.012);source.stop(at+.08);
    source.onended=()=>{source.disconnect();gain.disconnect();};
  }};
}
