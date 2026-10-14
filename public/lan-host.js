import {LanPeer,LanSignalingClient,LAN_CONNECTION_HELP} from './lan-peer.js';

// WebSocket-shaped adapter lets the existing display/lobby use the same messages.
export class LanHostSocket extends EventTarget {
  constructor({revision,onStatus=()=>{}}){
    super();this.readyState=1;this.bufferedAmount=0;this.peers=new Map();this.revision=revision;this.onStatus=onStatus;this.created=false;
    this.worker=new Worker(new URL('./lan-worker.js',import.meta.url),{type:'module'});
    this.worker.onerror=()=>this.emit({type:'error',message:'Could not start the local game engine. Reload and try again.'});
    this.worker.onmessage=({data})=>{
      if(data.type==='ready'){this.emit({type:'welcome',id:'lan-display',code:this.code,mode:'lan',seq:0});return;}
      if(data.type==='snapshot'){
        this.emit(data.state);
        if(data.controllers!==false){const s=data.state;const status={type:'state',code:s.code,trackId:s.trackId,phase:s.phase,time:s.time,startAt:s.startAt,round:s.round,tournamentComplete:s.tournamentComplete,tournamentWinnerId:s.tournamentWinnerId,roundResults:s.roundResults,targetScore:s.targetScore,nextRoundAt:s.nextRoundAt,camera:s.camera,players:s.players.map(p=>({id:p.id,name:p.name,color:p.color,health:p.health,item:p.item,ammo:p.ammo,shield:p.shield,score:p.score,ready:p.ready,eliminated:p.eliminated,finished:p.finished,wrecked:p.wrecked,overturned:p.overturned,nudgeCooldown:p.nudgeCooldown,skyTarget:p.skyTarget,skyCooldownUntil:p.skyCooldownUntil}))};for(const {peer}of this.peers.values())peer.send(status);}
      }else if(data.type==='deliver'){if(data.id==='lan-display')this.emit(data.message);else this.peers.get(data.id)?.peer.send(data.message);}
    };
    this.signaling=new LanSignalingClient({onMessage:msg=>this.receive(msg),onStatus:status=>{onStatus(status==='online'?'Setup server connected':status==='replaced'?'Host opened in another tab':'Setup server reconnecting; connected controllers can keep playing');if(status==='replaced')this.close();}});
    this.statsTimer=setInterval(()=>{for(const [id,{peer}]of this.peers)if(peer.opened)peer.stats().then(stats=>onStatus('Connected over local Wi-Fi',id,stats?.currentRoundTripTime!=null?Math.round(stats.currentRoundTripTime*1000):null)).catch(()=>{});},2000);
  }
  emit(message){if(this.readyState===1)this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(message)}));}
  receive(msg){
    if(msg.type==='lan-welcome'){
      this.code=msg.code;if(!this.created){this.created=true;this.worker.postMessage({type:'create',code:msg.code});}return;
    }
    if(msg.type==='error'){this.emit(msg);return;}
    if(msg.type==='lan-ended'){this.emit({type:'error',message:msg.message});this.close();return;}
    if(msg.type==='lan-peer'){
      const existing=this.peers.get(msg.id);if(existing?.generation===msg.generation)return;
      existing?.peer.close();
      const record={name:msg.name,generation:msg.generation};
      record.peer=new LanPeer({initiator:true,
        signal:signal=>this.signaling.send({type:'lan-signal',to:msg.id,generation:msg.generation,signal}),
        onOpen:()=>{if(this.peers.get(msg.id)!==record)return;this.worker.postMessage({type:'peer-open',id:msg.id,name:msg.name});this.onStatus('Connected over local Wi-Fi',msg.id);},
        onMessage:message=>{if(this.peers.get(msg.id)!==record)return;if(!['input','item','ping','ready','leave'].includes(message.type))return;this.worker.postMessage({type:'command',id:msg.id,message});},
        onClose:()=>{if(this.peers.get(msg.id)!==record)return;this.worker.postMessage({type:'peer-close',id:msg.id});this.onStatus('Disconnected · retry on phone',msg.id);},
        onStatus:status=>{if(['timeout','failed'].includes(status))this.onStatus('Could not connect. '+LAN_CONNECTION_HELP,msg.id);},
      });this.peers.set(msg.id,record);this.onStatus('Connecting…',msg.id);return;
    }
    if(msg.type==='lan-peer-left'){const record=this.peers.get(msg.id);this.peers.delete(msg.id);record?.peer.close();this.worker.postMessage({type:'peer-left',id:msg.id});this.onStatus('Left party',msg.id);return;}
    if(msg.type==='lan-signal'){const record=this.peers.get(msg.from);if(record?.generation===msg.generation)record.peer.receive(msg.signal);}
  }
  send(encoded){const message=JSON.parse(encoded);if(message.type==='create'){this.signaling.start({type:'lan-create',revision:this.revision});return;}if(message.type==='leave'){this.close();return;}this.worker.postMessage({type:'command',id:'lan-display',message});}
  close(){if(this.readyState===3)return;this.readyState=3;clearInterval(this.statsTimer);this.signaling.close();for(const {peer}of this.peers.values())peer.close();this.peers.clear();this.worker.terminate();this.dispatchEvent(new Event('close'));}
}
