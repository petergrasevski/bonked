import {isJoyConPair,splitJoyCon} from './joy-con-inputs.js';
import {MAX_PLAYERS,PLAYER_GRACE_MS} from '../shared/session-limits.js';
import {STANDARD_MAPPING,decodeController,controllerMapping,controllerName,gamepadButton} from './controller.js';

const neutral={steer:0,throttle:0,reverse:false,brake:false,fire:false,nudge:0};
const anyButton=pad=>pad.buttons.some((_,index)=>gamepadButton(pad,index));
const resting=input=>!input.throttle&&!input.reverse&&!input.fire&&!input.left&&!input.right&&!input.ready&&Math.abs(input.steer)<.1&&Math.abs(input.aimY)<.1;

// Device routing only; all players use the same worker command interface.
export class LocalControllers {
  constructor({join,send,disconnect,remove,configure=()=>{},notify=()=>{},storage,uuid=()=>crypto.randomUUID(),graceMs=PLAYER_GRACE_MS}){
    Object.assign(this,{join,send,disconnect,remove,configure,notify,storage,uuid,graceMs});this.joyConPairs=new Map();this.devices=new Map();this.slots=new Map();this.profiles={};this.pendingDevice=null;this.state=null;
    try{const saved=JSON.parse(storage?.getItem('bonked-controller-mappings')||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))this.profiles=saved;}catch{}
  }
  poll(pads,{state,active=true,now=performance.now(),wallTime=Date.now(),dt=1/60}={}){
    this.state=state;const expanded=Array.from(pads||[]).filter(p=>p?.connected).flatMap(pad=>this.joyConPairs.get(pad.index)===pad.id&&isJoyConPair(pad)?splitJoyCon(pad):[pad]);const present=new Map(expanded.map(p=>[p.index,p]));
    for(const [index,device]of this.devices){const pad=present.get(index);if(!pad||pad.id!==device.rawId)this.disconnected(index,now);}
    for(const slot of this.slots.values())if(slot.device===null&&now-slot.disconnectedAt>this.graceMs){this.slots.delete(slot.id);this.remove(slot.id);}
    for(const pad of present.values()){
      let device=this.devices.get(pad.index);
      if(!device){device={index:pad.index,rawId:pad.id,label:controllerName(pad.id),pad,slotId:null,down:false,input:null};this.devices.set(pad.index,device);}
      device.pad=pad;device.physicalIndex=pad.physicalIndex??pad.index;device.joyConSide=pad.joyConSide;device.railButtonsAvailable=pad.railButtonsAvailable;device.canSplit=isJoyConPair(pad);device.mapping=controllerMapping(this.profiles[pad.id],pad)||(pad.mapping==='standard'?STANDARD_MAPPING:null);
      const down=anyButton(pad),pressed=down&&!device.down;device.down=down;device.input=decodeController(pad,device.mapping);
      if(!device.slotId){
        if(pressed&&active){
          if(!device.mapping){if(state?.phase==='lobby')this.configure(device);else this.notify('Return to the lobby to configure this controller.');continue;}
          if(this.pendingDevice!==null)continue;
          if([...this.slots.values()].some(s=>s.device===null)){this.pendingDevice=device.index;this.notify('Choose the player to reclaim, or join as a new player.');}
          else this.add(device);
        }
        continue;
      }
      const slot=this.slots.get(device.slotId);if(!slot?.accepted)continue;
      if(pressed||Math.abs(device.input.steer)>.2)slot.highlightUntil=now+600;
      const player=state?.players.find(p=>p.id===slot.id);
      if(!active){if(!slot.blocked)this.releaseSlot(slot);continue;}
      if(slot.blocked){if(resting(device.input)&&!down)slot.blocked=false;else continue;}
      if(device.input.ready&&!slot.previous.ready&&state?.phase==='finished')this.send(slot.id,{type:'ready',round:state.round});
      if(!['countdown','racing'].includes(state?.phase)||!player){slot.previous={...device.input};continue;}
      const input=device.input,throttle=input.reverse?0:input.throttle;
      if(throttle&&!slot.accelerating)slot.accelPressedAt=wallTime;
      if(!throttle)slot.accelPressedAt=null;slot.accelerating=!!throttle;
      if(input.left&&!slot.previous.left){slot.nudge=-1;slot.nudgeUntil=now+120;}
      if(input.right&&!slot.previous.right){slot.nudge=1;slot.nudgeUntil=now+120;}
      const sky=state.phase==='racing'&&player.eliminated;
      let skyAim;
      if(sky){const target=player.skyTarget||state.camera||{x:0,z:0};
        slot.skyAim??={x:target.x,z:target.z};if(Math.hypot(slot.skyAim.x-target.x,slot.skyAim.z-target.z)>6)slot.skyAim={x:target.x,z:target.z};
        const angle=state.camera?.angle||0,speed=Math.min(.05,dt)*70;
        slot.skyAim.x+=(-input.steer*Math.sin(angle)+input.aimY*Math.cos(angle))*speed;slot.skyAim.z+=(input.steer*Math.cos(angle)+input.aimY*Math.sin(angle))*speed;skyAim={...slot.skyAim};
      }else slot.skyAim=null;
      if(input.fire&&!slot.previous.fire){slot.fireUntil=now+70;this.send(slot.id,{type:'item'});}
      const buttonChanged=['throttle','reverse','fire','left','right'].some(key=>input[key]!==slot.previous[key]);
      if(now>=(slot.nextInputAt||0)||buttonChanged){slot.nextInputAt=now+1000/60;this.send(slot.id,{type:'input',seq:++slot.sequence,...neutral,steer:sky?0:input.steer,throttle:sky?0:throttle,reverse:!sky&&input.reverse,fire:input.fire||now<(slot.fireUntil||0),nudge:!sky&&now<slot.nudgeUntil?slot.nudge:0,accelPressedAt:slot.accelPressedAt,...(skyAim?{skyAim}:{})});}
      slot.previous={...input};
    }
  }
  setJoyConSplit(index,split=true){
    if(this.state?.phase!=='lobby')return false;
    const device=this.devices.get(index);if(!device||!(device.canSplit||device.joyConSide))return false;
    const physical=device.physicalIndex;
    const rawId=split?device.rawId:this.joyConPairs.get(physical);
    // Changing player count is a lobby action. Rejoin explicitly so no held
    // button, mapping or old player identity leaks into the other half.
    for(const d of [...this.devices.values()])if(d.physicalIndex===physical){if(d.slotId)this.forget(d.slotId);this.disconnected(d.index);}
    if(split)this.joyConPairs.set(physical,rawId);else this.joyConPairs.delete(physical);
    this.notify(split?'Joy-Cons split. Press a face button on each half to join.':'Joy-Cons combined. Press a button to join.');return true;
  }
  disconnectPhysical(index,now=performance.now()){
    for(const device of [...this.devices.values()])if(device.physicalIndex===index)this.disconnected(device.index,now);
  }
  disconnected(index,now=performance.now()){
    const device=this.devices.get(index);if(!device)return;
    const slot=this.slots.get(device.slotId);
    if(slot){this.releaseSlot(slot);slot.device=null;slot.disconnectedAt=now;this.disconnect(slot.id);}
    if(this.pendingDevice===index)this.pendingDevice=null;this.devices.delete(index);
  }
  add(device,reclaimId){
    if(!device||device.slotId||!device.mapping)return false;
    let slot=reclaimId?this.slots.get(reclaimId):null;
    if(reclaimId&&(!slot||slot.device!==null))return false;
    if(!slot){
      if(this.state?.phase!=='lobby'){this.notify('Return to the lobby to add a player.');return false;}
      if((this.state?.players.length||0)+[...this.slots.values()].filter(s=>!s.accepted).length>=MAX_PLAYERS){this.notify('The grid is full.');return false;}
      const used=new Set([...this.slots.values()].map(s=>s.name));let number=1;while(used.has(`${device.label} ${number}`))number++;
      slot={id:'local-'+this.uuid(),name:`${device.label} ${number}`,device:device.index,accepted:false,sequence:0,blocked:true,previous:{},highlightUntil:0};this.slots.set(slot.id,slot);
    }
    device.slotId=slot.id;slot.device=device.index;slot.disconnectedAt=null;slot.accepted=false;slot.blocked=true;slot.previous={};this.pendingDevice=null;this.join(slot);return true;
  }
  reclaim(id){return this.add(this.devices.get(this.pendingDevice),id);}
  joinNew(){return this.add(this.devices.get(this.pendingDevice));}
  cancelReclaim(){this.pendingDevice=null;}
  receive(id,message){
    const slot=this.slots.get(id);if(!slot)return;
    if(message.type==='welcome'){slot.accepted=true;slot.sequence=Math.max(slot.sequence,message.seq||0);}
    if(message.type==='error'){this.notify(message.message);this.forget(id);}
  }
  releaseSlot(slot){slot.blocked=true;slot.previous={};slot.accelPressedAt=null;slot.accelerating=false;slot.fireUntil=0;slot.nudgeUntil=0;slot.skyAim=null;if(slot.accepted)this.send(slot.id,{type:'input',seq:++slot.sequence,...neutral});}
  release(){for(const slot of this.slots.values())if(slot.device!==null)this.releaseSlot(slot);}
  forget(id){const slot=this.slots.get(id);if(!slot)return;const device=this.devices.get(slot.device);if(device)device.slotId=null;this.slots.delete(id);this.remove(id);}
  setMapping(index,mapping){const device=this.devices.get(index);const valid=controllerMapping(mapping,device?.pad);if(!valid)return false;this.profiles[device.rawId]=valid;device.mapping=valid;if(device.slotId)this.releaseSlot(this.slots.get(device.slotId));try{this.storage?.setItem('bonked-controller-mappings',JSON.stringify(this.profiles));}catch{}return true;}
  dispose(){this.release();this.devices.clear();this.slots.clear();this.pendingDevice=null;}
}
