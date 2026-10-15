import {angleDelta} from '../shared/game.js';

// One-and-a-half ticks of presentation buffering bridges worker/render cadence
// without predicting a second game. Authority and collision results stay intact.
export class LocalPresentation {
  constructor({delayMs=25}={}){this.delayMs=delayMs;this.reset();}
  reset(){this.frames=[];this.epoch=null;this.offset=Infinity;this.lastTarget=-Infinity;}
  push(state,receivedAt){
    const epoch=`${state.trackId}:${state.round}:${state.phase}:${state.startAt}`;
    if(epoch!==this.epoch){this.reset();this.epoch=epoch;}
    const time=(state.simulationTick||0)*1000/60;
    this.offset=Math.min(this.offset,receivedAt-time);
    const frame={state,time};
    if(this.frames.at(-1)?.time===time)this.frames[this.frames.length-1]=frame;else this.frames.push(frame);
    if(this.frames.length>20)this.frames.shift();
  }
  render(state,now){
    if(state?.phase!=='racing'||this.frames.length<2)return state;
    const latest=this.frames.at(-1),first=this.frames[0];
    const target=Math.max(this.lastTarget,Math.min(latest.time,now-this.offset-this.delayMs));this.lastTarget=target;
    let a=first,b=latest;
    for(let i=1;i<this.frames.length;i++)if(this.frames[i].time>=target){a=this.frames[i-1];b=this.frames[i];break;}
    const t=b.time>a.time?Math.max(0,Math.min(1,(target-a.time)/(b.time-a.time))):1;
    const old=new Map(a.state.players.map(p=>[p.id,p]));
    const players=state.players.map(car=>{
      const previous=old.get(car.id),next=b.state.players.find(p=>p.id===car.id);
      if(!previous||!next||previous.eliminated!==car.eliminated||next.eliminated!==car.eliminated||Math.hypot(previous.x-next.x,previous.z-next.z)>12)return car;
      const pose={...car};
      for(const key of ['x','y','z','angle','pitch','roll','progress']){
        if(!Number.isFinite(previous[key])||!Number.isFinite(next[key]))continue;
        const delta=['angle','pitch','roll'].includes(key)?angleDelta(next[key],previous[key]):next[key]-previous[key];
        pose[key]=previous[key]+delta*t;
      }
      return pose;
    });
    return {...state,players,raceTime:(a.state.raceTime||0)+((b.state.raceTime||0)-(a.state.raceTime||0))*t};
  }
}
