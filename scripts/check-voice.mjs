// Investigates PCM relay, timing, reconnects and playback without using a microphone.
// node scripts/check-voice.mjs --local 30 /tmp/voice-local
// node scripts/check-voice.mjs https://bonked.fly.dev 300 /tmp/voice-public
import {WebSocket} from 'ws';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import vm from 'node:vm';
import {readFileSync,mkdirSync,appendFileSync,writeFileSync} from 'node:fs';
import {selectTrack,BOOST_PADS} from '../shared/game.js';
import {botControls} from '../bots.js';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import assert from 'node:assert/strict';

const local=process.argv[2]==='--local',url=new URL(local?'http://127.0.0.1:33391':process.argv[2]);
const seconds=Number(process.argv[3]||60),output=process.argv[4]||'/tmp/voice-check';mkdirSync(output,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const p95=a=>a.length?a.slice().sort((a,b)=>a-b)[Math.floor(a.length*.95)]:0;
const log=(kind,event)=>{const row={at:new Date().toISOString(),kind,...event};appendFileSync(`${output}/events.jsonl`,JSON.stringify(row)+'\n');if(kind!=='diagnostic')console.log(JSON.stringify(row));};
const rooms=[],clients=[],closes=[],diagnostics=[],windows=[];let proc,ending=false,timer,reportTimer,started,phase='setup';
const loop=monitorEventLoopDelay({resolution:10});loop.enable();
const totals={sent:0,received:0,missing:0,crossRoom:0,echoes:0,invalid:0};
let gaps=[],rtts=[],windowSent=0,windowReceived=0;
async function until(fn,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await pause(10);}throw Error('Timed out');}
async function game(room,index){
  const ws=new WebSocket(`${url.protocol==='https:'?'wss:':'ws:'}//${url.host}/ws`,{origin:url.origin,perMessageDeflate:true});
  const c={ws,room,index,number:clients.length,seq:0,audioSeq:0,received:new Map(),voiceWanted:false,send:m=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m));}};clients.push(c);room.clients.push(c);
  ws.on('error',e=>log('game-error',{client:c.number,message:e.message}));
  ws.on('close',(code,reason)=>{if(!ending)log('game-close',{client:c.number,code,reason:String(reason)});});
  ws.on('message',data=>{const m=JSON.parse(data);if(m.type==='welcome'){c.id=m.id;c.token=m.token;}
    if(m.type==='state'){c.state=m;if(index===0){if(room.state?.phase==='racing'&&m.phase==='countdown')for(const d of room.drivers.values())d.botState=null;room.state=m;for(const p of m.players){let d=room.drivers.get(p.id);if(!d){d={id:p.id};room.drivers.set(p.id,d);}d.car=p;d.fireLatch=p.fireLatch;}}}
    if(m.type==='server-ping')c.send({type:'server-pong',id:m.id});
    if(m.type==='pong'){rtts.push(Date.now()-m.sent);if(c.number===0){diagnostics.push({at:new Date().toISOString(),phase,...m.diagnostics});log('diagnostic',diagnostics.at(-1));}}
    if(m.type==='error')log('game-error',{client:c.number,message:m.message});
  });
  await until(()=>ws.readyState===WebSocket.OPEN);
  c.send(index===0?{type:'create',trackId:room.track,name:`Voice test ${room.track} 1`}:{type:'join',code:room.state.code,name:`Voice test ${room.track} ${index+1}`});
  await until(()=>c.id&&c.state);return c;
}
async function voice(c,retry=false){
  const ws=new WebSocket(`${url.protocol==='https:'?'wss:':'ws:'}//${url.host}/voice`,{origin:url.origin,perMessageDeflate:false,closeTimeout:1000});c.voice=ws;c.ready=false;c.voiceWanted=retry;
  ws.on('error',e=>{if(!ending)log('voice-error',{client:c.number,message:e.message});});
  ws.on('message',(data,binary)=>{
    if(!binary){if(JSON.parse(data).type==='ready'&&c.voice===ws)c.ready=true;return;}
    if(data.length!==641){totals.invalid++;return;}
    const seq=data.readUInt32LE(1),sender=data[5],peer=clients[sender];
    if(!peer||peer.room!==c.room){totals.crossRoom++;return;}if(peer===c){totals.echoes++;return;}
    const last=c.received.get(sender);if(last){gaps.push(performance.now()-last.at);if(seq>last.seq+1)totals.missing+=seq-last.seq-1;}
    c.received.set(sender,{seq,at:performance.now()});totals.received++;windowReceived++;
  });
  ws.on('close',(code,reason)=>{if(c.voice!==ws)return;c.ready=false;if(!ending){const event={client:c.number,phase,code,reason:String(reason)};closes.push(event);log('voice-close',event);}
    if(c.voiceWanted&&!ending)c.retry=setTimeout(()=>voice(c,true).catch(e=>log('reconnect-error',{message:e.message})),1500);
  });
  await until(()=>ws.readyState===WebSocket.OPEN);ws.send(JSON.stringify({type:'join',code:c.room.state.code,token:c.token}));await until(()=>c.ready);return ws;
}
function packet(c){const data=Buffer.alloc(640,64);data.writeUInt32LE(++c.audioSeq,0);data[4]=c.number;return data;}
function sendAudio(c,data=packet(c)){if(c.ready&&c.voice?.readyState===WebSocket.OPEN){c.voice.send(data);totals.sent++;windowSent++;}}
function controls(){const now=Date.now();for(const room of rooms){const s=room.state;if(!s)continue;selectTrack(room.track);const simulation={...s,players:room.drivers,boostPads:s.boostPads.map(p=>({...BOOST_PADS.find(b=>b.id===p.id),...p}))};
  for(const c of room.clients){const p=room.drivers.get(c.id);if(p)c.send({type:'input',seq:++c.seq,...(s.phase==='racing'?botControls(simulation,p,now):{throttle:1,steer:0})});}
  if((s.phase==='finished'||(s.phase==='racing'&&s.raceTime>12&&s.players.filter(p=>!p.eliminated&&!p.finished).length<4))&&now-room.lastRestart>5000){room.lastRestart=now;room.clients[0].send({type:'lobby'});room.clients[0].send({type:'start'});}
}}
function report(){const row={phase,elapsedSeconds:(Date.now()-started)/1000,sent:windowSent,received:windowReceived,fanout:windowSent?windowReceived/windowSent:0,gapP95Ms:p95(gaps),gapMaxMs:gaps.length?Math.max(...gaps):0,rttP95Ms:p95(rtts),generatorLoopP95Ms:loop.percentile(95)/1e6,generatorLoopMaxMs:loop.max/1e6,activeVoiceSockets:clients.filter(c=>c.ready).length,unexpectedCloses:closes.filter(c=>c.phase==='baseline').length,server:diagnostics.at(-1)};windows.push(row);log('window',row);gaps=[];rtts=[];windowSent=0;windowReceived=0;loop.reset();}

// Run the actual AudioWorklet source, feeding a constant nonzero test tone.
function playback(sampleRate,holdMs){
  let Processor;const scope={sampleRate,AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},registerProcessor:(name,p)=>{Processor=p;}};
  vm.runInNewContext(readFileSync(new URL('../public/voice-worklet.js',import.meta.url),'utf8'),scope);
  const p=new Processor(),tone=new Int16Array(320).fill(16000),events=[];let lastDelivery=0;
  for(let time=0;time<4000;time+=20){const delivered=time>=1000&&time<1000+holdMs?1000+holdMs:time;lastDelivery=Math.max(lastDelivery,delivered);events.push(lastDelivery);}
  const quantum=128/sampleRate*1000,out=[[new Float32Array(128)]],input=[[]];let next=0,silent=0,silentRun=0,maxSilentRun=0,discarded=0;
  for(let time=0;time<4000;time+=quantum){while(next<events.length&&events[next]<=time){const before=p.speakers.get(0)?.read||0;p.port.onmessage({data:{type:'audio',id:0,pcm:tone.buffer}});discarded+=Math.max(0,(p.speakers.get(0)?.read||0)-before);next++;}p.process(input,out);
    if(time>100){for(const value of out[0][0]){if(value===0){silent++;silentRun++;maxSilentRun=Math.max(maxSilentRun,silentRun);}else silentRun=0;}}
  }
  return {sampleRate,networkHoldMs:holdMs,silentMsAfterStartup:silent/sampleRate*1000,maxSilenceMs:maxSilentRun/sampleRate*1000,discardedBufferedMs:discarded/16};
}
const playbackResults=[44100,48000].flatMap(rate=>[0,40,100,250,500].map(hold=>playback(rate,hold)));
try{
  for(const r of playbackResults)log('playback',r);
  if(local){proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(url.port)},stdio:['ignore','pipe','pipe']});proc.stdout.on('data',data=>appendFileSync(`${output}/local-server.log`,data));proc.stderr.on('data',data=>appendFileSync(`${output}/local-server.log`,data));await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('Local server failed');})]);}
  log('health',{health:await fetch(new URL('/health',url)).then(r=>r.json())});
  for(const track of ['coast','ice','desert']){const room={track,clients:[],drivers:new Map(),lastRestart:Date.now()};rooms.push(room);for(let i=0;i<6;i++)await game(room,i);}
  for(const c of clients)await voice(c,true);
  for(const room of rooms)room.clients[0].send({type:'start'});
  started=Date.now();phase='baseline';timer=setInterval(controls,1000/60);reportTimer=setInterval(report,10000);
  // All eighteen clients speak continuously, each at the browser's 50 Hz rate.
  const audio=setInterval(()=>{for(const c of clients)sendAudio(c);},20);
  try{while(Date.now()-started<seconds*1000){for(const c of clients)c.send({type:'ping',sent:Date.now()});await pause(1000);}}finally{clearInterval(audio);clearInterval(reportTimer);}
  for(const c of clients){c.voiceWanted=false;clearTimeout(c.retry);}await pause(300);report();const baselineTotals={...totals};
  // A delayed stream is released in order, then continues at its normal 50 Hz.
  // Waiting past one second before release makes the limiter window deterministic.
  const burstResults=[];phase='coalescing';
  for(const holdMs of [100,250,500,1000,2000]){
    const c=clients[0];c.voice?.close();await pause(100);const ws=await voice(c,false);let closed=null;ws.once('close',(code,reason)=>{closed={code,reason:String(reason)};});
    const batch=[];await pause(1100);for(let t=0;t<holdMs;t+=20){batch.push(packet(c));await pause(20);}
    for(const frame of batch)sendAudio(c,frame);const start=Date.now();const interval=setInterval(()=>sendAudio(c),20);
    await pause(1100);clearInterval(interval);const stateAfterSending=ws.readyState;
    // Observe the close handshake too: a proxy can leave a rejected socket in
    // CLOSING after transmission has stopped, before the close event is emitted.
    await pause(1500);let recoveredSameSocket=false,incomingWorks=false;
    if(ws.readyState===WebSocket.OPEN){
      const peer=c.room.clients[1],fresh=packet(c);sendAudio(c,fresh);
      try{await until(()=>peer.received.get(c.number)?.seq===c.audioSeq,1500);recoveredSameSocket=true;}catch{}
      const incoming=packet(peer);sendAudio(peer,incoming);
      try{await until(()=>c.received.get(peer.number)?.seq===peer.audioSeq,1500);incomingWorks=true;}catch{}
    }
    burstResults.push({holdMs,bufferedPackets:batch.length,stateAfterSending,closed,recoveredSameSocket,incomingWorks,elapsedMs:Date.now()-start});log('coalescing',burstResults.at(-1));
  }
  writeFileSync(`${output}/summary.json`,JSON.stringify({url:url.origin,baselineSeconds:seconds,startedAt:new Date(started).toISOString(),finishedAt:new Date().toISOString(),baselineTotals,totals,baselineCloses:closes.filter(c=>c.phase==='baseline'),burstResults,playbackResults,windows,diagnostics},null,2));
  if(process.argv.includes('--expect-recovery')){
    assert.equal(closes.filter(c=>c.phase==='baseline').length,0,'steady voice must stay connected');
    for(const r of burstResults){assert.equal(r.closed,null,`connection survives ${r.holdMs} ms catch-up`);assert.equal(r.recoveredSameSocket,true,'sending recovers');assert.equal(r.incomingWorks,true,'listening stays available');}
  }
}catch(e){log('fatal',{message:e.message});process.exitCode=1;}finally{
  ending=true;clearInterval(timer);clearInterval(reportTimer);loop.disable();for(const c of clients){c.voiceWanted=false;clearTimeout(c.retry);c.send({type:'leave'});c.voice?.close();c.ws.close();}await pause(1000);for(const c of clients){c.voice?.terminate();c.ws.terminate();}proc?.kill();console.log(JSON.stringify({summary:`${output}/summary.json`}));
}
