// Bounded statistics shared by browser diagnostics and server logs.
export const NETWORK_VERSION='net-v4';
export const PREDICTION_GRACE_MS=750;
export const INPUT_TIMEOUT_MS=1000;
export class Samples{
  constructor(limit=1200){this.limit=limit;this.values=[];}
  add(value){if(Number.isFinite(value)&&value>=0){if(this.values.length===this.limit)this.values.shift();this.values.push(value);}}
  summary(){const v=this.values.slice().sort((a,b)=>a-b),round=x=>Math.round((x||0)*100)/100;return {count:v.length,p50:round(v[Math.floor(v.length*.5)]),p95:round(v[Math.floor(v.length*.95)]),max:round(v.at(-1))};}
  reset(){this.values.length=0;}
}
// Input acknowledgements identify the latest held control, not a promise that
// the server simulated every packet. Bound replay so delayed acks cannot cause
// seconds of speculative motion (or an expensive replay spiral).
export function replayWindow(pending,rtt=100){return pending.slice(-Math.ceil((Math.min(500,Math.max(100,rtt))+100)/(1000/60)));}

export const PREDICTION_STEP_MS=1000/60;
export const MAX_REPLAY_TICKS=45;
// One monotonic presentation clock for the complete predicted fleet. Snapshot
// arrival and input acknowledgement never determine how many ticks time advances.
export class PredictionTimeline{
  constructor(){this.reset();}
  reset(){this.key=null;this.tick=null;this.fraction=0;this.lastFrame=null;this.latestTick=0;this.arrivals=[];this.inputs=[];this.rtts=[];this.suspended=false;this.rate=1;this.rebases=0;}
  observe(serverTick,key,receivedAt,rtt=0,now=receivedAt){
    if(this.key!==key){this.reset();this.key=key;}
    if(serverTick<this.latestTick)return false;
    this.latestTick=serverTick;
    this.arrivals.push({at:now,offset:receivedAt-serverTick*PREDICTION_STEP_MS});
    this.arrivals=this.arrivals.filter(s=>now-s.at<=10000).slice(-220);
    if(Number.isFinite(rtt)&&rtt>0)this.rtts.push({at:now,value:Math.min(500,rtt)});
    this.rtts=this.rtts.filter(s=>now-s.at<=10000).slice(-220);
    this.offset=Math.min(...this.arrivals.map(s=>s.offset));
    this.halfRtt=this.rtts.length?Math.min(...this.rtts.map(s=>s.value))/2:0;
    // Two ticks of headroom absorb fixed-step/publish scheduling quantization.
    // Rebase only on entry/recovery or when authority is outside the replay bound.
    if(this.tick===null||this.suspended||this.tick<serverTick||this.tick-serverTick>MAX_REPLAY_TICKS){
      this.arrivals=[{at:now,offset:receivedAt-serverTick*PREDICTION_STEP_MS}];this.offset=this.arrivals[0].offset;
      this.tick=serverTick+Math.min(17,Math.floor((this.halfRtt+Math.max(0,now-receivedAt))/PREDICTION_STEP_MS)+2);
      this.fraction=0;this.lastFrame=now;this.inputs=[];this.suspended=false;this.rate=1;this.rebases++;
    }
    return true;
  }
  advance(now,active=true){
    const elapsed=this.lastFrame===null?0:Math.max(0,now-this.lastFrame);this.lastFrame=now;
    if(!active||elapsed>250){this.suspended=true;return 0;}
    if(this.tick===null||this.suspended)return 0;
    const desired=(now-this.offset+this.halfRtt)/PREDICTION_STEP_MS+2,error=desired-this.tick-this.fraction;
    this.rate=Math.abs(error)<.5?1:1+Math.max(-.02,Math.min(.02,error*.01));
    const advance=this.fraction+elapsed/PREDICTION_STEP_MS*this.rate;
    const steps=Math.min(Math.floor(advance+1e-9),Math.max(0,this.latestTick+MAX_REPLAY_TICKS-this.tick));
    this.tick+=steps;this.fraction=Math.min(.999999,Math.max(0,advance-steps));
    return steps;
  }
  remember(tick,seq,input){this.inputs.push({tick,seq,input:{...input}});if(this.inputs.length>180)this.inputs.shift();}
  replay(serverTick,ack,authorityInput){
    // Acknowledged controls may already have fired a one-shot action. Retire
    // them, then hold authority's input until an outstanding control takes over.
    this.inputs=this.inputs.filter(f=>f.seq>ack&&f.tick>this.tick-180);
    const replay=[];let index=0,held=authorityInput;
    for(let tick=serverTick+1;tick<=this.tick;tick++){
      while(index<this.inputs.length&&this.inputs[index].tick<=tick)held=this.inputs[index++].input;
      replay.push({tick,input:held});
    }
    return replay;
  }
  get remainder(){return this.fraction*PREDICTION_STEP_MS/1000;}
}
