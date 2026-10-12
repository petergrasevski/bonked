import {captureMotion,recordMotion} from './shared/prediction.js';
import {collectBoostPad} from './shared/boost-pads.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';
import { TRACKS,selectTrack,getLandscape,BOOST_PADS,MAX_PLAYERS,LAPS,STEP,COLORS,COLOR_NAMES,NEUTRAL,spawnCar,stepCar,collideCoastalCrabs,collideDesertMoles,collideCars,resolveNudges,sanitizeInput,botInput,PICKUP_LOCATIONS,trackAt,recordLaunchInput,applyLaunch,START_FRACTION,constrainRoad } from './shared/game.js';
import { createChase, updateChase, chaseSnapshot, cameraFrame } from './shared/chase.js';
import { initCombat, createPickups, collectPickup, WEAPONS, pressWeapon, updateCombat } from './shared/combat.js';
import { targetScoreForPlayers, scoreRound, nextRoundDue } from './shared/tournament.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const rooms=new Map(),connections=new Map();
const PORT=Number(process.env.PORT)||3210, HOST=process.env.HOST||'0.0.0.0';
const MAX_ROOMS=100, GRACE_MS=20000;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json','.mid':'audio/midi','.ttf':'font/ttf','.woff2':'font/woff2'};
function lanURLs(){return Object.entries(os.networkInterfaces()).flatMap(([name,entries])=>entries.filter(n=>n.family==='IPv4'&&!n.internal&&!name.startsWith('utun')).map(n=>`http://${n.address}:${PORT}`));}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
    if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({status:'ok',rooms:rooms.size,uptime:Math.round(process.uptime())}));}
    if(url.pathname==='/api/config'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({lanURLs:process.env.PUBLIC_URL?[process.env.PUBLIC_URL]:lanURLs()}));}
    if(url.pathname==='/api/qr'){
      const value=url.searchParams.get('url');
      if(!value||value.length>512||!/^https?:\/\//.test(value)){res.writeHead(400);return res.end();}
      res.setHeader('Content-Type','image/svg+xml');return res.end(await QRCode.toString(value,{type:'svg',margin:1,color:{dark:'#101d26',light:'#ffffff'}}));
    }
    const routes={'/shared/coastal-crabs.js':'shared/coastal-crabs.js','/shared/desert-storm.js':'shared/desert-storm.js','/vendor/three.module.js':'node_modules/three/build/three.module.js','/vendor/three.core.js':'node_modules/three/build/three.core.js','/vendor/BufferGeometryUtils.js':'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js','/vendor/RoundedBoxGeometry.js':'node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js','/shared/game.js':'shared/game.js','/shared/landscape.js':'shared/landscape.js','/shared/edge-physics.js':'shared/edge-physics.js','/shared/boost-pads.js':'shared/boost-pads.js','/shared/netcode.js':'shared/netcode.js','/shared/chase.js':'shared/chase.js','/shared/camera.js':'shared/camera.js','/shared/combat.js':'shared/combat.js','/shared/weapon-geometry.js':'shared/weapon-geometry.js','/shared/desert-features.js':'shared/desert-features.js','/shared/prediction.js':'shared/prediction.js','/shared/tournament.js':'shared/tournament.js'};
    let filename=routes[url.pathname];
    if(!filename){
      const requested=decodeURIComponent(url.pathname==='/'?'index.html':url.pathname).replace(/^\/+/, '')||'index.html';
      filename=path.join('public',requested);
      if(!path.resolve(root,filename).startsWith(path.join(root,'public')+path.sep)){res.writeHead(403);return res.end();}
    }
    const data=await readFile(path.join(root,filename));
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found');}
});
const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:{threshold:1024,zlibDeflateOptions:{level:1},concurrencyLimit:4}});
// A dedicated bounded audio socket avoids TCP audio traffic queuing game inputs.
// Audio is relayed only to authenticated connected humans in the same room.
const voiceWss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host){socket.destroy();return;}}catch{socket.destroy();return;}}
  const pathname=new URL(req.url,'http://localhost').pathname;
  const target=pathname==='/ws'?wss:pathname==='/voice'?voiceWss:null;
  if(!target||target.clients.size>=650){socket.destroy();return;}
  target.handleUpgrade(req,socket,head,ws=>target.emit('connection',ws,req));
});
voiceWss.on('connection',ws=>{
  let room=null,player=null,windowAt=Date.now(),packets=0;
  ws.voiceAlive=true;ws.on('pong',()=>ws.voiceAlive=true);ws.on('error',()=>{});
  const authTimeout=setTimeout(()=>{if(!player)ws.close(1008,'Join a lobby first');},5000);
  ws.on('message',(data,binary)=>{
    if(!player){
      if(binary)return ws.close(1008,'Authentication required');
      let msg;try{msg=JSON.parse(data);}catch{return ws.close(1008,'Invalid authentication');}
      room=rooms.get(String(msg.code||'').toUpperCase());
      player=[...(room?.players.values()||[])].find(p=>!p.bot&&p.ws?.readyState===WebSocket.OPEN&&typeof msg.token==='string'&&p.token===msg.token);
      if(!player)return ws.close(1008,'Join a lobby first');
      clearTimeout(authTimeout);player.voice?.close(4001,'Voice connected elsewhere');player.voice=ws;send(ws,{type:'ready'});return;
    }
    if(!room.players.has(player.id)||!player.ws||player.voice!==ws)return ws.close(1008,'Lobby ended');
    if(!binary||data.length!==640)return ws.close(1008,'Invalid audio frame');
    const now=Date.now();if(now-windowAt>=1000){windowAt=now;packets=0;}if(++packets>70)return ws.close(1008,'Audio rate exceeded');
    const frame=Buffer.allocUnsafe(641);frame[0]=COLORS.indexOf(player.color);data.copy(frame,1);
    for(const peer of room.players.values())if(peer!==player&&peer.ws&&peer.voice?.readyState===WebSocket.OPEN&&peer.voice.bufferedAmount<8192)peer.voice.send(frame);
  });
  ws.on('close',()=>{clearTimeout(authTimeout);if(player?.voice===ws)player.voice=null;});
});
function send(ws,data){if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<128*1024)ws.send(JSON.stringify(data));}
function fail(ws,message){send(ws,{type:'error',message});}
function roomCode(){let code;do{code=Array.from(randomBytes(3),b=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[b%26]).join('');}while(rooms.has(code));return code;}
function broadcast(room,data){for(const p of room.players.values())send(p.ws,data);}
function snapshot(room){return {type:'state',code:room.code,trackId:room.trackId||'coast',host:room.host,phase:room.phase,raceTime:room.raceTime||0,time:Date.now(),startAt:room.startAt,endedAt:room.endedAt,finishedAt:room.finishedAt,winnerId:room.winnerId,round:room.round,roundStartFraction:room.roundStartFraction,targetScore:room.targetScore,roundResults:room.roundResults,nextRoundAt:room.nextRoundAt,tournamentComplete:room.tournamentComplete,tournamentWinnerId:room.tournamentWinnerId,chase:chaseSnapshot(room.chase),camera:cameraFrame(room.chase,[...room.players.values()].map(p=>p.car)),players:[...room.players.values()].map(p=>({id:p.id,name:p.name,color:p.color,colorName:p.colorName,connected:!!p.ws,bot:p.bot,score:p.score||0,ready:!!p.ready,seq:p.appliedSeq??0,input:p.simInput||NEUTRAL,...p.car})),boostPads:room.boostPads.map(({id,readyAt})=>({id,readyAt})),pickups:room.pickups,projectiles:room.projectiles,effects:room.effects,mines:room.mines,chains:room.chains,arcs:room.arcs,sounds:room.sounds};}
function publish(room){selectTrack(room.trackId);if(room.phase==='lobby')room.targetScore=targetScoreForPlayers(room.players.size);if(room.phase==='lobby')room.chase=createChase([...room.players.values()].map(p=>p.car));broadcast(room,snapshot(room));}
function resetRoom(room,{newTournament=true,startFraction=START_FRACTION}={}){
  selectTrack(room.trackId);room.phase='lobby';room.raceTime=0;room.startAt=null;room.endedAt=null;room.finishedAt=null;initCombat(room);room.survivorEndAt=null;room.pickups=createPickups();room.boostPads=BOOST_PADS.map(p=>({...p}));
  if(newTournament)room.targetScore=targetScoreForPlayers(room.players.size);
  room.round=newTournament?1:(room.round||1)+1;room.roundStartFraction=startFraction;room.finishProgress=startFraction-START_FRACTION+LAPS;
  room.roundResults=[];room.nextRoundAt=null;room.tournamentComplete=false;room.tournamentWinnerId=null;
  let slot=0;for(const p of room.players.values()){p.car=spawnCar(slot++,startFraction);constrainRoad(p.car);p.input={...NEUTRAL};p.simInput={...NEUTRAL};p.fireLatch=false;p.botFireUntil=0;p.accelPressedAt=null;p.ready=false;p.appliedSeq=p.seq;if(newTournament)p.score=0;}
  room.chase=createChase([...room.players.values()].map(p=>p.car));room.raceSize=room.players.size;room.winnerId=null;
}
function startRound(room,now,next=false){
  resetRoom(room,{newTournament:!next,startFraction:next?room.nextStartFraction:START_FRACTION});room.phase='countdown';room.startAt=now+3300;publish(room);
}
function addPlayer(room,ws,name,bot=false){
  selectTrack(room.trackId);const used=new Set([...room.players.values()].map(p=>p.color));
  const options=COLORS.filter(c=>!used.has(c)),color=options[Math.floor(Math.random()*options.length)];
  const p={id:randomUUID(),token:randomBytes(24).toString('hex'),name:String(name||'Driver').trim().slice(0,18)||'Driver',color,colorName:COLOR_NAMES[COLORS.indexOf(color)],car:spawnCar(Array.from({length:MAX_PLAYERS},(_,i)=>i).find(slot=>![...room.players.values()].some(p=>p.car.gridSlot===slot))),ws,bot,score:0,ready:false,input:{...NEUTRAL},seq:0,lastInput:Date.now(),disconnectedAt:null};
  room.players.set(p.id,p);if(!room.host&&!bot)room.host=p.id;return p;
}
function removePlayer(room,p){p.voice?.close(1000,'Left lobby');room.players.delete(p.id);if(room.host===p.id)room.host=[...room.players.values()].find(p=>!p.bot&&p.ws)?.id||[...room.players.values()].find(p=>!p.bot)?.id;if(![...room.players.values()].some(p=>!p.bot)){rooms.delete(room.code);return;}publish(room);}
function useItem(room,p,now){return pressWeapon(room,p,now);}
wss.on('connection',(ws,req)=>{
  // Browsers must connect from the same origin; non-browser test clients have no Origin.
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host){ws.close(1008,'Origin rejected');return;}}catch{ws.close(1008);return;}}
  if(wss.clients.size>650){ws.close(1013,'Server full');return;}
  const client={ws,room:null,player:null,alive:true,budget:0,window:Date.now()};connections.set(ws,client);
  ws.on('error',()=>{});ws.on('pong',()=>client.alive=true);
  ws.on('message',data=>{
    const now=Date.now();if(now-client.window>1000){client.window=now;client.budget=0;}if(++client.budget>150){ws.close(1008,'Too many messages');return;}
    let msg;try{msg=JSON.parse(data);}catch{return fail(ws,'Invalid message.');}if(!msg||typeof msg!=='object')return;
    if(msg.type==='ping')return send(ws,{type:'pong',sent:msg.sent,time:now});
    if(msg.type==='create'||msg.type==='join'){
      if(client.room)return fail(ws,'Already in a room.');
      let room;
      if(msg.type==='create'){
        if(rooms.size>=MAX_ROOMS)return fail(ws,'The server is full. Try again shortly.');
        room={trackId:Object.hasOwn(TRACKS,msg.trackId)?msg.trackId:'coast',code:roomCode(),players:new Map(),host:null,createdAt:now};resetRoom(room);rooms.set(room.code,room);
      }else room=rooms.get(String(msg.code||'').toUpperCase());
      if(!room)return fail(ws,'Room not found. Check the three-letter code.');
      let player=[...room.players.values()].find(p=>!p.bot&&typeof msg.token==='string'&&p.token===msg.token);
      if(player){const old=player.ws;player.ws=ws;player.disconnectedAt=null;player.lastInput=now;player.input={...NEUTRAL};if(old&&old!==ws)old.close(4001,'Connected elsewhere');}
      else{
        if(room.phase!=='lobby')return fail(ws,'This race has started. Join after it finishes.');
        if(room.players.size>=MAX_PLAYERS)return fail(ws,'This room already has eight drivers.');
        player=addPlayer(room,ws,msg.name);
      }
      client.room=room;client.player=player;send(ws,{type:'welcome',id:player.id,token:player.token,code:room.code,seq:player.seq});publish(room);return;
    }
    const room=client.room,p=client.player;if(!room||!p||p.ws!==ws)return;selectTrack(room.trackId);
    if(msg.type==='input'){
      if(!Number.isSafeInteger(msg.seq)||msg.seq<=p.seq||msg.seq-p.seq>10000)return;
      const next=sanitizeInput(msg);if(room.phase==='countdown')recordLaunchInput(p,next,msg.accelPressedAt,now,room.startAt);
      p.seq=msg.seq;p.input=next;p.lastInput=now;return;
    }
    if(msg.type==='item')return useItem(room,p,now);
    if(msg.type==='leave'){client.room=null;client.player=null;removePlayer(room,p);return send(ws,{type:'left'});}
    if(msg.type==='ready'){if(room.phase==='finished'&&!room.tournamentComplete&&msg.round===room.round){p.ready=true;publish(room);}return;}
    if(p.id!==room.host)return fail(ws,'Only the room host can do that.');
    if(msg.type==='lobby'&&room.phase==='finished'){resetRoom(room);publish(room);return;}
    if(msg.type==='track'&&room.phase==='lobby'){if(!Object.hasOwn(TRACKS,msg.trackId))return fail(ws,'Unknown track.');room.trackId=msg.trackId;resetRoom(room);publish(room);return;}
    if(msg.type==='bot'&&room.phase==='lobby'){
      if(room.players.size>=MAX_PLAYERS)return fail(ws,'The grid is full.');
      addPlayer(room,null,['Nova','Rocco','Mika','Scout','Jett','Cleo','Ash'][room.players.size-1]||'Bot',true);publish(room);
    }
    if(msg.type==='remove-bot'&&room.phase==='lobby'){const bot=room.players.get(msg.playerId);if(!bot?.bot)return fail(ws,'Choose a bot to remove.');room.players.delete(bot.id);publish(room);return;}
    if(msg.type==='start'&&room.phase==='lobby'){
      startRound(room,now);
    }
    if(msg.type==='rematch'&&room.phase==='finished'&&room.tournamentComplete){startRound(room,now);}
  });
  ws.on('close',()=>{connections.delete(ws);const {room,player:p}=client;if(!room||!p||p.ws!==ws)return;selectTrack(room.trackId);p.ws=null;p.input={...NEUTRAL};p.disconnectedAt=Date.now();if(room.host===p.id)room.host=[...room.players.values()].find(p=>p.ws)?.id||p.id;publish(room);});
});
let previous=performance.now(),accumulator=0,tick=0;
const timer=setInterval(()=>{
  const current=performance.now();accumulator+=Math.min((current-previous)/1000,.1);previous=current;
  while(accumulator>=STEP){accumulator-=STEP;tick++;const now=Date.now();
    for(const room of rooms.values()){
      selectTrack(room.trackId);
      for(const p of room.players.values())if(!p.bot&&!p.ws&&now-p.disconnectedAt>GRACE_MS)removePlayer(room,p);
      if(!rooms.has(room.code))continue;
      if(nextRoundDue(room,now))startRound(room,now,true);
      if(room.phase==='countdown'&&now>=room.startAt){room.phase='racing';for(const p of room.players.values())applyLaunch(p.car,!p.bot&&p.input.throttle>.1&&!p.input.reverse&&now-p.lastInput<=250?p.accelPressedAt:null,room.startAt);}
      if(room.phase==='racing'){
        const motionBefore=new Map([...room.players.values()].map(p=>[p.id,captureMotion(p.car)]));
        room.raceTime=(room.raceTime||0)+STEP;
        for(const p of room.players.values()){
          const input=p.bot?botInput(p.car):now-p.lastInput>250?NEUTRAL:p.input;
          p.simInput=input;p.appliedSeq=p.seq;
          if(p.bot){if(p.car.item&&Math.random()<.018)p.botFireUntil=now+6000;input.fire=p.car.item&&now<p.botFireUntil&&(WEAPONS[p.car.item]?.continuous||Math.floor(now/500)%2===0);}
          const previousPose={x:p.car.x,y:p.car.y,z:p.car.z};
          stepCar(p.car,input);p.car.raceTime=room.raceTime;collideDesertMoles(p.car,room.raceTime);collideCoastalCrabs(p.car,room.raceTime);
          if(!p.car.finished&&!p.car.eliminated&&p.car.progress>=room.finishProgress){p.car.finished=true;p.car.finishTime=now-room.startAt;}
          collectPickup(p.car,room.pickups,now);collectBoostPad(p.car,room.boostPads,room.raceTime,previousPose);
        }
        resolveNudges([...room.players.values()].map(p=>p.car));
        collideCars([...room.players.values()].map(p=>p.car),{road:true});
        updateCombat(room,STEP,now);
        for(const p of room.players.values())if(p.car.wrecked&&!p.car.explosionShown){p.car.explosionShown=true;p.car.eliminatedAt=now-room.startAt;room.effects.push({id:++room.serial,kind:'explosion',x:p.car.x,z:p.car.z,until:now+1100,color:'#ff993d'});}
        const players=[...room.players.values()];
        for(const p of updateChase(room.chase,players,now-room.startAt))room.effects.push({id:randomUUID(),kind:'hit',x:p.car.x,z:p.car.z,until:now+600,color:p.color});
        for(const p of players)recordMotion(p.car,motionBefore.get(p.id),STEP);
        const survivors=players.filter(p=>!p.car.eliminated),finished=survivors.filter(p=>p.car.finished);
        const lastStanding=room.raceSize>1&&survivors.length<=1;
        if(lastStanding&&!room.survivorEndAt)room.survivorEndAt=now+1800;
        if(lastStanding&&survivors[0]&&now>=room.survivorEndAt){survivors[0].car.finished=true;survivors[0].car.finishTime=now-room.startAt;room.winnerId=survivors[0].id;}
        if(finished.length&&!room.endedAt)room.endedAt=now+25000;
        if((lastStanding&&now>=room.survivorEndAt)||(!lastStanding&&finished.length===survivors.length)||(room.endedAt&&now>=room.endedAt)||now-room.startAt>1200000){room.phase='finished';room.finishedAt=now;scoreRound(room,now);publish(room);}
      }
      if(tick%3===0)publish(room);
    }
  }
},8);
const heartbeat=setInterval(()=>{for(const ws of voiceWss.clients){if(!ws.voiceAlive){ws.terminate();continue;}ws.voiceAlive=false;ws.ping();}for(const c of connections.values()){if(!c.alive){c.ws.terminate();continue;}c.alive=false;c.ws.ping();if(!c.room&&Date.now()-c.window>60000)c.ws.close(1000,'Idle');}},10000);
wss.on('error',error=>{console.error(`Cannot start game server on ${HOST}:${PORT}: ${error.code||error.message}`);clearInterval(timer);clearInterval(heartbeat);process.exit(1);});
// Prebuild contact meshes before accepting players, never on the first fall.
for(const id of Object.keys(TRACKS)){selectTrack(id);getLandscape();}selectTrack('coast');
server.listen(PORT,HOST,()=>console.log(`\nTOUNCHED\nLocal: http://localhost:${PORT}\n${lanURLs().map(url=>`Wi-Fi: ${url}`).join('\n')}\n`));
function shutdown(){for(const ws of voiceWss.clients)ws.close(1001,'Server restarting');voiceWss.close();clearInterval(timer);clearInterval(heartbeat);for(const ws of wss.clients)ws.close(1001,'Server restarting');wss.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),2000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
