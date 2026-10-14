import {LanPeer,LanSignalingClient,LAN_CONNECTION_HELP} from './lan-peer.js';
import {bindTouchSteering,driveThrottle} from './touch-controls.js';

const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
const portrait=matchMedia('(orientation: portrait)');
let peer=null,signalClient=null,identity=null,hostId=null,generation=null,state=null,sequence=0,clockOffset=0,lastState=-Infinity,retryTimer=null,joined=false;
let fireHeld=false,firePulseUntil=0,reverseHeld=false,gasHeld=false,steer=0,nudge=0,nudgeUntil=0,accelPressedAt=null,wasThrottle=false,skyAim=null,aimY=0;
const resets=[];
let resume,wakeLock=null;try{resume=JSON.parse(sessionStorage.getItem('bonked-lan-controller')||'null');$('name').value=localStorage.getItem('drift-name')||'';}catch{}
$('code').value=(query.get('room')||resume?.code||'').toUpperCase().slice(0,3);
const revision=document.querySelector('meta[name="bonked-revision"]')?.content;
function setStatus(text){$('connection').textContent=text;}
function showError(message){release();$('error').textContent=message;$('help').hidden=false;$('entry').hidden=true;$('controller').hidden=true;$('rotate').hidden=true;$('join').disabled=false;setStatus('Not connected locally');}
function save(){try{sessionStorage.setItem('bonked-lan-controller',JSON.stringify({code:identity.code,token:identity.token}));}catch{}}
function join(){
  const name=$('name').value.trim(),code=$('code').value.trim().toUpperCase();if(!name){$('name').focus();return;}if(!/^[A-Z]{3}$/.test(code)){$('code').focus();return;}
  if(!window.RTCPeerConnection)return showError('This browser does not support WebRTC. Try Safari or Chrome.');
  try{localStorage.setItem('drift-name',name);}catch{}
  $('join').disabled=true;$('help').hidden=true;setStatus('Finding the laptop…');
  const previousPeer=peer;peer=null;previousPeer?.close();signalClient?.close(false);joined=false;
  signalClient=new LanSignalingClient({onMessage:receiveSignal,onStatus:status=>{if(status==='replaced'){showError('This controller was opened in another tab.');return;}if(status==='reconnecting')setStatus(peer?.opened?'Local controls connected · setup server reconnecting':'Reconnecting to setup server…');}});
  signalClient.start({type:'lan-join',code,name,revision,...(resume?.code===code?{token:resume.token}:{})});
  clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(!joined)showError('Could not connect to the laptop. '+LAN_CONNECTION_HELP);},25000);
}
function receiveSignal(msg){
  if(msg.type==='error'){showError(msg.message);return;}
  if(msg.type==='lan-ended'){peer?.close();showError(msg.message);resume=null;try{sessionStorage.removeItem('bonked-lan-controller');}catch{}return;}
  if(msg.type==='lan-welcome'){identity=msg;resume={code:msg.code,token:msg.token};save();$('leave').hidden=false;setStatus('Connecting over local Wi-Fi…');return;}
  if(msg.type!=='lan-signal')return;
  if(msg.signal.description?.type==='offer'){
    const old=peer;peer=null;old?.close();joined=false;hostId=msg.from;generation=msg.generation;
    const next=peer=new LanPeer({
      signal:signal=>signalClient.send({type:'lan-signal',to:hostId,generation,signal}),
      onMessage:message=>{if(peer===next)receive(message);},
      onOpen:()=>{setStatus('Local Wi-Fi connected');},
      onClose:()=>{if(peer!==next)return;joined=false;release();showError('The local connection was interrupted. '+LAN_CONNECTION_HELP);},
      onStatus:status=>{if(['failed','timeout'].includes(status))showError('Could not establish a local connection. '+LAN_CONNECTION_HELP);},
    });
  }
  if(peer&&msg.generation===generation)peer.receive(msg.signal);
}
function receive(msg){
  if(msg.type==='welcome'){sequence=msg.seq||0;joined=true;clearTimeout(retryTimer);$('entry').hidden=true;$('help').hidden=true;$('controller').hidden=false;$('leave').hidden=false;setStatus('Local Wi-Fi connected');peer?.send({type:'ping',sent:Date.now()});rotate();wake();return;}
  if(msg.type==='error'){showError(msg.message);return;}
  if(msg.type==='left'){leave();return;}
  if(msg.type==='pong'){const rtt=Date.now()-msg.sent;if(rtt>=0&&rtt<2000){clockOffset=msg.time+rtt/2-Date.now();setStatus(`Local Wi-Fi · ${rtt} ms`);}return;}
  if(msg.type!=='state'||!identity)return;
  const previous=state;state=msg;lastState=performance.now();
  if(previous?.round!==state.round||previous?.phase!==state.phase){if(!(previous?.phase==='countdown'&&state.phase==='racing'))release();skyAim=null;}
  const target=me()?.skyTarget;if(target&&skyAim&&Math.hypot(target.x-skyAim.x,target.z-skyAim.z)>5)skyAim={x:target.x,z:target.z};
  render();
}
function me(){return state?.players.find(p=>p.id===identity?.id);}
function enabled(){return joined&&peer?.opened&&!document.hidden&&!portrait.matches&&$('help').hidden&&performance.now()-lastState<1500&&['countdown','racing'].includes(state?.phase);}
function input(){
  const active=enabled(),driver=me(),sky=active&&driver?.eliminated;
  const throttle=active&&!sky?driveThrottle({mobile:true,phase:state?.phase,reverse:reverseHeld,accelerating:gasHeld}):0;
  if(throttle&&!wasThrottle)accelPressedAt=Date.now()+clockOffset;if(!throttle)accelPressedAt=null;wasThrottle=!!throttle;
  let aim;
  if(sky){skyAim??={x:driver.skyTarget?.x??state.camera?.x??0,z:driver.skyTarget?.z??state.camera?.z??0};const yaw=state.camera?.angle||0;
    skyAim.x+=(-steer*Math.sin(yaw)+aimY*Math.cos(yaw))*1.2;skyAim.z+=(steer*Math.cos(yaw)+aimY*Math.sin(yaw))*1.2;aim={...skyAim};}
  return {type:'input',seq:++sequence,steer:active&&!sky?steer:0,throttle,reverse:active&&!sky&&reverseHeld,brake:false,fire:active&&(fireHeld||performance.now()<firePulseUntil),nudge:active&&!sky&&performance.now()<nudgeUntil?nudge:0,accelPressedAt,...(aim?{skyAim:aim}:{})};
}
function flush(){peer?.send(input());}
function release(){fireHeld=false;firePulseUntil=0;reverseHeld=false;gasHeld=false;steer=0;nudge=0;nudgeUntil=0;aimY=0;accelPressedAt=null;wasThrottle=false;for(const reset of resets)reset();peer?.send({type:'input',seq:++sequence,steer:0,throttle:0,reverse:false,brake:false,fire:false,nudge:0});}
function buzz(){navigator.vibrate?.(12);}
function hold(id,set){const button=$(id);let pointer=null;const reset=()=>{const old=pointer;pointer=null;set(false);button.classList.remove('held');if(old!==null&&button.hasPointerCapture(old))button.releasePointerCapture(old);};resets.push(reset);
  button.onpointerdown=e=>{if(!enabled()||pointer!==null)return;e.preventDefault();pointer=e.pointerId;button.setPointerCapture(pointer);button.classList.add('held');set(true);buzz();flush();};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{if(e.pointerId===pointer){reset();flush();}});
}
resets.push(bindTouchSteering($('steering'),{enabled,steer:value=>{steer=value;$('left').classList.toggle('held',value<0);$('right').classList.toggle('held',value>0);flush();},nudge:direction=>{nudge=direction;nudgeUntil=performance.now()+120;flush();},activate:buzz}));
hold('fire',value=>{fireHeld=value;if(value){firePulseUntil=performance.now()+70;peer?.send({type:'item'});}});hold('reverse',value=>{reverseHeld=value;if(me()?.eliminated)aimY=value?-1:0;});hold('gas',value=>{gasHeld=value;if(me()?.eliminated)aimY=value?1:0;});
for(const [id,direction]of [['nudge-left',-1],['nudge-right',1]])hold(id,value=>{if(value){nudge=direction;nudgeUntil=performance.now()+120;}});
function render(){const driver=me();if(!driver)return;document.documentElement.style.setProperty('--car',driver.color);$('driver').textContent=driver.name;$('health').textContent=driver.eliminated?'SPECTATING':Math.ceil(driver.health)+' HP';
  $('ready').hidden=state.phase!=='finished'||state.tournamentComplete;$('ready').disabled=!!driver.ready;
  $('ready').textContent=driver.ready?'Ready ✓':'Ready for next round ✓';
  const sky=driver.eliminated&&state.phase==='racing';$('weapon-icon').textContent=sky?'ϟ':'✦';$('weapon').textContent=sky?'SKY BEAM':String(driver.item||'NO WEAPON').replace('machinegun','MACHINE GUN').toUpperCase();$('ammo').textContent=sky?'Aim with arrows · hold to fire':driver.item?`${typeof driver.ammo==='number'?Math.round(driver.ammo*10)/10:''} · hold to fire`:'Find a pickup';
  $('control-hint').textContent=sky?'Left / right to aim · GO / reverse for up / down · watch your coloured target on the laptop':'Accelerates automatically at GO · hold left / right to steer';
  $('status').textContent=state.phase==='lobby'?'Watch the laptop · waiting for host':state.phase==='finished'?(state.tournamentComplete?'Tournament complete · watch the laptop':'Round complete · tap Ready'):state.phase==='countdown'?String(Math.max(1,Math.ceil((state.startAt-Date.now()-clockOffset)/1000))):driver.finished?'Finished · watch the laptop':sky?'Sky beam · keep playing from above':driver.overturned?'Hold left or right to roll upright':'Eyes on the laptop';
}
function rotate(){release();$('rotate').hidden=!joined||!portrait.matches||!$('help').hidden;}
async function wake(){try{if(navigator.wakeLock&&!document.hidden&&(!wakeLock||wakeLock.released))wakeLock=await navigator.wakeLock.request('screen');}catch{}}
function leave(){wakeLock?.release().catch(()=>{});wakeLock=null;const old=peer;peer=null;old?.close();signalClient?.close();signalClient=null;joined=false;identity=null;resume=null;state=null;clearTimeout(retryTimer);release();try{sessionStorage.removeItem('bonked-lan-controller');}catch{}$('entry').hidden=false;$('help').hidden=true;$('controller').hidden=true;$('rotate').hidden=true;$('leave').hidden=true;$('join').disabled=false;setStatus('Connect to the laptop');}
$('join').onclick=join;$('retry').onclick=()=>{joined=false;join();};$('leave').onclick=leave;$('ready').onclick=()=>peer?.send({type:'ready',round:state?.round});
$('code').oninput=()=>{$('code').value=$('code').value.toUpperCase().replace(/[^A-Z]/g,'');};
for(const id of ['name','code'])$(id).onkeydown=e=>{if(e.key==='Enter')join();};
window.addEventListener('blur',release);portrait.addEventListener('change',rotate);document.addEventListener('visibilitychange',()=>{release();if(!document.hidden){wake();peer?.send({type:'ping',sent:Date.now()});}});
for(const event of ['contextmenu','selectstart','dragstart'])$('controller').addEventListener(event,e=>e.preventDefault());
setInterval(()=>{if(joined){if(performance.now()-lastState>1500)release();else flush();}},1000/60);
setInterval(()=>{if(joined&&!document.hidden)peer?.send({type:'ping',sent:Date.now()});},2000);
