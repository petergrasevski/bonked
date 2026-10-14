import test from 'node:test';
import assert from 'node:assert/strict';
import {PredictionTimeline,PREDICTION_STEP_MS as MS,MAX_REPLAY_TICKS,replayWindow} from '../shared/network-timing.js';
import {RenderCorrections} from '../shared/netcode.js';
import {selectTrack,trackAt,TRACK_LENGTH,START_FRACTION} from '../shared/game.js';
import {cameraFrame,createChase} from '../shared/chase.js';

// Held constant motion isolates timing from legitimate steering/contact changes.
// The legacy branch mirrors packet-count replay; the candidate branch uses the
// same clock, coalescing order, and correction spring as the browser.
function motionRun({hz=60,up=()=>5,down=()=>5,legacy=false,frameInterval}={}){
  selectTrack('ice');const origin=trackAt(.1),velocity=30;
  const pose=tick=>({id:'a',x:origin.x+tick*.5,y:0,z:origin.z,angle:0,vx:30,vz:0,renderVx:30,renderVz:0,progress:.1-START_FRACTION+tick*.5/TRACK_LENGTH,renderProgress:30/TRACK_LENGTH});
  const clock=new PredictionTimeline(),spring=new RenderCorrections();let car=pose(0),seq=0,ack=0,lastUp=0,lastDown=0,nextFrame=0,lastFrame=0,inputAcc=0,pending=[],inputs=[],packets=[],queued=null,lastSnapshot=0,previous=null,previousCamera=null,rtt=10;
  const speeds=[],cameraSpeeds=[],corrections=[];let maxReplay=0;
  function replace(tick,remainder){const old=car;car=pose(tick);corrections.push(Math.abs(old.x-car.x));spring.reconcile([old],[car],remainder);}
  for(let now=0;now<=12000;now++){
    while(inputs.length&&inputs[0].arrival<=now)ack=inputs.shift().seq;
    if(now%50===0){lastDown=Math.max(lastDown,now+down(now));packets.push({arrival:lastDown,tick:now/MS,ack});}
    while(packets.length&&packets[0].arrival<=now){const p=packets.shift();lastSnapshot=now;
      if(legacy){pending=pending.filter(f=>f.seq>p.ack);replace(p.tick+replayWindow(pending,rtt).length,inputAcc/1000);}
      else queued={...p,arrival:now};
    }
    if(now>=nextFrame){
      const elapsed=now-lastFrame;lastFrame=now;inputAcc+=Math.min(50,elapsed);
      while(inputAcc>=MS){inputAcc-=MS;seq++;lastUp=Math.max(lastUp,now+up(now));inputs.push({arrival:lastUp,seq});if(legacy&&now-lastSnapshot<750){car=pose((car.x-origin.x)/.5+1);pending.push({seq,input:{throttle:1}});}}
      if(!legacy){const steps=clock.advance(now,now-lastSnapshot<750);car=pose((car.x-origin.x)/.5+steps);
        for(let tick=clock.tick-steps+1;tick<=clock.tick&&steps>0;tick++)clock.remember(tick,seq,{throttle:1});
        if(queued){clock.observe(queued.tick,'round',queued.arrival,rtt,now);const replay=clock.replay(queued.tick,queued.ack,{throttle:1});maxReplay=Math.max(maxReplay,replay.length);replace(queued.tick+replay.length,clock.remainder);queued=null;}
      }
      const view=spring.render(car,Math.min(250,elapsed)/1000,legacy?inputAcc/1000:clock.remainder),camera=cameraFrame(createChase([view]),[view]);
      if(previous!==null&&now>1500){speeds.push((view.x-previous)*1000/elapsed);cameraSpeeds.push((camera.x-previousCamera)*1000/elapsed);}
      previous=view.x;previousCamera=camera.x;nextFrame=now+(frameInterval?.(now)??1000/hz);
    }
    if(now%2000===0)rtt=up(now)+down(now);
  }
  const rms=a=>Math.sqrt(a.reduce((n,v)=>n+(v-velocity)**2,0)/a.length);
  return {rms:rms(speeds),cameraRms:rms(cameraSpeeds),min:Math.min(...speeds),max:Math.max(...speeds),maxReplay,rebases:clock.rebases};
}

test('stable timeline removes low-ping and five-second uplink jitter speed pulses at 30/60/120Hz',()=>{
 for(const hz of [30,60,120])for(const jitter of [false,true]){
  const profile={hz,up:t=>jitter&&t>=3000&&t<8000?20+160*(Math.floor((t-3000)/300)%2):5};
  const old=motionRun({...profile,legacy:true}),next=motionRun(profile);
  assert.ok(next.rms<.7,JSON.stringify({hz,jitter,old,next}));
  assert.ok(next.rms<Math.max(.01,old.rms*.35),JSON.stringify({hz,jitter,old,next}));
  assert.ok(next.cameraRms<.7);assert.ok(next.min>27&&next.max<33);assert.equal(next.rebases,1);
 }
});
test('downlink jitter and 80ms frames do not turn into sustained slow motion',()=>{
 for(const profile of [{down:t=>t>=3000&&t<8000?20+160*(Math.floor(t/300)%2):5},{frameInterval:t=>t>=3000&&t<8000?80:1000/60}]){
  const next=motionRun(profile);assert.ok(next.rms<.7,JSON.stringify(next));assert.ok(next.maxReplay<=MAX_REPLAY_TICKS);
 }
});
test('acknowledgements retire controls without changing elapsed replay duration',()=>{
 const c=new PredictionTimeline();c.observe(100,'a',1000,100);c.advance(1100);
 c.remember(102,1,{throttle:1,fire:true});c.remember(104,2,{throttle:0});
 const tick=c.tick,first=c.replay(101,0,{throttle:.5});
 assert.equal(first.length,tick-101);assert.equal(first[0].input.fire,true);assert.equal(first.find(f=>f.tick===104).input.throttle,0);
 const second=c.replay(101,1,{throttle:.5,fire:false});assert.equal(second.length,first.length);assert.equal(second[0].input.fire,false);
 const third=c.replay(101,2,{throttle:0});assert.equal(third.length,first.length);assert.ok(third.every(f=>f.input.throttle===0));
});
test('rounds, stale packets, long frame pauses and bounded recovery',()=>{
 const c=new PredictionTimeline();c.observe(100,'a',1000,10);const tick=c.tick;
 assert.equal(c.observe(99,'a',1001,10),false);assert.equal(c.tick,tick);
 assert.equal(c.advance(2000),0);assert.equal(c.suspended,true);
 c.observe(160,'a',2001,10);assert.ok(c.tick>=160);assert.ok(c.replay(160,0,{}).length<=MAX_REPLAY_TICKS);
 c.remember(c.tick,1,{fire:true});c.observe(1,'b',2010,10);assert.equal(c.rebases,1);assert.equal(c.inputs.length,0);assert.ok(c.tick<10);
 for(let t=2020;t<4000;t+=20)c.advance(t);assert.ok(c.tick<=1+MAX_REPLAY_TICKS);
 c.advance(4010,false);c.observe(120,'b',4020,10);assert.ok(c.tick>=120);assert.ok(c.replay(120,0,{}).length<=MAX_REPLAY_TICKS);
});
export {motionRun};

test('recorded incident packet timing cannot move the prediction clock backwards or kick constant-speed cars',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {packets}=JSON.parse(await readFile(new URL('./fixtures/lag-timing.json',import.meta.url),'utf8'));
 for(const hz of [30,60,120]){
  const clock=new PredictionTimeline();let index=0,previous=null,maxError=0;
  for(let now=0;now<packets.at(-1).at;now+=1000/hz){
    const steps=clock.advance(now);const before=clock.tick;
    let latest;while(index<packets.length&&packets[index].at<=now)latest=packets[index++];
    if(latest){clock.observe(latest.tick,'recorded-round',latest.at,6,now);const replay=clock.replay(latest.tick,latest.ack,{});
      if(before!==null)maxError=Math.max(maxError,Math.abs(latest.tick+replay.length-before));
    }
    if(previous!==null)assert.ok(clock.tick+clock.fraction>=previous);
    previous=clock.tick+clock.fraction;
  }
  assert.equal(clock.rebases,1);assert.equal(maxError,0,`no state-time corrections at ${hz}Hz`);
 }
});

test('fractional visual pose survives a recovery rebase of the prediction clock',()=>{
 const smooth=new RenderCorrections(),old={id:'a',x:10,z:0,y:1,angle:0,vx:30,vz:0},next={...old,x:11};
 const before=smooth.render(old,0,.012);smooth.reconcile([old],[next],0,.012);
 assert.ok(Math.abs(smooth.render(next,0,0).x-before.x)<1e-10);
});
