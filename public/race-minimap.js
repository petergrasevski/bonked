import {trackAt,activeTrack,START_FRACTION,TRACK_LENGTH} from '../shared/game.js';

export function minimapProjection(points,width=240,height=180,padding=16){
  const xs=points.map(p=>p.x),zs=points.map(p=>p.z);
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...zs),bottom=Math.max(...zs);
  const scale=Math.min((width-padding*2)/Math.max(1,right-left),(height-padding*2)/Math.max(1,bottom-top));
  const cx=(left+right)/2,cz=(top+bottom)/2;
  return {scale,point:(x,z)=>({x:width/2+(x-cx)*scale,y:height/2+(z-cz)*scale})};
}
// Fit the pack and both ends of the death line, rather than the entire circuit.
// Expand immediately to contain new positions; ease the pan and inward zoom.
export function minimapFocus(state,previous=null,dt=.05){
  const points=state.players.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)).map(p=>({x:p.x,z:p.z}));
  const line=state.chase;
  if(line&&Number.isFinite(line.progress)){
    const road=trackAt(START_FRACTION+line.progress),half=road.halfWidth+5;
    for(const side of [-1,1])points.push({x:(line.x??road.x)+road.nx*half*side,z:(line.z??road.z)+road.nz*half*side});
  }
  const running=state.players.filter(p=>!p.eliminated&&Number.isFinite(p.progress));
  if(running.length)points.push(trackAt(START_FRACTION+Math.max(...running.map(p=>p.progress))+45/TRACK_LENGTH));
  if(!points.length)points.push({x:0,z:0});
  const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.z)),bottom=Math.max(...points.map(p=>p.z));
  const aspect=208/148,margin=20,targetX=(left+right)/2,targetZ=(top+bottom)/2;
  const targetWidth=Math.max(180,right-left+margin*2,(bottom-top+margin*2)*aspect),move=1-Math.exp(-Math.max(0,dt)*7);
  const x=previous?previous.x+(targetX-previous.x)*move:targetX,z=previous?previous.z+(targetZ-previous.z)*move:targetZ;
  const eased=previous?previous.width+(targetWidth-previous.width)*move:targetWidth;
  const width=Math.max(eased,2*(Math.max(right-x,x-left)+margin),2*(Math.max(bottom-z,z-top)+margin)*aspect);
  return {x,z,width};
}
export function focusedProjection(focus){
  const half=focus.width/2,height=half*148/208;
  return minimapProjection([{x:focus.x-half,z:focus.z-height},{x:focus.x+half,z:focus.z+height}]);
}
export const showRaceMinimap=(state,enabled)=>!!enabled&&state?.trackId!=='cafe'&&['countdown','racing'].includes(state?.phase);

export class RaceMinimap{
  constructor(parent){
    this.root=document.createElement('aside');this.root.className='race-minimap';this.root.hidden=true;
    this.canvas=document.createElement('canvas');this.canvas.width=480;this.canvas.height=360;this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','Race minimap: car colours show all drivers, the white ring marks you, and the red bar marks the death line.');
    const key=document.createElement('div');key.className='minimap-key';
    for(const [name,text]of [['you','◎ You'],['','● Drivers'],['death','━ Death line']]){const label=document.createElement('span');label.className=name;label.textContent=text;key.append(label);}
    this.root.append(this.canvas,key);parent.append(this.root);this.ctx=this.canvas.getContext('2d');this.track=null;this.lastDraw=-Infinity;
    this.route=document.createElement('canvas');this.route.width=480;this.route.height=360;
  }
  hide(){this.root.hidden=true;}
  prepare(){
    this.track=activeTrack.id;this.points=Array.from({length:512},(_,i)=>trackAt(i/512));
  }
  drawRoute(){
    const ctx=this.route.getContext('2d');ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,240,180);
    const points=this.points;
    // The closed ribbon traces both road edges, so wide corners stay readable.
    ctx.beginPath();
    for(const side of [-1,1]){
      const edge=side===-1?points:[...points].reverse();
      edge.forEach((p,i)=>{const q=this.projection.point(p.x+p.nx*p.halfWidth*side,p.z+p.nz*p.halfWidth*side);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});ctx.closePath();
    }
    ctx.fillStyle='#647a8c';ctx.fill('evenodd');ctx.strokeStyle='#a7bdca';ctx.lineWidth=.7;ctx.stroke();
    ctx.beginPath();points.forEach((p,i)=>{const q=this.projection.point(p.x,p.z);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});ctx.closePath();ctx.strokeStyle='#8295a3';ctx.lineWidth=1;ctx.stroke();
  }
  update(state,localId,{enabled=false,now=0}={}){
    if(!showRaceMinimap(state,enabled)||state.trackId!==activeTrack.id){this.hide();return;}
    const wasHidden=this.root.hidden;this.root.hidden=false;
    if(!wasHidden&&this.track===activeTrack.id&&now-this.lastDraw<50)return;
    const dt=Number.isFinite(this.lastDraw)?Math.min(.25,Math.max(0,(now-this.lastDraw)/1000)):.05;
    this.lastDraw=now;const changed=this.track!==activeTrack.id;if(changed)this.prepare();
    this.focus=minimapFocus(state,wasHidden||changed?null:this.focus,dt);this.projection=focusedProjection(this.focus);this.drawRoute();
    const ctx=this.ctx;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,480,360);ctx.drawImage(this.route,0,0);ctx.setTransform(2,0,0,2,0,0);
    const point=(x,z)=>this.projection.point(x,z),line=state.chase;
    if(line?.active){
      const road=trackAt(line.progress+START_FRACTION),half=Math.max(6,(road.halfWidth+4)*this.projection.scale),center=point(line.x??road.x,line.z??road.z);
      ctx.beginPath();ctx.moveTo(center.x-road.nx*half,center.y-road.nz*half);ctx.lineTo(center.x+road.nx*half,center.y+road.nz*half);ctx.strokeStyle='#ff4b55';ctx.lineWidth=3;ctx.lineCap='round';ctx.stroke();
    }
    for(const player of [...state.players.filter(p=>p.id!==localId),...state.players.filter(p=>p.id===localId)]){
      const p=point(player.x,player.z),local=player.id===localId;
      p.x=Math.max(6,Math.min(234,p.x));p.y=Math.max(6,Math.min(174,p.y));
      ctx.globalAlpha=player.eliminated?.35:1;ctx.beginPath();ctx.arc(p.x,p.y,local?4:3,0,Math.PI*2);ctx.fillStyle=player.color||'#fff';ctx.fill();ctx.strokeStyle=local?'#fff5dc':'#0b1924';ctx.lineWidth=local?2:1;ctx.stroke();
      if(local){ctx.beginPath();ctx.moveTo(p.x+Math.cos(player.angle)*6,p.y+Math.sin(player.angle)*6);ctx.lineTo(p.x+Math.cos(player.angle+.8)*3,p.y+Math.sin(player.angle+.8)*3);ctx.lineTo(p.x+Math.cos(player.angle-.8)*3,p.y+Math.sin(player.angle-.8)*3);ctx.closePath();ctx.fillStyle='#fff5dc';ctx.fill();}
    }
    ctx.globalAlpha=1;
  }
}
