import {performance,monitorEventLoopDelay} from 'node:perf_hooks';
import {Samples,NETWORK_VERSION} from './shared/network-timing.js';
const round=x=>Math.round(x*100)/100;
export class ServerDiagnostics{
  constructor(){this.loop=monitorEventLoopDelay({resolution:10});this.loop.enable();this.tickCost=new Samples(2000);this.inputGaps=new Samples(2000);this.ping=new Samples();this.started=performance.now();this.cpu=process.cpuUsage();this.ticks=0;this.droppedMs=0;this.staleInputs=0;this.snapshotBytes=0;this.snapshots=0;this.backpressure=0;this.last={version:NETWORK_VERSION};}
  report(rooms,connections){
    const now=performance.now(),elapsed=now-this.started,cpu=process.cpuUsage(this.cpu);
    this.last={version:NETWORK_VERSION,tickHz:round(this.ticks*1000/elapsed),cpuCores:round((cpu.user+cpu.system)/(elapsed*1000)),eventLoopP95Ms:round(this.loop.percentile(95)/1e6),eventLoopMaxMs:round(this.loop.max/1e6),tickMs:this.tickCost.summary(),inputGapMs:this.inputGaps.summary(),transportRttMs:this.ping.summary(),droppedMs:round(this.droppedMs),staleInputs:this.staleInputs,snapshotKBps:round(this.snapshotBytes/elapsed),snapshots:this.snapshots,backpressure:this.backpressure,rooms:rooms.size,racingRooms:[...rooms.values()].filter(r=>r.phase==='racing').length,players:[...rooms.values()].reduce((n,r)=>n+r.players.size,0),connections:connections.size,rssMB:round(process.memoryUsage().rss/1024/1024)};
    if(connections.size)console.info('[net-server]',JSON.stringify(this.last));
    this.started=now;this.cpu=process.cpuUsage();this.ticks=0;this.droppedMs=0;this.staleInputs=0;this.snapshotBytes=0;this.snapshots=0;this.backpressure=0;this.tickCost.reset();this.inputGaps.reset();this.ping.reset();this.loop.reset();
  }
  client(client,metrics,now){
    if(now-(client.lastReport||0)<9000||!metrics||typeof metrics!=='object')return;client.lastReport=now;
    const safe={};for(const key of ['rttMs','rttMaxMs','gapP95Ms','gapMaxMs','frameP95Ms','correctionP95M','correctionMaxM','replayP95','stalls','hidden','bufferMs','underruns'])if(Number.isFinite(metrics[key])&&metrics[key]>=0&&metrics[key]<=1e7)safe[key]=round(metrics[key]);
    console.info('[net-client]',JSON.stringify({version:NETWORK_VERSION,client:client.diagnosticId,track:client.room?.trackId,phase:client.room?.phase,...safe}));
  }
  close(){this.loop.disable();}
}
