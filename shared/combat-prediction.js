import {updateCombat} from './combat.js';
// A disposable presentation simulation. Every snapshot replaces it; only the
// authoritative server applies weapon damage. Cars and weapons share the same
// replay ticks, terrain and launch transforms, including held-fire cooldowns.
export class CombatPrediction {
  reset(){this.room=null;}
  reconcile(state,local,others){
    this.time=state.time;
    this.room={phase:state.phase,startAt:state.startAt,serial:0,visualOnly:true,predictionOwner:local.id,
      players:new Map([local,...others].map(car=>[car.id,{id:car.id,car,fireLatch:!!car.fireLatch,input:car.input||{}}]))};
    for(const key of ['projectiles','effects','sounds','mines','chains','arcs','pulses'])this.room[key]=(state[key]||[]).map(item=>({...item}));
  }
  step(input,dt){
    if(!this.room||this.room.phase!=='racing')return;
    this.time+=dt*1000;this.room.players.get(this.room.predictionOwner).simInput=input;
    updateCombat(this.room,dt,this.time);
  }
  view(){
    if(!this.room)return {};
    return Object.fromEntries(['projectiles','effects','sounds','mines','chains','arcs'].map(key=>[key,this.room[key]]));
  }
}
