import {randomUUID} from 'node:crypto';
import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {Samples,NETWORK_VERSION} from './shared/network-timing.js';
const round=x=>Math.round(x*100)/100;
export class ServerDiagnostics{
  constructor(){this.loop=monitorEventLoopDelay({resolution:10});this.loop.enable();this.tickCost=new Samples(2000);this.inputGaps=new Samples(2000);this.ping=new Samples();this.applicationPing=new Samples();this.started=performance.now();this.cpu=process.cpuUsage();this.ticks=0;this.droppedMs=0;this.staleInputs=0;this.snapshotBytes=0;this.snapshots=0;this.backpressure=0;this.last={version:NETWORK_VERSION};this.history=[];this.incidents=[];this.lastLog=0;this.incidentTimes=[];}
  report(rooms,connections){
    const now=performance.now(),elapsed=now-this.started,cpu=process.cpuUsage(this.cpu);
    this.last={version:NETWORK_VERSION,at:Date.now(),windowMs:round(elapsed),tickHz:round(this.ticks*1000/elapsed),cpuCores:round((cpu.user+cpu.system)/(elapsed*1000)),eventLoopP95Ms:round(this.loop.percentile(95)/1e6),eventLoopMaxMs:round(this.loop.max/1e6),tickMs:this.tickCost.summary(),inputGapMs:this.inputGaps.summary(),transportHopRttMs:this.ping.summary(),applicationRttMs:this.applicationPing.summary(),droppedMs:round(this.droppedMs),staleInputs:this.staleInputs,snapshotKBps:round(this.snapshotBytes/elapsed),snapshots:this.snapshots,backpressure:this.backpressure,rooms:rooms.size,racingRooms:[...rooms.values()].filter(r=>r.phase==='racing').length,players:[...rooms.values()].reduce((n,r)=>n+r.players.size,0),connections:connections.size,rssMB:round(process.memoryUsage().rss/1024/1024)};
    this.history.push(this.last);this.history=this.history.filter(s=>s.at>=this.last.at-30000).slice(-31);
    if(connections.size&&now-this.lastLog>=10000){console.info('[net-server]',JSON.stringify(this.last));this.lastLog=now;}
    this.started=now;this.cpu=process.cpuUsage();this.ticks=0;this.droppedMs=0;this.staleInputs=0;this.snapshotBytes=0;this.snapshots=0;this.backpressure=0;this.tickCost.reset();this.inputGaps.reset();this.ping.reset();this.applicationPing.reset();this.loop.reset();
  }
  client(client,metrics,now){
    if(now-(client.lastReport||0)<9000||!metrics||typeof metrics!=='object')return;client.lastReport=now;
    const safe={};for(const key of ['rttMs','rttMaxMs','gapP95Ms','gapMaxMs','frameP95Ms','correctionP95M','correctionMaxM','replayP95','stalls','hidden','bufferMs','underruns'])if(Number.isFinite(metrics[key])&&metrics[key]>=0&&metrics[key]<=1e7)safe[key]=round(metrics[key]);
    console.info('[net-client]',JSON.stringify({version:NETWORK_VERSION,client:client.diagnosticId,serverObservedRttMs:client.applicationRttMs,track:client.room?.trackId,phase:client.room?.phase,...safe}));
  }
  incident(client,id,revision,now=Date.now()){
    if(typeof id!=='string'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))return null;
    if(!client.room)return {status:'no-room'};
    if(client.lastIncident?.id===id)return client.lastIncident;
    this.incidentTimes=this.incidentTimes.filter(t=>now-t<60000);
    if(now-(client.lastIncidentAt??-Infinity)<30000||this.incidentTimes.length>=10)return {status:'rate-limited'};
    client.lastIncidentAt=now;this.incidentTimes.push(now);
    client.room.diagnosticId??=randomUUID();
    const capture={status:'captured',id,at:now,revision,client:client.diagnosticId,room:client.room.diagnosticId,track:client.room.trackId,phase:client.room.phase,round:client.room.round,applicationRttMs:client.applicationRttMs,history:this.history.filter(s=>s.at>=now-30000),retention:'Latest 20 incidents in server memory until restart; matching timing samples also written to platform logs.'};
    this.incidents.push(capture);if(this.incidents.length>20)this.incidents.shift();client.lastIncident=capture;
    // Separate bounded lines avoid one large platform log entry being truncated.
    const {history,...marker}=capture;console.info('[lag-incident]',JSON.stringify(marker));
    for(const sample of history)console.info('[lag-server]',JSON.stringify({id,...sample}));
    return capture;
  }
  close(){this.loop.disable();}
}
