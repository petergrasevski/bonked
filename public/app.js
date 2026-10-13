import {CarNameTooltip} from './car-name-tooltip.js';
import {NetworkDiagnostics} from './network-diagnostics.js';
import {CombatPrediction} from '/shared/combat-prediction.js';
import {PREDICTION_GRACE_MS,replayWindow} from '/shared/network-timing.js';
import {createScoreMeter} from './score-meter.js';
import {RoundResults} from './round-results.js';
import {WeaponHUD} from './weapon-hud.js';
import {updateControlLegend} from './control-legend.js';
import {initMetalInteractions} from './metal-ui.js';
import {createTrackPicker} from './track-picker.js';
import {readController} from './controller.js';
import {bindTouchSteering,driveThrottle,bindSkyJoystick} from './touch-controls.js';
import {PartyVoice} from './voice.js';
import {RenderCorrections,renderFleet} from '/shared/netcode.js';
import { detectDevice, initDisplayGuide } from './display.js';
import { WeaponAudio } from './weapon-audio.js';
import { EngineAudio, raceListener } from './engine-audio.js';
import { AudioBank } from './audio-bank.js';
import { AudioMixer } from './audio-mixer.js';
import { RoadAudio } from './road-audio.js';
import { World } from './world.js';
import { TRACKS,MAX_PLAYERS,selectTrack,activeTrack,NEUTRAL, STEP, clamp, angleDelta, damageLevel } from '/shared/game.js';
import { predictFleet } from '/shared/prediction.js';
import { WEAPONS } from '/shared/combat.js';
import { raceOrder, cameraFrame,createChase,renderedChase } from '/shared/chase.js';
const $=id=>document.getElementById(id);
initMetalInteractions();
const device=detectDevice(navigator);document.body.classList.toggle('mobile',device.mobile);
const corrections=new RenderCorrections();
const combatPrediction=new CombatPrediction();
const network=new NetworkDiagnostics(message=>send(message));
window.bonkedNetwork={export:()=>network.export()};
const voice=new PartyVoice($('voice-toggle'));
let controllerLeft=false,controllerRight=false,controllerBlocked=false;
function selectWorld(id){if(id===activeTrack.id)return;selectTrack(id);$('scene').setAttribute('aria-label','3D view of '+activeTrack.name);world?.dispose();world=new World($('scene'));corrections.reset();combatPrediction.reset();network.resetStream();history=[];pending=[];accumulator=0;}
let world,displayGuide=null;
const weaponHud=new WeaponHUD($('desktop-weapon'),()=>world);
const resultsScreen=new RoundResults($('results'));
const trackPicker=createTrackPicker($('track-picker'),()=>world,id=>send({type:'track',trackId:id}));
try{world=new World($('scene'));}catch(error){console.error(error);$('dialog').hidden=false;$('dialog-body').innerHTML='<h2>WebGL 2 required.</h2><p>This game needs WebGL 2. Try a recent Safari or Chrome browser with hardware acceleration enabled.</p>';}
let ws,state=null,myId=null,predicted=null,predictedOthers=[],sequence=0,pending=[],history=[],clockOffset=0,rtt=0,lastState=0,lastFrame=performance.now(),accumulator=0,uiAt=0,retries=0,intent=null,session=null,rosterKey='',phase=null;
let resuming=false,entryBusy=false;
let savedName='';try{savedName=localStorage.getItem('drift-name')||'';session=JSON.parse(sessionStorage.getItem('drift-room')||'null');}catch{}
$('name').value=savedName;
const inviteCode=new URLSearchParams(location.search).get('room');if(inviteCode)$('code').value=inviteCode.toUpperCase().slice(0,3);
const input={...NEUTRAL},keys=new Set();let leftHeld=false,rightHeld=false,gasHeld=false,brakeHeld=false,fireHeld=false,firePulseUntil=0,accelPressedAt=null,nudgeDirection=0,nudgeUntil=0;
const holdResets=[];
const portrait=matchMedia('(orientation: portrait)');
const rotationBlocked=()=>device.mobile&&portrait.matches;
const carNames=new CarNameTooltip($('scene'),$('opponent-name'),{world:()=>world,state:()=>state,localId:()=>myId,enabled:()=>['racing','countdown'].includes(state?.phase)&&!document.hidden&&!rotationBlocked()&&$('settings').hidden&&$('dialog').hidden&&!displayGuide?.isOpen()});
let toastTimer;function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500);}
function saveSession(){try{if(session)sessionStorage.setItem('drift-room',JSON.stringify(session));else sessionStorage.removeItem('drift-room');}catch{}}
function send(message){if(ws?.readyState===WebSocket.OPEN){ws.send(JSON.stringify(message));return true;}return false;}
function setConnection(online,label){$('connection-dot').classList.toggle('online',online);$('connection-label').textContent=label;}
function connect(){
  setConnection(false,retries?'RECONNECTING':'CONNECTING');
  ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
  ws.addEventListener('open',()=>{retries=0;setConnection(true,'SERVER ONLINE');if(session){resuming=true;send({type:'join',code:session.code,token:session.token,name:$('name').value});}else if(intent){send(intent);intent=null;}send({type:'ping',sent:Date.now()});});
  ws.addEventListener('message',event=>{
    let msg;try{msg=JSON.parse(event.data);}catch{return;}
    if(msg.type==='server-ping'){send({type:'server-pong',id:msg.id});return;}
    if(msg.type==='pong'){rtt=Date.now()-msg.sent;const measuredOffset=msg.time+rtt/2-Date.now();clockOffset=network.ping===null?measuredOffset:clockOffset*.9+measuredOffset*.1;network.pong(rtt,msg.diagnostics);network.updatePing(true);return;}
    if(msg.type==='welcome'){resuming=false;myId=msg.id;session={code:msg.code,token:msg.token};saveSession();sequence=msg.seq||0;pending=[];history=[];predicted=null;corrections.reset();combatPrediction.reset();network.resetStream();voice.join(session);setBusy(false);return;}
    if(msg.type==='error'){toast(msg.message);setBusy(false);if(resuming){resuming=false;clearRoom();}return;}
    if(msg.type==='left'){clearRoom();return;}
    if(msg.type==='state'){
      lastState=performance.now();network.snapshot(lastState);const was=state;selectWorld(msg.trackId||'coast');const oldFleet=predicted?[predicted,...predictedOthers]:[];state=msg;history.push({time:performance.now(),state:msg});if(history.length>12)history.shift();if(was?.phase!==msg.phase||was?.round!==msg.round)combatPrediction.reset();
      const me=msg.players.find(p=>p.id===myId);
      if(me){sequence=Math.max(sequence,me.seq);pending=pending.filter(frame=>frame.seq>me.seq);predicted={...me};predictedOthers=msg.players.filter(p=>p.id!==myId).map(p=>({...p}));combatPrediction.reconcile(msg,predicted,predictedOthers);if(msg.phase==='racing'){const replay=replayWindow(pending,rtt);network.add('replaySteps',replay.length);for(const frame of replay){predictFleet(predicted,predictedOthers,frame.input,STEP);combatPrediction.step(frame.input,STEP);}const old=oldFleet.find(p=>p.id===myId);if(old)network.add('correctionM',Math.hypot(old.x-predicted.x,old.z-predicted.z));}corrections.reconcile(oldFleet,[predicted,...predictedOthers],msg.phase==='racing'?accumulator:0);}
      if(phase!==msg.phase){const previousPhase=phase;phase=msg.phase;onPhaseChange(previousPhase);}
      if(was&&me?.item&&!was.players.find(p=>p.id===myId)?.item){beep(720,.09,.03);}
    }
  });
  ws.addEventListener('close',event=>{voice.leave();stopGameAudio();setConnection(false,event.code===4001?'OPEN IN ANOTHER TAB':'RECONNECTING');releaseControls();if(event.code===4001){session=null;saveSession();clearRoom();toast('This driver is connected in another tab.');return;}const delay=Math.min(4000,500*2**retries++);setTimeout(connect,delay);});
  ws.addEventListener('error',()=>{});
}
connect();
setInterval(()=>send({type:'ping',sent:Date.now()}),2000);
function updateEntryButtons(){$('create').disabled=entryBusy;$('join').disabled=entryBusy||!/^[A-Z]{3}$/.test($('code').value);}
function setBusy(busy){entryBusy=busy;updateEntryButtons();}
updateEntryButtons();
function enter(type){const name=$('name').value.trim();if(!name){$('name').focus();return toast('Enter your name first.');}voice.prepare();try{localStorage.setItem('drift-name',name);}catch{}if(type==='join'&&!/^[A-Z]{3}$/.test($('code').value.toUpperCase()))return toast('Enter the three-letter room code.');const msg={type,name,code:$('code').value.toUpperCase()};setBusy(true);if(!send(msg)){intent=msg;toast('Connecting to the race server…');}}
$('create').onclick=()=>enter('create');$('join').onclick=()=>enter('join');$('code').addEventListener('input',()=>{$('code').value=$('code').value.toUpperCase().replace(/[^A-Z]/g,'');updateEntryButtons();});$('code').addEventListener('keydown',e=>{if(e.key==='Enter')enter('join');});$('name').addEventListener('keydown',e=>{if(e.key==='Enter')enter(inviteCode?'join':'create');});
function clearRoom(){trackPicker.sync(activeTrack.id,false,false);voice.leave();stopGameAudio();corrections.reset();combatPrediction.reset();network.resetStream();state=null;myId=null;session=null;predicted=null;pending=[];history=[];phase=null;rosterKey='';saveSession();releaseControls();document.body.classList.remove('playing');$('race-ui').hidden=true;$('results').hidden=true;$('room-panel').hidden=true;$('entry-panel').hidden=false;setBusy(false);}
function leave(){$('settings').hidden=true;send({type:'leave'});clearRoom();}
$('leave').onclick=leave;$('results-lobby').onclick=()=>send({type:'lobby'});$('exit-race').onclick=leave;$('start').onclick=()=>{unlockAudio();send({type:'start'});};$('rematch').onclick=()=>send({type:'rematch'});$('ready').onclick=()=>send({type:'ready',round:state?.round});
async function getShareURL(){let origin=location.origin;if(['localhost','127.0.0.1'].includes(location.hostname)){try{const config=await fetch('/api/config').then(r=>r.json());origin=config.lanURLs[0]||origin;}catch{}}return origin+(session?`/?room=${session.code}`:'/');}
$('copy').onclick=async()=>{const link=await getShareURL();try{await navigator.clipboard.writeText(link);toast('Invite copied.');}catch{const t=document.createElement('textarea');t.value=link;document.body.append(t);t.select();const copied=document.execCommand('copy');t.remove();toast(copied?'Invite link copied.':`Invite: ${link}`);}};
const itemMeta=WEAPONS;
function onPhaseChange(previousPhase){
  const playing=state&&state.phase!=='lobby';document.body.classList.toggle('playing',playing);$('race-ui').hidden=!playing;$('entry-panel').hidden=!!state;$('room-panel').hidden=!state;$('results').hidden=state?.phase!=='finished';if(!(previousPhase==='countdown'&&state?.phase==='racing'))releaseControls();pending=[];
  if(state?.phase==='countdown'){history=[];world?.resetRound();corrections.reset();combatPrediction.reset();network.resetStream();accumulator=0;$('settings').hidden=true;$('dialog').hidden=true;beep(420,.2,.04);predicted={...state.players.find(p=>p.id===myId)};}
  if(state?.phase==='finished')renderResults();
}
function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function chip(color){const el=node('span','car-chip');el.style.setProperty('--car',color);return el;}
function sortedPlayers(){return [...state.players].sort(raceOrder);}
function renderResults(){resultsScreen.render(state,myId,Date.now()+clockOffset);}
let scoreKey='';
function renderScores(){const key=JSON.stringify([state.round,state.targetScore,state.players.map(p=>[p.id,p.score,p.eliminated])]);if(key===scoreKey)return;scoreKey=key;
  const board=$('tournament-scores');board.replaceChildren();
  for(const p of state.players){const score=p.score||0,heat=clamp(score/state.targetScore,0,1),cell=node('div','score-player');cell.classList.toggle('me',p.id===myId);cell.classList.toggle('out',p.eliminated);cell.style.setProperty('--car',p.color);cell.style.setProperty('--glow',(2+heat*8)+'px');cell.title=p.name+': '+score+' / '+state.targetScore;
    const meter=createScoreMeter(p.name,score,state.targetScore);
    cell.append(meter,node('strong','score-total',String(score)),node('span','score-name',p.name));board.append(cell);
  }
}
function updateUI(now){
  if(!state)return;
  const host=state.host===myId,me=state.players.find(p=>p.id===myId);if(!me)return;
  const key=JSON.stringify([state.players.map(p=>[p.id,p.name,p.color,p.connected]),state.host]);
  if(key!==rosterKey){rosterKey=key;const roster=$('roster');roster.replaceChildren();for(const p of state.players){const row=node('div','driver');row.append(chip(p.color),node('span','',p.name+(p.id===myId?' (you)':'')),node('span','role',p.bot?'Bot':!p.connected?'Rejoining':p.id===state.host?'Host':'Ready'));if(p.bot&&host){const remove=node('button','remove-bot');remove.type='button';remove.setAttribute('aria-label','Remove '+p.name);remove.onclick=()=>send({type:'remove-bot',playerId:p.id});row.append(remove);}roster.append(row);}for(let i=state.players.length;i<MAX_PLAYERS;i++){const row=node('div','driver empty');row.append(node('span','','＋'),node('span','','Open slot'));if(host&&i===state.players.length){const add=node('button','add-bot','Add bot');add.id='add-bot';add.type='button';add.onclick=()=>send({type:'bot'});row.append(add);}roster.append(row);}$('room-code').textContent=state.code;}
  $('start').hidden=!host;$('host-hint').textContent=host?'':'Waiting for host.';
  trackPicker.sync(state.trackId||'coast',host&&state.phase==='lobby',state.phase==='lobby');$('map-title').textContent=TRACKS[state.trackId||'coast'].name;
  if(state.phase==='lobby')return;
  renderScores();const serverNow=Date.now()+clockOffset;
  $('finish-note').hidden=(!me.finished&&!me.eliminated)||state.phase==='finished';$('finish-note').textContent=me.eliminated?(me.wrecked?'Wrecked':'Eliminated'):'Finished';$('you-label').hidden=me.eliminated;$('race-ui').classList.toggle('spectating',me.eliminated||me.finished);const sky=skyMode(),cooldown=Math.max(0,((me.skyCooldownUntil||0)-serverNow)/1000);$('race-ui').classList.toggle('sky-beam',sky);$('race-ui').style.setProperty('--sky-color',me.color);if(sky)$('finish-note').textContent='Spectating · Sky beam';
  const inventory=predicted&&state.phase==='racing'?predicted:me;const item=itemMeta[inventory.item];weaponHud.update(inventory,{visible:!device.mobile,controller:document.body.classList.contains('controller-connected'),sky,skyRemaining:cooldown,color:me.color});$('item-icon').textContent=item?.icon||'✦';$('item-label').textContent=({machinegun:'MG',rocket:'ROCKET',flame:'FLAME',railgun:'RAIL',shotgun:'SHOTGUN',taser:'TASER',plasma:'PLASMA',chain:'CHAIN',shield:'SHIELD',mine:'MINES',pulse:'PULSE'})[inventory.item]||'—';$('item-count').textContent=item?(['flame','taser'].includes(inventory.item)?inventory.ammo.toFixed(1)+'s':inventory.ammo>1?'×'+inventory.ammo:''):' ';$('item').classList.toggle('loaded',!!item||sky);$('item').classList.toggle('cooling',sky&&cooldown>0);$('item').setAttribute('aria-label',sky?'Fire sky beam':'Use weapon');if(sky){$('item-icon').textContent='ϟ';$('item-label').textContent='SKY BEAM';$('item-count').textContent=cooldown>0?cooldown.toFixed(1)+'s':'READY';}
  for(const id of ['nudge-left','nudge-right']){$(id).classList.toggle('cooling',(me.nudgeCooldown||0)>0);$(id).setAttribute('aria-disabled',String(me.eliminated||(me.nudgeCooldown||0)>0));}
  const damage=damageLevel(me.health);$('health-number').textContent=Math.ceil(me.health);$('health-status').textContent=me.overturned&&!me.wrecked?'FLIPPED':'';$('health-ui').dataset.level=String(damage);[...$('health-bars').children].forEach((bar,i)=>bar.classList.toggle('lit',i<Math.ceil(me.health/20)));$('shield-time').textContent=me.shield>0?'SHIELD '+me.shield.toFixed(1)+'s':'';
  const remaining=(state.startAt-serverNow)/1000;$('countdown').textContent=state.phase==='countdown'?String(Math.max(1,Math.ceil(remaining))):state.phase==='racing'&&remaining>-.8?'GO!':'';
  if(state.phase==='countdown'&&$('countdown').dataset.value!==$('countdown').textContent){$('countdown').dataset.value=$('countdown').textContent;beep(480,.08,.04);}
  if(state.phase==='finished')renderResults();
  if(now-lastState>2000){setConnection(false,'CONNECTION LOST');releaseControls();}
}
let skyStick={x:0,y:0};
const skyMode=()=>state?.phase==='racing'&&!!state.players.find(p=>p.id===myId)?.eliminated;
function controls(){
  const pad=readController(navigator.getGamepads?.());
  updateControlLegend($('controller-status'),pad.connected,skyMode());
  document.body.classList.toggle('controller-connected',pad.connected);
  if(!pad.throttle&&!pad.reverse&&!pad.fire&&!pad.left&&!pad.right&&Math.abs(pad.steer)<.1&&Math.abs(pad.aimY)<.1)controllerBlocked=false;
  if(rotationBlocked()||document.hidden||!document.hasFocus()||!$('settings').hidden||!$('dialog').hidden||displayGuide?.isOpen()){Object.assign(input,NEUTRAL);delete input.skyAim;if(world)world.skyMove={x:0,y:0};controllerBlocked=true;return;}
  const gamepad=controllerBlocked?readController([]):pad;
  const keyboardSteer=(rightHeld||keys.has('KeyD')?1:0)-(leftHeld||keys.has('KeyA')?1:0);
  input.steer=clamp(keyboardSteer||gamepad.steer,-1,1);
  $('steer-left').classList.toggle('held',input.steer<0);$('steer-right').classList.toggle('held',input.steer>0);
  const held=brakeHeld||gamepad.reverse||keys.has('KeyS')||keys.has('ArrowDown');
  input.reverse=held;input.brake=false;
  input.fire=fireHeld||gamepad.fire||(keys.has('Enter')||keys.has('NumpadEnter'))||performance.now()<firePulseUntil;
  if(gamepad.left&&!controllerLeft)triggerNudge(-1);if(gamepad.right&&!controllerRight)triggerNudge(1);
  controllerLeft=gamepad.left;controllerRight=gamepad.right;
  input.nudge=performance.now()<nudgeUntil?nudgeDirection:0;
  const wasAccelerating=input.throttle>.1;input.throttle=driveThrottle({mobile:device.mobile,controllerConnected:pad.connected,phase:state?.phase,reverse:input.reverse,accelerating:gasHeld||gamepad.throttle||keys.has('KeyW')||keys.has('ArrowUp')});
  if(input.throttle>.1&&!wasAccelerating)accelPressedAt=Date.now()+clockOffset;if(input.throttle<=.1)accelPressedAt=null;
  if(world){world.skyMove=skyMode()?{x:keyboardSteer||gamepad.steer||skyStick.x,y:(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)||gamepad.aimY||skyStick.y}:{x:0,y:0};}
  if(skyMode()){input.steer=0;input.throttle=0;input.reverse=false;input.nudge=0;input.skyAim=world?.skyAim||null;}else delete input.skyAim;
  $('brake').classList.toggle('held',held);
}
function releaseControls(){
  controllerBlocked=true;controllerLeft=false;controllerRight=false;keys.clear();nudgeUntil=0;nudgeDirection=0;leftHeld=false;rightHeld=false;gasHeld=false;brakeHeld=false;fireHeld=false;firePulseUntil=0;accelPressedAt=null;
  skyStick={x:0,y:0};if(world)world.skyMove={x:0,y:0};delete input.skyAim;
  for(const reset of holdResets)reset();
  Object.assign(input,NEUTRAL);$('steer-left').classList.remove('held');$('steer-right').classList.remove('held');$('gas').classList.remove('held');$('brake').classList.remove('held');if(state)send({type:'input',seq:++sequence,...NEUTRAL});
}
function holdButton(id,set){
  const el=$(id);let pointer=null;
  const reset=()=>{const id=pointer;pointer=null;set(false);el.classList.remove('held');if(id!==null&&el.hasPointerCapture(id))el.releasePointerCapture(id);};holdResets.push(reset);
  el.addEventListener('pointerdown',e=>{e.preventDefault();if(pointer!==null||rotationBlocked())return;pointer=e.pointerId;el.setPointerCapture(pointer);set(true);el.classList.add('held');unlockAudio();});
  const end=e=>{if(e.pointerId===pointer)reset();};for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,end);
}
function flushControls(){controls();if(state?.phase==='countdown'||state?.phase==='racing')send({type:'input',seq:++sequence,...input,accelPressedAt});}
holdButton('gas',v=>{gasHeld=v;flushControls();});holdButton('brake',v=>{brakeHeld=v;flushControls();});
if(device.mobile){
  holdResets.push(bindTouchSteering(document.querySelector('.left-controls'),{
    enabled:()=>['countdown','racing'].includes(state?.phase)&&!rotationBlocked()&&!document.hidden&&document.hasFocus()&&$('settings').hidden&&$('dialog').hidden&&!displayGuide?.isOpen()&&!predicted?.eliminated&&!predicted?.finished,
    steer:direction=>{leftHeld=direction<0;rightHeld=direction>0;flushControls();},
    nudge,activate:unlockAudio,
  }));
}else{
  holdButton('steer-left',v=>{leftHeld=v;flushControls();});holdButton('steer-right',v=>{rightHeld=v;flushControls();});
}
holdResets.push(bindSkyJoystick($('sky-joystick'),{enabled:()=>skyMode()&&!rotationBlocked()&&document.hasFocus()&&!document.hidden&&$('settings').hidden&&$('dialog').hidden&&!displayGuide?.isOpen(),move:v=>{skyStick=v;flushControls();},activate:unlockAudio}));
function fire(){if(state?.phase==='racing'&&!rotationBlocked()){firePulseUntil=performance.now()+70;send({type:'input',seq:++sequence,...input,fire:true});}}
holdButton('item',held=>{fireHeld=held;if(held)fire();});
function triggerNudge(direction){if(state?.phase!=='racing'||rotationBlocked()||predicted?.eliminated||predicted?.nudgeCooldown>0)return;nudgeDirection=direction;nudgeUntil=performance.now()+120;}
function nudge(direction){triggerNudge(direction);flushControls();}
holdButton('nudge-left',held=>{if(held)nudge(-1);});holdButton('nudge-right',held=>{if(held)nudge(1);});
window.addEventListener('keydown',e=>{const enter=e.code==='Enter'||e.code==='NumpadEnter';if(enter&&state?.phase==='finished'&&!state.tournamentComplete&&$('settings').hidden&&$('dialog').hidden&&!displayGuide?.isOpen()&&!e.target.closest?.('input,textarea,select,button:not(#ready),a,[contenteditable=true]')){e.preventDefault();if(!e.repeat&&!$('ready').disabled)$('ready').click();return;}if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement||e.target.isContentEditable||((e.code==='Enter'||e.code==='NumpadEnter')&&e.target.closest?.('button,a'))||!state||state.phase==='lobby'||rotationBlocked()||!$('settings').hidden||!$('dialog').hidden||displayGuide?.isOpen())return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','NumpadEnter','KeyW','KeyS','KeyA','KeyD','KeyQ','KeyR'].includes(e.code)){e.preventDefault();keys.add(e.code);flushControls();if((e.code==='Enter'||e.code==='NumpadEnter')&&!e.repeat)fire();if((e.code==='ArrowLeft'||e.code==='KeyQ')&&!e.repeat)nudge(-1);if((e.code==='ArrowRight'||e.code==='KeyR')&&!e.repeat)nudge(1);unlockAudio();}});
window.addEventListener('keyup',e=>{keys.delete(e.code);flushControls();});window.addEventListener('blur',releaseControls);
document.addEventListener('visibilitychange',()=>{releaseControls();if(document.hidden){accumulator=0;stopGameAudio();}});
portrait.addEventListener('change',()=>{releaseControls();world?.resize();});
// iOS needs the callout, selection and touch-default behaviours handled separately.
// Keep native editing in the two lobby inputs; game surfaces never select or zoom.
const editable=target=>target instanceof Element&&!!target.closest('input,textarea,[contenteditable="true"]');
for(const event of ['contextmenu','selectstart','dragstart'])document.addEventListener(event,e=>{if(!editable(e.target))e.preventDefault();});
for(const event of ['touchstart','touchmove','touchend'])document.addEventListener(event,e=>{if(e.target instanceof Element&&e.target.closest('.controls,#scene')&&e.cancelable)e.preventDefault();},{passive:false});
for(const event of ['gesturestart','gesturechange','gestureend','dblclick'])document.addEventListener(event,e=>{if(document.body.classList.contains('playing')&&!editable(e.target)&&e.cancelable)e.preventDefault();},{passive:false});
$('close-dialog').onclick=()=>{$('dialog').hidden=true;};$('dialog').onclick=e=>{if(e.target===$('dialog'))$('dialog').hidden=true;};
$('settings-open').onclick=()=>{releaseControls();$('exit-race').hidden=!state||state.phase==='lobby';$('settings').hidden=false;$('settings-close').focus();};
function closeSettings(){$('settings').hidden=true;(state&&state.phase!=='lobby'?$('race-settings'):$('settings-open')).focus();}
$('race-settings').onclick=$('settings-open').onclick;
$('copy-network').onclick=async()=>{const log=network.export();try{await navigator.clipboard.writeText(log);toast('Network log copied.');}catch{const t=document.createElement('textarea');t.value=log;document.body.append(t);t.select();const copied=document.execCommand('copy');t.remove();toast(copied?'Network log copied.':'Could not copy. Use the browser console: bonkedNetwork.export()');}};
$('settings-close').onclick=closeSettings;$('settings').onclick=e=>{if(e.target===$('settings'))closeSettings();};
window.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSettings();$('dialog').hidden=true;}});
let audio=null,engineAudio=null,weaponAudio=null,roadAudio=null,audioBank=null,audioMixer=null,soundEnabled=false;
function stopGameAudio(){weaponAudio?.stop();engineAudio?.stop();roadAudio?.stop();audioMixer?.stop();}
function unlockAudio(){
  if(!soundEnabled)return;
  if(!audio){
    audio=new(window.AudioContext||window.webkitAudioContext)();audioBank=new AudioBank(audio);audioMixer=new AudioMixer(audio);
    const options={bank:audioBank,mixer:audioMixer};weaponAudio=new WeaponAudio(audio,options);engineAudio=new EngineAudio(audio,options);roadAudio=new RoadAudio(audio,options);
    loadGameAudio();
  }
  if(audio.state==='suspended')audio.resume().catch(()=>{});
}
function loadGameAudio(){
  audioBank.load().then(({failed})=>{if(failed.length){console.warn('Unavailable audio samples:',failed);if(soundEnabled)toast('Some sounds could not load. Toggle sound to retry.');}});
}
function beep(freq,duration,volume){if(!audio||!soundEnabled)return;const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=freq;g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audioMixer.bus('ui'));o.onended=()=>{o.disconnect();g.disconnect();};o.start();o.stop(audio.currentTime+duration);}
$('sound').onclick=()=>{soundEnabled=!soundEnabled;$('sound-state').textContent=soundEnabled?'ON':'OFF';$('sound').setAttribute('aria-label',soundEnabled?'Mute sound':'Enable sound');unlockAudio();if(soundEnabled&&audioBank?.errors.size&&!audioBank.loading)loadGameAudio();if(!soundEnabled){stopGameAudio();}};
function renderedState(now,dt){
  if(!state||!predicted)return state;
  const fresh=now-lastState<PREDICTION_GRACE_MS&&state.phase==='racing';
  const players=renderFleet(state,predicted,predictedOthers,corrections,dt,fresh?accumulator:0);
  // Lamps respond to local braking immediately, while remote cars use replicated input.
  const local=players.find(p=>p.id===myId);if(local)local.input={...input};
  const camera=cameraFrame(createChase(players),players);
  const raceTime=Math.max(state.raceTime||0,...[predicted,...predictedOthers].map(car=>car.raceTime||0))+(fresh?accumulator:0);
  return {...state,...(state.phase==='racing'?combatPrediction.view():{}),combatTime:combatPrediction.time,players,camera,raceTime,chase:renderedChase(state.chase,players)};
}
function frame(now){requestAnimationFrame(frame);const frameMs=now-lastFrame;network.frame(frameMs,now-lastState,state?.phase==='racing'&&!document.hidden);const dt=Math.min(.05,frameMs/1000);lastFrame=now;controls();if(state?.phase==='countdown')$('countdown').textContent=String(Math.max(1,Math.ceil((state.startAt-Date.now()-clockOffset)/1000)));accumulator+=dt;
  while(accumulator>=STEP){accumulator-=STEP;if(state&&ws?.readyState===WebSocket.OPEN&&!document.hidden){const active=['racing','countdown'].includes(state.phase)&&now-lastState<PREDICTION_GRACE_MS&&!rotationBlocked()&&$('settings').hidden&&$('dialog').hidden&&!displayGuide?.isOpen();const command={...(active?input:NEUTRAL)},seq=++sequence;send({type:'input',seq,...command,accelPressedAt});if(state.phase==='racing'&&predicted&&now-lastState<PREDICTION_GRACE_MS){predictFleet(predicted,predictedOthers,command,STEP);combatPrediction.step(command,STEP);pending.push({seq,input:command});if(pending.length>120)pending.shift();}}}
  const rendered=renderedState(now,dt);world?.update(rendered,myId,null,dt,now);carNames.update(now);trackPicker.tick(now);
  if(state&&world){const pos=world.screenPosition(myId);if(pos){$('you-label').style.transform=`translate3d(${Math.round(pos.x)}px,${Math.round(pos.y)}px,0) translate(-50%,-100%)`;}}
  if(state?.phase==='finished')resultsScreen.progress(state,Date.now()+clockOffset);
  if(now-uiAt>100){uiAt=now;updateUI(now);network.updatePing(ws?.readyState===WebSocket.OPEN);network.add('bufferedBytes',ws?.bufferedAmount||0);network.report({phase:state?.phase||'menu',track:activeTrack.id,presentation:'predicted-fleet',bufferMs:0,underruns:0,server:network.server});}
  const listening=raceListener(rendered,world?.follow),audible=soundEnabled&&ws?.readyState===WebSocket.OPEN&&!document.hidden&&now-lastState<1000;
  weaponAudio?.update(rendered,listening,audible,myId);engineAudio?.update(rendered,listening,audible,myId);roadAudio?.update(rendered,listening,audible,myId);
  audioMixer?.update(audible&&['countdown','racing'].includes(rendered?.phase),voice.activityLevel());
}
displayGuide=initDisplayGuide({onOpen:()=>{releaseControls();$('settings').hidden=true;},onClose:()=>{accumulator=0;world?.resize();}});
requestAnimationFrame(frame);
