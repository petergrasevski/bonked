// 16 kHz mono PCM, 20 ms packets. Separate per-speaker jitter buffers prevent
// a delayed speaker from delaying everybody else. No local microphone playback.
class PartyProcessor extends AudioWorkletProcessor {
  constructor(){
    super();this.muted=true;this.packet=new Int16Array(320);this.at=0;this.phase=0;this.sum=0;this.count=0;this.speakers=new Map();
    this.port.onmessage=({data})=>{
      if(data.type==='mute'){this.muted=data.muted;this.at=0;return;}
      if(data.type==='clear'){this.speakers.clear();return;}
      if(data.type!=='audio')return;
      let speaker=this.speakers.get(data.id);
      if(!speaker){speaker={ring:new Float32Array(8192),read:0,write:0,playing:false};this.speakers.set(data.id,speaker);}
      const pcm=new Int16Array(data.pcm);
      if(speaker.write-speaker.read>2560){speaker.read=speaker.write-640;speaker.playing=false;}
      for(const sample of pcm)speaker.ring[speaker.write++%8192]=sample/32768;
    };
  }
  process(inputs,outputs){
    const input=inputs[0]?.[0],output=outputs[0][0],ratio=16000/sampleRate;
    for(let i=0;i<output.length;i++){
      if(!this.muted&&input){
        this.sum+=input[i];this.count++;this.phase+=ratio;
        if(this.phase>=1){this.phase-=1;this.packet[this.at++]=Math.max(-32768,Math.min(32767,Math.round(this.sum/this.count*32767)));this.sum=0;this.count=0;
          if(this.at===320){const buffer=this.packet.buffer;this.port.postMessage({type:'packet',buffer},[buffer]);this.packet=new Int16Array(320);this.at=0;}
        }
      }
      let mixed=0;
      for(const speaker of this.speakers.values()){
        if(!speaker.playing&&speaker.write-speaker.read>=960)speaker.playing=true;
        if(!speaker.playing)continue;
        if(speaker.write-speaker.read<2){speaker.playing=false;continue;}
        const at=Math.floor(speaker.read),f=speaker.read-at;
        mixed+=speaker.ring[at%8192]*(1-f)+speaker.ring[(at+1)%8192]*f;speaker.read+=ratio;
      }
      output[i]=Math.max(-1,Math.min(1,mixed*.8));
    }
    return true;
  }
}
registerProcessor('party-voice',PartyProcessor);
