// Pending slots give immediate feedback without inventing an authoritative bot.
export class OptimisticBots{
  constructor({now=()=>Date.now(),id=()=>crypto.randomUUID()}={}){this.now=now;this.id=id;this.pending=[];}
  add(players,max){if(players.length+this.pending.length>=max)return null;const request={id:this.id(),at:this.now()};this.pending.push(request);return request;}
  reconcile(players){const confirmed=new Set(players.map(p=>p.botRequestId));this.pending=this.pending.filter(p=>!confirmed.has(p.id));}
  reject(id){this.pending=this.pending.filter(p=>p.id!==id);}
  expire(){const before=this.pending.length;this.pending=this.pending.filter(p=>this.now()-p.at<10000);return before!==this.pending.length;}
  clear(){this.pending=[];}
}
