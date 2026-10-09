import { engineAudible } from './audio.js';
import { World } from './world.js';
import { NEUTRAL, STEP, clamp, angleDelta, brakeMode, REVERSE_HOLD_MS, TRACK_LENGTH, damageLevel } from '/shared/game.js';
import { predictFleet } from '/shared/prediction.js';
import { WEAPONS } from '/shared/combat.js';
import { raceOrder } from '/shared/chase.js';
const $=id=>document.getElementById(id);
let world;
try{world=new World($('scene'));}catch(error){console.error(error);$('dialog').hidden=false;$('dialog-body').innerHTML='<h2>WebGL 2 required.</h2><p>This game needs WebGL 2. Try a recent Safari or Chrome browser with hardware acceleration enabled.</p>';}
let ws,state=null,myId=null,predicted=null,predictedOthers=[],sequence=0,pending=[],history=[],clockOffset=0,rtt=0,lastState=0,lastFrame=performance.now(),accumulator=0,uiAt=0,retries=0,intent=null,session=null,rosterKey='',phase=null;
let resuming=false;
let savedName='';try{savedName=localStorage.getItem('drift-name')||'';session=JSON.parse(sessionStorage.getItem('drift-room')||'null');}catch{}
$('name').value=savedName;
const inviteCode=new URLSearchParams(location.search).get('room');if(inviteCode)$('code').value=inviteCode.toUpperCase().slice(0,5);
const input={...NEUTRAL},keys=new Set();let joyPointer=null,joySteer=0,gasHeld=false,brakeHeld=false,brakeSince=null,fireHeld=false,firePulseUntil=0,accelPressedAt=null;
const holdResets=[];
const portrait=matchMedia('(orientation: portrait)');
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
    if(msg.type==='pong'){rtt=Date.now()-msg.sent;clockOffset=msg.time+rtt/2-Date.now();setConnection(true,state?`${Math.round(rtt)} MS`:'SERVER ONLINE');return;}
    if(msg.type==='welcome'){resuming=false;myId=msg.id;session={code:msg.code,token:msg.token};saveSession();sequence=0;pending=[];history=[];predicted=null;setBusy(false);return;}
    if(msg.type==='error'){toast(msg.message);setBusy(false);if(resuming){resuming=false;clearRoom();}return;}
    if(msg.type==='left'){clearRoom();return;}
    if(msg.type==='state'){
      lastState=performance.now();const was=state;state=msg;history.push({time:performance.now(),state:msg});if(history.length>12)history.shift();
      const me=msg.players.find(p=>p.id===myId);
      if(me){sequence=Math.max(sequence,me.seq);pending=pending.filter(frame=>frame.seq>me.seq);predicted={...me};predictedOthers=msg.players.filter(p=>p.id!==myId).map(p=>({...p}));if(msg.phase==='racing')for(const frame of pending)predictFleet(predicted,predictedOthers,frame.input,STEP);}
      if(phase!==msg.phase){const previousPhase=phase;phase=msg.phase;onPhaseChange(previousPhase);}
      if(was&&me?.item&&!was.players.find(p=>p.id===myId)?.item){beep(720,.09,.03);}
    }
  });
  ws.addEventListener('close',event=>{setConnection(false,event.code===4001?'OPEN IN ANOTHER TAB':'RECONNECTING');releaseControls();if(event.code===4001){session=null;saveSession();clearRoom();toast('This driver is connected in another tab.');return;}const delay=Math.min(4000,500*2**retries++);setTimeout(connect,delay);});
  ws.addEventListener('error',()=>{});
}
connect();
setInterval(()=>send({type:'ping',sent:Date.now()}),2000);
function setBusy(busy){$('create').disabled=busy;$('join').disabled=busy;}
function enter(type){const name=$('name').value.trim()||'Driver';try{localStorage.setItem('drift-name',name);}catch{}if(type==='join'&&!/^[A-Z2-9]{5}$/.test($('code').value.toUpperCase()))return toast('Enter the five-character room code.');const msg={type,name,code:$('code').value.toUpperCase()};setBusy(true);if(!send(msg)){intent=msg;toast('Connecting to the race server…');}}
$('create').onclick=()=>enter('create');$('join').onclick=()=>enter('join');$('code').addEventListener('input',()=>{$('code').value=$('code').value.toUpperCase().replace(/[^A-Z2-9]/g,'');});$('code').addEventListener('keydown',e=>{if(e.key==='Enter')enter('join');});$('name').addEventListener('keydown',e=>{if(e.key==='Enter')enter(inviteCode?'join':'create');});
function clearRoom(){state=null;myId=null;session=null;predicted=null;pending=[];history=[];phase=null;rosterKey='';saveSession();releaseControls();document.body.classList.remove('playing');$('race-ui').hidden=true;$('results').hidden=true;$('room-panel').hidden=true;$('entry-panel').hidden=false;setBusy(false);}
function leave(){$('settings').hidden=true;send({type:'leave'});clearRoom();}
$('leave').onclick=leave;$('exit-race').onclick=leave;$('start').onclick=()=>{unlockAudio();send({type:'start'});};$('add-bot').onclick=()=>send({type:'bot'});$('remove-bots').onclick=()=>send({type:'remove-bots'});$('rematch').onclick=()=>send({type:'rematch'});$('ready').onclick=()=>send({type:'ready',round:state?.round});
async function getShareURL(){let origin=location.origin;if(['localhost','127.0.0.1'].includes(location.hostname)){try{const config=await fetch('/api/config').then(r=>r.json());origin=config.lanURLs[0]||origin;}catch{}}return origin+(session?`/?room=${session.code}`:'/');}
$('copy').onclick=async()=>{const link=await getShareURL();try{await navigator.clipboard.writeText(link);toast('Invite copied.');}catch{const t=document.createElement('textarea');t.value=link;document.body.append(t);t.select();const copied=document.execCommand('copy');t.remove();toast(copied?'Invite link copied.':`Invite: ${link}`);}};
const itemMeta=WEAPONS;
function onPhaseChange(previousPhase){
  const playing=state&&state.phase!=='lobby';document.body.classList.toggle('playing',playing);$('race-ui').hidden=!playing;$('entry-panel').hidden=!!state;$('room-panel').hidden=!state;$('results').hidden=state?.phase!=='finished';if(!(previousPhase==='countdown'&&state?.phase==='racing'))releaseControls();pending=[];
  if(previousPhase==='countdown'&&state?.phase==='racing'){const result=state.players.find(p=>p.id===myId)?.launchResult;if(result==='boost')toast('Launch boost');if(result==='spinout')toast('Early start: spinout');}
  if(state?.phase==='countdown'){history=[];world?.resetRound();$('settings').hidden=true;$('dialog').hidden=true;beep(420,.2,.04);predicted={...state.players.find(p=>p.id===myId)};}
  if(state?.phase==='finished')renderResults();
}
function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function chip(color){const el=node('span','car-chip');el.style.setProperty('--car',color);return el;}
function sortedPlayers(){return [...state.players].sort(raceOrder);}
function renderResults(){
  const me=state.players.find(p=>p.id===myId),complete=state.tournamentComplete,champion=state.players.find(p=>p.id===state.tournamentWinnerId);
  $('results-title').textContent=complete?`${champion?.name||'Winner'} wins!`:'Round results';$('round-label').textContent=`ROUND ${state.round}`;
  const list=$('standings');list.replaceChildren();
  for(const result of state.roundResults||[]){const row=node('div','result-row');row.classList.toggle('me',result.id===myId);row.append(node('span','result-rank',String(result.rank)),chip(result.color),node('span','result-name',result.name+(result.id===myId?' (you)':'')),node('span','result-delta',result.delta>0?'+'+result.delta:String(result.delta)),node('strong','result-total',String(result.total)));list.append(row);}
  $('ready').hidden=complete;$('ready').disabled=!!me?.ready;$('ready').textContent=me?.ready?'Ready ✓':'Ready';
  $('rematch').hidden=!complete||state.host!==myId;$('rematch-hint').textContent=complete&&state.host!==myId?'Waiting for host.':'';
  const seconds=Math.max(0,Math.ceil((state.nextRoundAt-Date.now()-clockOffset)/1000));const humans=state.players.filter(p=>!p.bot&&p.connected);
  $('next-round').textContent=complete?`First to ${state.targetScore}`:`${humans.filter(p=>p.ready).length}/${humans.length} ready · Next round in ${seconds}s`;
}
let scoreKey='';
function renderScores(){const key=JSON.stringify([state.round,state.players.map(p=>[p.id,p.score,p.eliminated])]);if(key===scoreKey)return;scoreKey=key;
  const board=$('tournament-scores');board.replaceChildren();
  const label=node('div','score-goal');label.append(node('small','','ROUND '+state.round),node('strong','',`${state.targetScore} TO WIN`));board.append(label);
  for(const p of state.players){const cell=node('div','score-player');cell.classList.toggle('me',p.id===myId);cell.classList.toggle('out',p.eliminated);cell.style.setProperty('--car',p.color);cell.append(chip(p.color),node('span','score-name',p.name),node('strong','score-total',String(p.score||0)));board.append(cell);}
}
function updateUI(now){
  if(!state)return;
  const host=state.host===myId,me=state.players.find(p=>p.id===myId);if(!me)return;
  const key=JSON.stringify([state.players.map(p=>[p.id,p.name,p.color,p.connected]),state.host]);
  if(key!==rosterKey){rosterKey=key;const roster=$('roster');roster.replaceChildren();for(const p of state.players){const row=node('div','driver');row.append(chip(p.color),node('span','',p.name+(p.id===myId?' (you)':'')),node('span','role',p.bot?'BOT':!p.connected?'REJOINING':p.id===state.host?'HOST':'READY'));roster.append(row);}for(let i=state.players.length;i<6;i++){const row=node('div','driver empty');row.append(node('span','','＋'),node('span','','Open slot'));roster.append(row);}$('room-code').textContent=state.code;}
  $('start').hidden=!host;$('add-bot').hidden=!host;$('add-bot').disabled=state.players.length>=6;$('remove-bots').hidden=!host||!state.players.some(p=>p.bot);$('host-hint').textContent=host?'':'Waiting for host.';
  if(state.phase==='lobby')return;
  renderScores();const serverNow=Date.now()+clockOffset;
  $('finish-note').hidden=(!me.finished&&!me.eliminated)||state.phase==='finished';$('finish-note').textContent=me.eliminated?(me.wrecked?'Wrecked':'Eliminated'):'Finished';$('you-label').hidden=me.eliminated;$('race-ui').classList.toggle('spectating',me.eliminated||me.finished);
  const remainingDistance=state.chase?Math.max(0,(me.progress-state.chase.progress)*TRACK_LENGTH):90;
  $('gap').textContent=me.eliminated?'OUT':`${Math.round(remainingDistance)} m`; $('chase-warning').classList.toggle('danger',!me.eliminated&&remainingDistance<25);
  const item=itemMeta[me.item];$('item-icon').textContent=item?.icon||'✦';$('item-label').textContent=({machinegun:'MG',rocket:'ROCKET',flame:'FLAME',railgun:'RAIL',shotgun:'SIDE SHOT',plasma:'PLASMA',chain:'CHAIN',shield:'SHIELD',mine:'MINES',pulse:'PULSE'})[me.item]||'—';$('item-count').textContent=item?(me.item==='flame'?me.ammo.toFixed(1)+'s':me.ammo>1?'×'+me.ammo:''):' ';$('item').classList.toggle('loaded',!!item);
  const damage=damageLevel(me.health);$('health-number').textContent=Math.ceil(me.health);$('health-status').textContent=me.overturned&&!me.wrecked?'FLIPPED':'';$('health-ui').dataset.level=String(damage);[...$('health-bars').children].forEach((bar,i)=>bar.classList.toggle('lit',i<Math.ceil(me.health/20)));$('shield-time').textContent=me.shield>0?'SHIELD '+me.shield.toFixed(1)+'s':'';
  const remaining=(state.startAt-serverNow)/1000;$('countdown').textContent=state.phase==='countdown'?String(Math.max(1,Math.ceil(remaining))):state.phase==='racing'&&remaining>-.8?'GO!':'';
  if(state.phase==='countdown'&&$('countdown').dataset.value!==$('countdown').textContent){$('countdown').dataset.value=$('countdown').textContent;beep(480,.08,.04);}
  if(state.phase==='finished')renderResults();
  if(now-lastState>2000){setConnection(false,'CONNECTION LOST');releaseControls();}
}
function controls(){
  if(portrait.matches){Object.assign(input,NEUTRAL);return;}
  input.steer=clamp(joySteer+(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0),-1,1);
  const held=brakeHeld||keys.has('Space');
  if(held&&brakeSince===null)brakeSince=performance.now();if(!held)brakeSince=null;
  const heldMs=brakeSince===null?-1:performance.now()-brakeSince,mode=brakeMode(heldMs);
  input.reverse=mode.reverse||keys.has('KeyS')||keys.has('ArrowDown');input.brake=mode.brake&&!input.reverse;
  input.fire=fireHeld||keys.has('KeyE')||performance.now()<firePulseUntil;
  const wasAccelerating=input.throttle>.1;input.throttle=input.reverse?0:gasHeld||keys.has('KeyW')||keys.has('ArrowUp')?1:0;
  if(input.throttle>.1&&!wasAccelerating)accelPressedAt=Date.now()+clockOffset;if(input.throttle<=.1)accelPressedAt=null;
  $('brake').style.setProperty('--hold',`${clamp(heldMs/REVERSE_HOLD_MS,0,1)*360}deg`);
  $('brake').classList.toggle('reversing',mode.reverse);$('brake-label').textContent=mode.reverse?'REVERSE':held?'DRIFT':'DRIFT/R';
}
function releaseControls(){
  keys.clear();gasHeld=false;brakeHeld=false;brakeSince=null;fireHeld=false;firePulseUntil=0;accelPressedAt=null;
  for(const reset of holdResets)reset();
  if(joyPointer!==null&&$('joystick').hasPointerCapture(joyPointer))$('joystick').releasePointerCapture(joyPointer);
  joyPointer=null;joySteer=0;Object.assign(input,NEUTRAL);$('stick').style.transform='';$('joystick').setAttribute('aria-valuenow','0');$('gas').classList.remove('held');$('brake').classList.remove('held','reversing');$('brake').style.setProperty('--hold','0deg');$('brake-label').textContent='DRIFT/R';if(state)send({type:'input',seq:++sequence,...NEUTRAL});
}
function holdButton(id,set){
  const el=$(id);let pointer=null;
  const reset=()=>{const id=pointer;pointer=null;set(false);el.classList.remove('held');if(id!==null&&el.hasPointerCapture(id))el.releasePointerCapture(id);};holdResets.push(reset);
  el.addEventListener('pointerdown',e=>{e.preventDefault();if(pointer!==null||portrait.matches)return;pointer=e.pointerId;el.setPointerCapture(pointer);set(true);el.classList.add('held');unlockAudio();});
  const end=e=>{if(e.pointerId===pointer)reset();};for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,end);
}
function flushControls(){controls();if(state?.phase==='countdown'||state?.phase==='racing')send({type:'input',seq:++sequence,...input,accelPressedAt});}
holdButton('gas',v=>{gasHeld=v;flushControls();});holdButton('brake',v=>{brakeHeld=v;brakeSince=v?performance.now():null;});
const joystick=$('joystick');
function moveJoy(e){if(e.pointerId!==joyPointer)return;const rect=joystick.getBoundingClientRect(),dx=(e.clientX-rect.left-rect.width/2)/(rect.width*.42);joySteer=clamp(dx,-1,1);if(Math.abs(joySteer)<.13)joySteer=0;$('stick').style.transform=`translateX(${joySteer*rect.width*.28}px)`;joystick.setAttribute('aria-valuenow',String(joySteer.toFixed(2)));}
joystick.addEventListener('pointerdown',e=>{e.preventDefault();if(joyPointer!==null||portrait.matches)return;joyPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);moveJoy(e);unlockAudio();});joystick.addEventListener('pointermove',moveJoy);
function releaseJoy(e){if(e.pointerId!==joyPointer)return;joyPointer=null;joySteer=0;$('stick').style.transform='';joystick.setAttribute('aria-valuenow','0');}for(const event of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(event,releaseJoy);
function fire(){if(state?.phase==='racing'&&!portrait.matches&&!state.players.find(p=>p.id===myId)?.eliminated){firePulseUntil=performance.now()+70;send({type:'input',seq:++sequence,...input,fire:true});beep(200,.03,.012);}}
holdButton('item',held=>{fireHeld=held;if(held)fire();});
window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||!state||state.phase==='lobby'||portrait.matches||!$('settings').hidden||!$('dialog').hidden)return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyS','KeyA','KeyD','KeyE'].includes(e.code)){e.preventDefault();keys.add(e.code);flushControls();if(e.code==='KeyE'&&!e.repeat)fire();unlockAudio();}});
window.addEventListener('keyup',e=>{keys.delete(e.code);flushControls();});window.addEventListener('blur',releaseControls);
document.addEventListener('visibilitychange',()=>{releaseControls();if(document.hidden){accumulator=0;if(gain&&audio){gain.gain.cancelScheduledValues(audio.currentTime);gain.gain.setValueAtTime(0,audio.currentTime);}}});
portrait.addEventListener('change',()=>{releaseControls();world?.resize();});
// iOS needs the callout, selection and touch-default behaviours handled separately.
// Keep native editing in the two lobby inputs; game surfaces never select or zoom.
const editable=target=>target instanceof Element&&!!target.closest('input,textarea,[contenteditable="true"]');
for(const event of ['contextmenu','selectstart','dragstart'])document.addEventListener(event,e=>{if(!editable(e.target))e.preventDefault();});
for(const event of ['touchstart','touchmove','touchend'])document.addEventListener(event,e=>{if(e.target instanceof Element&&e.target.closest('.controls,#scene')&&e.cancelable)e.preventDefault();},{passive:false});
for(const event of ['gesturestart','gesturechange','gestureend','dblclick'])document.addEventListener(event,e=>{if(document.body.classList.contains('playing')&&!editable(e.target)&&e.cancelable)e.preventDefault();},{passive:false});
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Use your browser’s full-screen or Add to Home Screen option.');}};
$('howto').onclick=()=>{$('settings').hidden=true;releaseControls();$('dialog-body').innerHTML='<h2>Controls</h2><p>Hold GAS to accelerate. Move the left stick sideways to steer.</p><p>Hold DRIFT/R briefly to slide, or for 0.7 seconds to reverse.</p><p>Drive through a floating weapon to collect it. Tap the item button to use it. Hold for machine gun, plasma or flamethrower.</p><p>Start holding GAS at 1 second remaining (±20 ms) for a boost. Holding from more than 2 seconds early causes a spinout.</p><p>Stay ahead of the red cutoff line. Last car standing wins the round; otherwise finish three laps. Earn 3 points for first, 2 for second, and −2 for last. First to 15 wins with up to four cars; first to 10 with five or six. Tap Ready between rounds, or wait five seconds. The next grid starts where the winner finished. Water is fatal.</p><p>Keyboard: W/↑ gas · A/D or ←/→ steer · S/↓ reverse · Space drift · E item.</p>';$('dialog').hidden=false;};
$('phone').onclick=async()=>{$('settings').hidden=true;releaseControls();const url=await getShareURL();const isPublic=new URL(url).protocol==='https:';const content=$('dialog-body');content.replaceChildren(node('h2','','Open on your phone'),node('p','',isPublic?'Scan the code on your phone, or share the link with your friends. It works over Wi-Fi or mobile data.':'Connect your phone to the same Wi-Fi as this laptop, then scan the code. Keep the laptop awake and the server running.'));const img=node('img','qr');img.alt='QR code to open the game on your phone';img.src=`/api/qr?url=${encodeURIComponent(url)}`;const link=node('a','phone-link',url);link.href=url;content.append(img,link,node('p','',location.hostname.endsWith('.trycloudflare.com')?'This preview runs on the laptop. Keep it awake.':isPublic?'Share this link to join from another device.':'Keep the laptop awake while playing on this local address.'));$('dialog').hidden=false;};
$('close-dialog').onclick=()=>{$('dialog').hidden=true;};$('dialog').onclick=e=>{if(e.target===$('dialog'))$('dialog').hidden=true;};
$('settings-open').onclick=()=>{releaseControls();$('exit-race').hidden=!state||state.phase==='lobby';$('settings').hidden=false;$('settings-close').focus();};
function closeSettings(){$('settings').hidden=true;$('settings-open').focus();}
$('settings-close').onclick=closeSettings;$('settings').onclick=e=>{if(e.target===$('settings'))closeSettings();};
window.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSettings();$('dialog').hidden=true;}});
let audio=null,osc=null,gain=null,soundEnabled=false;function unlockAudio(){if(!soundEnabled)return;if(!audio){audio=new(window.AudioContext||window.webkitAudioContext)();osc=audio.createOscillator();gain=audio.createGain();osc.type='sawtooth';gain.gain.value=0;const filter=audio.createBiquadFilter();filter.frequency.value=350;osc.connect(filter);filter.connect(gain);gain.connect(audio.destination);osc.start();}if(audio.state==='suspended')audio.resume();}
function beep(freq,duration,volume){if(!audio||!soundEnabled)return;const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=freq;g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}
$('sound').onclick=()=>{soundEnabled=!soundEnabled;$('sound-state').textContent=soundEnabled?'ON':'OFF';$('sound').setAttribute('aria-label',soundEnabled?'Mute sound':'Enable sound');unlockAudio();if(!soundEnabled&&gain){gain.gain.cancelScheduledValues(audio.currentTime);gain.gain.setValueAtTime(0,audio.currentTime);}};
function interpolatedState(now){
  if(!state||history.length<2||state.phase!=='racing')return state;
  const target=now-90;let a=history[0],b=history.at(-1);for(let i=1;i<history.length;i++)if(history[i].time>=target){a=history[i-1];b=history[i];break;}
  const t=clamp((target-a.time)/Math.max(1,b.time-a.time),0,1);
  const ca=a.state.camera,cb=b.state.camera;const da=a.state.chase,db=b.state.chase;
  const mix=(x,y)=>x+(y-x)*t;
  const camera=ca&&cb?{x:mix(ca.x,cb.x),z:mix(ca.z,cb.z),angle:ca.angle+angleDelta(cb.angle,ca.angle)*t,halfWidth:mix(ca.halfWidth,cb.halfWidth),halfHeight:mix(ca.halfHeight,cb.halfHeight)}:state.camera;
  const chase=da&&db?{...state.chase,x:mix(da.x,db.x),z:mix(da.z,db.z),angle:da.angle+angleDelta(db.angle,da.angle)*t}:state.chase;
  return {...state,camera,chase,players:state.players.map(p=>{if(p.id===myId)return p;const live=predicted&&!predicted.eliminated&&now-lastState<250?predictedOthers.find(q=>q.id===p.id):null;if(live)return {...p,x:live.x,z:live.z,angle:live.angle,y:live.y,roll:live.roll,pitch:live.pitch,vx:live.vx,vz:live.vz};const p0=a.state.players.find(q=>q.id===p.id),p1=b.state.players.find(q=>q.id===p.id);if(!p0||!p1)return p;return {...p,y:mix(p0.y||0,p1.y||0),roll:mix(p0.roll||0,p1.roll||0),pitch:mix(p0.pitch||0,p1.pitch||0),x:p0.x+(p1.x-p0.x)*t,z:p0.z+(p1.z-p0.z)*t,angle:p0.angle+angleDelta(p1.angle,p0.angle)*t};})};
}
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;controls();if(state?.phase==='countdown')$('countdown').textContent=String(Math.max(1,Math.ceil((state.startAt-Date.now()-clockOffset)/1000)));accumulator+=dt;
  while(accumulator>=STEP){accumulator-=STEP;if(state&&ws?.readyState===WebSocket.OPEN&&!document.hidden){const active=['racing','countdown'].includes(state.phase)&&now-lastState<1000&&!portrait.matches&&$('settings').hidden&&$('dialog').hidden&&!predicted?.eliminated;const command={...(active?input:NEUTRAL)},seq=++sequence;send({type:'input',seq,...command,accelPressedAt});if(active&&state.phase==='racing'&&predicted){predictFleet(predicted,predictedOthers,command,STEP);pending.push({seq,input:command});if(pending.length>120)pending.shift();}}}
  world?.update(interpolatedState(now),myId,predicted,dt,now);
  if(state&&world){const pos=world.screenPosition(myId);if(pos){$('you-label').style.left=`${pos.x}px`;$('you-label').style.top=`${pos.y}px`;}}
  if(now-uiAt>100){uiAt=now;updateUI(now);}
  if(audio&&soundEnabled&&gain){const moving=engineAudible(state?.phase,predicted,ws?.readyState===WebSocket.OPEN,!document.hidden,now-lastState<1000);if(moving)gain.gain.setTargetAtTime(.018,audio.currentTime,.1);else{gain.gain.cancelScheduledValues(audio.currentTime);gain.gain.setValueAtTime(0,audio.currentTime);}osc.frequency.setTargetAtTime(45+Math.hypot(predicted?.vx||0,predicted?.vz||0)*5,audio.currentTime,.05);}
}
requestAnimationFrame(frame);
