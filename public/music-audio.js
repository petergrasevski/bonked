// One decoded, gapless loop shared across menu, races and results. Loaded after a gesture.
export class MusicAudio {
  constructor(context,{mixer,fetcher=globalThis.fetch,format='ogg'}={}){
    this.context=context;this.mixer=mixer;this.fetcher=fetcher;this.format=format;
    this.buffer=null;this.loading=null;this.error=null;this.loop=null;this.offset=0;
  }
  load(){
    if(this.buffer)return Promise.resolve(true);if(this.loading)return this.loading;
    this.loading=(async()=>{
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
      try{
        const response=await this.fetcher(`/music/chill-menu.${this.format}`,{signal:abort.signal});
        if(!response.ok)throw new Error(`Music HTTP ${response.status}`);
        this.buffer=await this.context.decodeAudioData(await response.arrayBuffer());this.error=null;return true;
      }catch(error){this.error=error;return false;}finally{clearTimeout(timer);}
    })().finally(()=>{this.loading=null;});return this.loading;
  }
  update(enabled){
    if(!enabled){this.stop();return;}if(!this.buffer||this.loop)return;
    const c=this.context,source=c.createBufferSource(),gain=c.createGain(),at=c.currentTime;
    source.buffer=this.buffer;source.loop=true;source.loopEnd=this.buffer.duration;
    source.connect(gain);gain.connect(this.mixer.bus('music'));gain.gain.setValueAtTime(0,at);
    // Keep the soundtrack below gameplay; leave headroom when both sliders reach 100%.
    gain.gain.setTargetAtTime(.22,at,.12);source.start(at,this.offset%this.buffer.duration);
    this.loop={source,gain,at};source.onended=()=>{source.disconnect();gain.disconnect();};
  }
  stop(){
    if(!this.loop)return;const {source,gain,at}=this.loop,t=this.context.currentTime;
    this.offset=(this.offset+Math.max(0,t-at))%this.buffer.duration;this.loop=null;
    gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(0,t,.012);source.stop(t+.08);
  }
}
