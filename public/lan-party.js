import {boundedSkyAim} from '/shared/sky-beam.js';
import {LANAudio} from './lan-audio.js';
import {NEUTRAL,TRACKS,selectTrack} from '/shared/game.js';
import {RemoteSnapshots} from '/shared/remote-snapshots.js';
import {cameraFrame,createChase,renderedChase} from '/shared/chase.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const roomCode=(params.get('room')||'').toUpperCase().replace(/[^A-Z]/g,'').slice(0,3);
const storageKey=roomCode?`bonked-lan-phone-${roomCode}`:'bonked-lan-display';
let config,session,ws,state,mode,id,seq=0,lastState=0,offset=0,retry=0,reconnectTimer,stopped=false,joining=false;
let world,loading=false,worldError=false,World,previousFrame=performance.now(),lastActivity=-Infinity;
const audio=new LANAudio();let skyOffset={x:0,z:0};
const snapshots=new RemoteSnapshots({minDelay:35,maxDelay:100}),held=new Set();let nudge=0,nudgeUntil=0,pressedAt=null;
try{session=JSON.parse(sessionStorage.getItem(storageKey)||'null');$('name').value=localStorage.getItem('drift-name')||'';}catch{}
$('room').value=roomCode;
function error(message){$('error').textContent=message;}
function save(){try{if(session)sessionStorage.setItem(storageKey,JSON.stringify(session));else sessionStorage.removeItem(storageKey);}catch{}}
function send(message){if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<65536){ws.send(JSON.stringify(message));return true;}return false;}
function activity(){if(mode==='host')audio.unlock();if(performance.now()-lastActivity>10000&&send({type:'activity'}))lastActivity=performance.now();}
for(const type of ['pointerdown','keydown'])document.addEventListener(type,activity,{passive:true});
function resetControls(){held.clear();nudge=0;nudgeUntil=0;pressedAt=null;document.querySelectorAll('.held').forEach(el=>el.classList.remove('held'));if(mode==='phone')send({type:'input',seq:++seq,...NEUTRAL});}
window.addEventListener('blur',resetControls);document.addEventListener('visibilitychange',()=>{resetControls();if(document.hidden)audio.stop();else activity();});
async function refresh(){
  try{const response=await fetch('/api/lan/rooms',{cache:'no-store'});if(!response.ok)throw Error('Cannot list games.');const rooms=await response.json();$('games').replaceChildren();for(const room of rooms){const button=document.createElement('button');button.textContent=`${room.code} · ${TRACKS[room.trackId]?.name||'Race'} · ${room.players}/${room.capacity}`;button.disabled=room.players>=room.capacity;button.onclick=()=>{$('room').value=room.code;join();};$('games').append(button);}if(!rooms.length)$('games').textContent='No open games yet. Host one above.';}catch(e){error(e.message);}
}
$('refresh').onclick=refresh;
function join(){const name=$('name').value.trim(),code=$('room').value.toUpperCase();if(!name){$('name').focus();return error('Enter your name first.');}if(!/^[A-Z]{3}$/.test(code))return error('Enter a three-letter room code.');try{localStorage.setItem('drift-name',name);}catch{}if(code!==roomCode){location.href=`/lan.html?room=${code}`;return;}begin('phone',{type:'join',code,name});}
$('join-form').onsubmit=e=>{e.preventDefault();join();};
$('host').onclick=()=>begin('host',{type:'create',display:true});
function begin(nextMode,request){
  if(joining)return;joining=true;mode=nextMode;stopped=false;error('');$('host').disabled=true;
  document.body.dataset.mode=mode;if(mode==='host')audio.unlock();connect(request);
}
function connect(request){
  clearTimeout(reconnectTimer);$('connection').textContent=retry?'Reconnecting…':'Connecting…';
  ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
  ws.onopen=()=>{retry=0;send(session?{type:'join',code:session.code,token:session.token,display:mode==='host'}:request);send({type:'ping',sent:Date.now()});};
  ws.onmessage=event=>{
    let message;try{message=JSON.parse(event.data);}catch{return;}
    if(message.type==='server-ping'){send({type:'server-pong',id:message.id});return;}
    if(message.type==='pong'){offset=message.time+(Date.now()-message.sent)/2-Date.now();return;}
    if(message.type==='welcome'){id=message.id;seq=message.seq||0;session={code:message.code,token:message.token,mode};save();$('entry').hidden=true;$('session').hidden=false;$('leave').hidden=false;$('sound').hidden=mode!=='host';$('fullscreen').hidden=mode!=='host'||!document.fullscreenEnabled;error('');if(mode==='host')updateInvite();return;}
    if(message.type==='error'){
      if(message.reason==='updating'){setTimeout(()=>send(session?{type:'join',...session,display:mode==='host'}:request),message.retryAfterMs||2000);return;}
      error(message.message);if(!state){session=null;save();stopped=true;ws.close();joining=false;$('host').disabled=false;}return;
    }
    if(message.type==='left'){end('The host ended this LAN party.');return;}
    if(message.type==='state'){
      if(state?.phase!==message.phase||state?.round!==message.round){snapshots.reset();skyOffset={x:0,z:0};if(!(state?.phase==='countdown'&&message.phase==='racing'))resetControls();world?.resetRound();}
      state=message;lastState=performance.now();snapshots.push(state,lastState);$('connection').textContent='LAN server connected';renderUI();if(mode==='host')ensureWorld();
    }
  };
  ws.onclose=event=>{resetControls();if(stopped)return;if(event.code===4000||event.code===4001){end(event.reason||'Disconnected. Join again to play.');return;}$('connection').textContent='Reconnecting…';reconnectTimer=setTimeout(()=>connect(request),Math.min(5000,400*2**retry++));};
  ws.onerror=()=>{$('connection').textContent='Cannot connect to laptop';};
}
function end(message=''){
  stopped=true;clearTimeout(reconnectTimer);audio.stop();resetControls();session=null;save();state=null;id=null;joining=false;ws?.close();world?.dispose();world=null;snapshots.reset();
  document.body.classList.remove('racing');delete document.body.dataset.mode;$('entry').hidden=false;$('session').hidden=true;$('leave').hidden=true;$('fullscreen').hidden=true;$('sound').hidden=true;$('host').disabled=false;$('connection').textContent='LAN party';error(message);refresh();
}
$('leave').onclick=()=>{send({type:'leave'});end();};
$('sound').onclick=()=>{audio.muted=!audio.muted;$('sound').textContent=audio.muted?'Unmute sound':'Mute sound';$('sound').setAttribute('aria-pressed',String(audio.muted));if(audio.muted)audio.stop();};
$('fullscreen').onclick=()=>document.documentElement.requestFullscreen().catch(()=>error('Use your browser’s fullscreen option.'));
$('address').onchange=updateInvite;
function updateInvite(){
  const urls=config.lanURLs||[];if(!$('address').options.length){const choices=urls.length?urls:[location.origin];for(const url of choices){const option=document.createElement('option');option.value=url;option.textContent=url;$('address').append(option);}if(urls.includes(location.origin))$('address').value=location.origin;}
  const url=new URL('/lan.html',$('address').value);url.searchParams.set('room',session.code);$('qr').src=`/api/qr?url=${encodeURIComponent(url.href)}`;$('invite').href=url.href;$('invite').textContent=url.href;$('code').textContent=session.code;
  if(!urls.length)$('wifi-note').textContent='No Wi-Fi address detected. Connect the laptop to Wi-Fi, then reload this page.';
}
$('track').onchange=()=>send({type:'track',trackId:$('track').value});$('bot').onclick=()=>send({type:'bot'});
$('start').onclick=()=>send({type:'start'});$('lobby').onclick=()=>send({type:'lobby'});$('rematch').onclick=()=>send({type:'rematch'});$('ready').onclick=()=>send({type:'ready',round:state?.round});
let rosterKey='',scoreKey='';
function renderUI(){
  if(!state)return;const host=mode==='host',lobby=state.phase==='lobby',me=state.players.find(p=>p.id===id),finished=state.phase==='finished';
  document.body.classList.toggle('racing',!lobby);$('host-lobby').hidden=!host||!lobby;$('pad').hidden=host||lobby||finished||!!me?.eliminated||!!me?.finished;
  $('sky-pad').hidden=host||state.phase!=='racing'||!me?.eliminated;
  $('sky-fire').disabled=(me?.skyCooldownUntil||0)>Date.now()+offset;
  $('rev').hidden=state.phase!=='countdown';$('track').value=state.trackId;
  $('start').disabled=loading||worldError||!world||!state.players.length||ws?.readyState!==WebSocket.OPEN;$('bot').disabled=state.players.length>=8;
  $('lobby').hidden=!host||lobby;$('rematch').hidden=!host||!finished||!state.tournamentComplete;$('ready').hidden=host||!finished||state.tournamentComplete;$('ready').disabled=!!me?.ready;
  $('phase').textContent=lobby?(host?'Connect phones to join':'Waiting for the host'):state.phase==='racing'?'GO!':finished?(state.tournamentComplete?'Tournament complete':'Round complete'):'Get ready…';
  $('driver').textContent=host?'':me?`${me.name} · ${me.colorName} · ${Math.ceil(me.health)} HP${me.eliminated?' · Spectating':me.finished?' · Finished':''}`:'Rejoining…';
  if(me)$('driver').style.color=me.color;
  $('weapon').textContent=me?.item?`${me.item.toUpperCase()} · ${Math.ceil(me.ammo)}`:'WEAPON';
  const nextRoster=JSON.stringify(state.players.map(p=>[p.id,p.name,p.bot,p.connected]));if(nextRoster!==rosterKey){rosterKey=nextRoster;$('roster').replaceChildren();for(const p of state.players){const row=document.createElement('div'),name=document.createElement('span');name.textContent=`${p.name}${p.bot?' · Bot':p.connected?'':' · Rejoining'}`;name.style.color=p.color;row.append(name);if(p.bot){const remove=document.createElement('button');remove.textContent='Remove';remove.setAttribute('aria-label',`Remove ${p.name}`);remove.onclick=()=>send({type:'remove-bot',playerId:p.id});row.append(remove);}$('roster').append(row);}}
  const nextScores=JSON.stringify(state.players.map(p=>[p.id,p.score,p.name]));if(nextScores!==scoreKey){scoreKey=nextScores;$('scores').replaceChildren();for(const p of [...state.players].sort((a,b)=>b.score-a.score)){const span=document.createElement('span');span.textContent=`${p.name} ${p.score}/${state.targetScore}`;span.style.setProperty('--car',p.color);$('scores').append(span);}}
}
async function ensureWorld(){
  if(loading||worldError||!state||world?.trackId===state.trackId)return;loading=true;renderUI();const track=state.trackId;
  try{World??=(await import('./world.js')).World;world?.dispose();world=null;selectTrack(track);world=await World.load($('scene'),{progress:message=>{$('connection').textContent=message+'…';}});if(stopped){world.dispose();world=null;}}
  catch(e){console.error(e);worldError=true;error('Could not load 3D graphics. Try again with hardware acceleration enabled.');$('retry-world').hidden=false;}
  finally{loading=false;renderUI();if(!worldError&&state&&state.trackId!==track)ensureWorld();}
}
$('retry-world').onclick=()=>{worldError=false;$('retry-world').hidden=true;error('');ensureWorld();};
for(const button of document.querySelectorAll('[data-hold]')){
  let pointer=null;const key=button.dataset.hold;
  button.onpointerdown=event=>{event.preventDefault();if(pointer!==null)return;pointer=event.pointerId;button.setPointerCapture(pointer);held.add(key);button.classList.add('held');if(key==='gas')pressedAt=Date.now()+offset;pushInput();};
  const release=event=>{if(event.pointerId!==pointer)return;pointer=null;held.delete(key);button.classList.remove('held');if(key==='gas')pressedAt=null;pushInput();};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release);
}
for(const [button,direction]of [['nudge-left',-1],['nudge-right',1]])$(button).onclick=()=>{nudge=direction;nudgeUntil=performance.now()+100;pushInput();};
function pushInput(){
  if(mode!=='phone'||!state||!['countdown','racing'].includes(state.phase))return;
  const active=!document.hidden&&document.hasFocus()&&performance.now()-lastState<1000;
  const reverse=held.has('reverse'),me=state.players.find(p=>p.id===id);
  const input=active&&!me?.eliminated&&!me?.finished?{...NEUTRAL,steer:Number(held.has('right'))-Number(held.has('left')),throttle:!reverse&&(state.phase==='racing'||held.has('gas'))?1:0,reverse,fire:held.has('fire'),nudge:performance.now()<nudgeUntil?nudge:0}:NEUTRAL;
  if(active&&me?.eliminated&&state.phase==='racing'){
    const camera=state.camera,c=Math.cos(camera.angle),s=Math.sin(camera.angle),side=Number(held.has('right'))-Number(held.has('left')),forward=Number(held.has('up'))-Number(held.has('down'));
    skyOffset.x+=(c*forward-s*side)*.65;skyOffset.z+=(s*forward+c*side)*.65;
    const aim=boundedSkyAim({x:camera.x+skyOffset.x,z:camera.z+skyOffset.z},camera);skyOffset={x:aim.x-camera.x,z:aim.z-camera.z};
    send({type:'input',seq:++seq,...NEUTRAL,fire:held.has('fire'),skyAim:aim});
  }else send({type:'input',seq:++seq,...input,accelPressedAt:pressedAt});if(held.size)activity();
}
setInterval(pushInput,1000/30);setInterval(()=>{if(session)send({type:'ping',sent:Date.now()});},2000);
function frame(now){
  requestAnimationFrame(frame);const dt=Math.min(.05,(now-previousFrame)/1000);previousFrame=now;
  if(!state||document.hidden)return;
  if(now-lastState>1000){$('connection').textContent='Connection interrupted — reconnecting…';resetControls();}
  if(state.phase==='countdown')$('phase').textContent=String(Math.max(1,Math.ceil((state.startAt-Date.now()-offset)/1000)));
  if(mode==='host'&&world&&!loading&&world.trackId===state.trackId){const players=snapshots.sample(now)||state.players;const rendered={...state,players,camera:cameraFrame(createChase(players),players),chase:renderedChase(state.chase,players)};world.update(rendered,null,null,dt,now);audio.update(rendered,world.follow,ws?.readyState===WebSocket.OPEN&&now-lastState<1000&&state.phase!=='lobby');}
}
requestAnimationFrame(frame);
try{const response=await fetch('/api/config',{cache:'no-store'});if(!response.ok)throw Error('Could not check the LAN server. Reload to try again.');config=await response.json();$('connection').textContent=config.lanMode?'Local server ready':'LAN setup';$('setup').hidden=!!config.lanMode;$('local').hidden=!config.lanMode;if(config.lanMode){await refresh();if(session)begin(session.mode,{type:'join',code:session.code,token:session.token,display:mode==='host'});}else{session=null;save();}}
catch(e){error(e.message);$('connection').textContent='Connection failed';}
