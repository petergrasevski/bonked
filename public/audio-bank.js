// All samples are local CC0 assets. Provenance and processing live in sounds/sources.json.
export const SOUND_FILES = [
  'engine-idle','engine-low','engine-mid','engine-high','coast','wind','skid',
  'gunshot','shotgun','flame','taser','thump','rail-body','elimination','round-end',
  ...['plasma','rail','explosion','shield','metal','clank'].flatMap(kind=>[0,1,2].map(i=>`${kind}-${i}`)),
];
// The shipped effects are PCM16 WAVs. Keep a decoder independent of Safari's
// media service for valid samples rejected by decodeAudioData in a web app.
export function decodePcmWav(context,bytes){
  const view=new DataView(bytes),text=(at,count)=>String.fromCharCode(...new Uint8Array(bytes,at,count));
  if(bytes.byteLength<12||text(0,4)!=='RIFF'||text(8,4)!=='WAVE')throw new Error('Invalid WAV header');
  let format=null,data=null;
  for(let at=12;at+8<=bytes.byteLength;){
    const size=view.getUint32(at+4,true),start=at+8,end=start+size;
    if(end>bytes.byteLength)throw new Error('Truncated WAV chunk');
    if(text(at,4)==='fmt '&&size>=16)format={kind:view.getUint16(start,true),channels:view.getUint16(start+2,true),rate:view.getUint32(start+4,true),align:view.getUint16(start+12,true),bits:view.getUint16(start+14,true)};
    if(text(at,4)==='data')data={start,size};
    at=end+(size%2);
  }
  if(!format||!data||format.kind!==1||format.bits!==16||format.channels<1||format.channels>2||!format.rate||format.align!==format.channels*2||!data.size||data.size%format.align)throw new Error('Unsupported PCM WAV');
  const frames=data.size/format.align,buffer=context.createBuffer(format.channels,frames,format.rate);
  for(let channel=0;channel<format.channels;channel++){
    const samples=buffer.getChannelData(channel);
    for(let frame=0;frame<frames;frame++)samples[frame]=view.getInt16(data.start+frame*format.align+channel*2,true)/32768;
  }
  return buffer;
}
export class AudioBank {
  constructor(context,{fetcher=globalThis.fetch}={}) { this.context=context;this.fetcher=fetcher;this.buffers=new Map();this.errors=new Map();this.decodeFallbacks=new Map();this.loading=null; }
  get(name) { return this.buffers.get(name); }
  // Four requests at a time; decode once and share buffers across all cars/voices.
  load() {
    if(this.loading)return this.loading;
    const pending=SOUND_FILES.filter(name=>!this.buffers.has(name));
    this.loading=(async()=>{
      await Promise.all(Array.from({length:Math.min(4,pending.length)},async()=>{
        while(pending.length){
          const name=pending.shift();
          for(let attempt=0;attempt<2;attempt++){
            const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);let stage='download',retryable=true;
            try{
              const response=await this.fetcher(`/sounds/${name}.wav`,{signal:controller.signal});
              if(!response.ok){retryable=response.status>=500||response.status===408||response.status===429;throw new Error(`HTTP ${response.status}`);}
              const bytes=await response.arrayBuffer();clearTimeout(timer);stage='decode';retryable=false;
              let buffer;
              // Safari may detach the input even when decoding fails.
              try{buffer=await this.context.decodeAudioData(bytes.slice(0));}
              catch(error){buffer=decodePcmWav(this.context,bytes);this.decodeFallbacks.set(name,`${error.name||'Error'}: ${error.message||error}`);}
              this.buffers.set(name,buffer);this.errors.delete(name);break;
            }catch(error){this.errors.set(name,`${stage}: ${error.name||'Error'}: ${error.message||error}`);if(!retryable)break;}
            finally{clearTimeout(timer);}
          }
        }
      }));
      return {loaded:this.buffers.size,failed:[...this.errors.keys()],errors:Object.fromEntries(this.errors),decodeFallbacks:Object.fromEntries(this.decodeFallbacks)};
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
