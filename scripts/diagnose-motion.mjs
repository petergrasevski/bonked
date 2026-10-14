// Deterministic timing model using the shipped replay cap and render spring.
// Constant 30 m/s motion isolates timing errors from steering/contact physics.
// This is not a browser/FPS or full physics test. No network requests are made.
import {mkdirSync,writeFileSync} from 'node:fs';
import {RenderCorrections} from '../shared/netcode.js';
import {replayWindow,PREDICTION_GRACE_MS} from '../shared/network-timing.js';
import {selectTrack,trackAt,TRACK_LENGTH,START_FRACTION} from '../shared/game.js';
import {cameraFrame,createChase} from '../shared/chase.js';
selectTrack('ice');
const step=1000/60, speed=30, base=trackAt(.1);
const pose=t=>({id:'a',x:base.x+speed*t/1000,y:base.y,z:base.z,angle:0,vx:speed,vz:0,renderVx:speed,renderVz:0,progress:.1-START_FRACTION+speed*t/1000/TRACK_LENGTH,renderProgress:speed/TRACK_LENGTH});
const scenarios={
  baseline:{},
  uplink_latency_step:{up:t=>t>=3000&&t<8000?180:20},
  uplink_jitter_5s:{up:t=>t>=3000&&t<8000?20+160*(Math.floor((t-3000)/300)%2):20},
  downlink_latency_step:{down:t=>t>=3000&&t<8000?180:20},
  downlink_900ms_gap:{down:t=>t>=4000&&t<4900?4900-t+20:20},
  client_80ms_frames:{frame:t=>t>=3000&&t<8000?80:step},
};
const percentile=(v,p)=>v.slice().sort((a,b)=>a-b)[Math.min(v.length-1,Math.floor(v.length*p))];
function run(profile){
  let inputSeq=0,ack=0,pending=[],inputs=[],packets=[],lastUp=0,lastDown=0,nextFrame=0,lastFrame=0,acc=0,car=pose(0),lastPacket=0,previous=null;
  const spring=new RenderCorrections(),rows=[];let ping=40;
  for(let now=0;now<=11000;now++){
    while(inputs.length&&inputs[0].arrival<=now)ack=inputs.shift().seq;
    // A server simulates once per fixed step with the latest received control;
    // sequence is an acknowledgement of a held input, not elapsed time.
    if(now%50===0){lastDown=Math.max(lastDown,now+(profile.down?.(now)??20));packets.push({arrival:lastDown,time:now,ack});}
    while(packets.length&&packets[0].arrival<=now){
      const p=packets.shift();pending=pending.filter(f=>f.seq>p.ack);
      const replay=replayWindow(pending,ping),old=car;car=pose(p.time+replay.length*step);
      spring.reconcile([old],[car],acc/1000);lastPacket=now;
    }
    if(now>=nextFrame){
      const elapsed=now-lastFrame,dt=Math.min(50,elapsed);lastFrame=now;acc+=dt;
      while(acc>=step){acc-=step;const seq=++inputSeq;lastUp=Math.max(lastUp,now+(profile.up?.(now)??20));inputs.push({seq,arrival:lastUp});if(now-lastPacket<PREDICTION_GRACE_MS){car={...car,x:car.x+speed*step/1000,progress:car.progress+speed*step/1000/TRACK_LENGTH};pending.push({seq});if(pending.length>120)pending.shift();}}
      const displayed=spring.render(car,dt/1000,now-lastPacket<PREDICTION_GRACE_MS?acc/1000:0),camera=cameraFrame(createChase([displayed]),[displayed]);
      if(previous&&now>1000)rows.push({ms:now,frameMs:elapsed,carSpeed:(displayed.x-previous.x)*1000/elapsed,cameraTargetSpeed:(camera.x-previous.cameraX)*1000/elapsed,pending:pending.length});
      previous={x:displayed.x,cameraX:camera.x};nextFrame=now+(profile.frame?.(now)??step);
    }
    // Approximate application ping sampling at the shipped two-second interval.
    if(now%2000===0)ping=(profile.up?.(now)??20)+(profile.down?.(now)??20);
  }
  const values=rows.map(r=>r.carSpeed),cam=rows.map(r=>r.cameraTargetSpeed);
  return {summary:{samples:rows.length,minMps:Math.min(...values),p05Mps:percentile(values,.05),medianMps:percentile(values,.5),p95Mps:percentile(values,.95),maxMps:Math.max(...values),rmsSpeedErrorMps:Math.sqrt(values.reduce((n,v)=>n+(v-speed)**2,0)/values.length),cameraTargetMinMps:Math.min(...cam),cameraTargetMaxMps:Math.max(...cam)},rows};
}
const output=process.argv[2]||'test-results/lag-investigation-2026-10-14/model';mkdirSync(output,{recursive:true});
const results=Object.fromEntries(Object.entries(scenarios).map(([name,profile])=>[name,run(profile)]));
writeFileSync(`${output}/motion.json`,JSON.stringify({description:'Constant-speed timing model; current replay and correction functions; ideal server, FIFO delivery, 30 m/s car; camera target, not final camera pose',results},null,2));
for(const [name,result] of Object.entries(results))console.log(JSON.stringify({name,...result.summary}));
