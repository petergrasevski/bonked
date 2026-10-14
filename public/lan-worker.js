import {createRoomEngine} from '/shared/room-engine.js';
import {STEP,NEUTRAL,TRACKS,MAX_PLAYERS,selectTrack,getLandscape} from '/shared/game.js';
import {skySurfaces} from '/shared/sky-ground.js';

let room=null,previous=performance.now(),accumulator=0,tick=0;
const deliver=(id,message)=>postMessage({type:'deliver',id,message});
const engine=createRoomEngine({
  send:(connection,message)=>connection?.send(message),
  broadcast:(r,message)=>postMessage({type:'snapshot',state:{...message,mode:'lan'}}),
  onEmpty:r=>engine.publish(r),
});
function closePeer(id){const p=room?.players.get(id);if(p){p.ws=null;p.input={...NEUTRAL};p.disconnectedAt=Date.now();engine.publish(room);}}
onmessage=({data})=>{
  const {type,id}=data;
  if(type==='create'){
    for(const track of Object.keys(TRACKS)){selectTrack(track);getLandscape();skySurfaces();}
    room={code:data.code,host:'lan-display',trackId:'coast',players:new Map()};engine.resetRoom(room,{newTournament:true});
    previous=performance.now();accumulator=0;
    postMessage({type:'ready'});engine.publish(room);return;
  }
  if(!room)return;
  if(type==='peer-open'){
    const connection={readyState:1,send:message=>deliver(id,message)};
    let player=room.players.get(id);
    if(!player){
      if(room.phase!=='lobby')return deliver(id,{type:'error',message:'This race has started. Join after it finishes.'});
      if(room.players.size>=MAX_PLAYERS)return deliver(id,{type:'error',message:'The grid is full.'});
      player=engine.addPlayer(room,connection,data.name);room.players.delete(player.id);player.id=id;room.players.set(id,player);
    }else{player.ws=connection;player.disconnectedAt=null;player.input={...NEUTRAL};player.lastInput=Date.now();}
    deliver(id,{type:'welcome',id,code:room.code,seq:player.seq});engine.publish(room);return;
  }
  if(type==='peer-close'){closePeer(id);return;}
  if(type==='peer-left'){const p=room.players.get(id);if(p)engine.removePlayer(room,p);return;}
  if(type!=='command')return;
  const msg=data.message,player=id==='lan-display'?{id}:room.players.get(id);
  if(!player||!msg||typeof msg!=='object')return;
  if(id==='lan-display'&&!['ping','start','rematch','lobby','track','bot','remove-bot','reset-scores'].includes(msg.type))return;
  if(id==='lan-display'&&['start','rematch'].includes(msg.type)&&!room.players.size)return deliver(id,{type:'error',message:'Connect a phone or add a bot first.'});
  // Connection-side checks protect the shared engine from unbounded input traffic.
  if(id!=='lan-display'){
    if(!player.ws)return;
    const now=Date.now();if(now-(player.budgetAt||0)>1000){player.budgetAt=now;player.budget=0;}
    if((player.budget=(player.budget||0)+1)>150)return;
  }
  if(msg.type==='ping')return deliver(id,{type:'pong',sent:msg.sent,time:Date.now()});
  engine.command(room,player,msg,Date.now(),player.ws||{send:message=>deliver(id,message)});
};
setInterval(()=>{
  const current=performance.now();accumulator+=Math.min(.25,(current-previous)/1000);previous=current;
  let advanced=false;
  while(room&&accumulator>=STEP){accumulator-=STEP;tick++;advanced=true;
    for(const p of room.players.values())if(!p.bot&&!p.ws&&Date.now()-p.disconnectedAt>20000)engine.removePlayer(room,p);
    engine.step(room,Date.now());
  }
  // The local display receives 60Hz snapshots; phones receive small status at 20Hz.
  if(room&&advanced){const state={...engine.snapshot(room),mode:'lan'};postMessage({type:'snapshot',state,controllers:tick%3===0});}
},8);
