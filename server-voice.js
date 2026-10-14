// A 20 ms microphone stream normally sends 50 frames/second. Allow timing
// variation and a bounded catch-up burst without tearing down duplex audio.
const FRAMES_PER_MS=60/1000, BURST_FRAMES=25;
export class VoiceRelayBudget{
  constructor(now){this.at=now;this.frames=BURST_FRAMES;}
  take(now){
    this.frames=Math.min(BURST_FRAMES,this.frames+Math.max(0,now-this.at)*FRAMES_PER_MS);this.at=Math.max(this.at,now);
    if(this.frames<1)return false;
    this.frames--;return true;
  }
}
