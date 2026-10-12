// Bounded statistics shared by browser diagnostics and server logs.
export const NETWORK_VERSION='net-v3';
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
