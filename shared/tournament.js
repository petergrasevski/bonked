import { raceOrder } from './chase.js';
export const targetScoreForPlayers=count=>count<=4?15:10;
export const ROUND_WAIT_MS=5000;
export const PLACE_POINTS=[3,2,1,0,-1,-1,-1,-2];
export function scoreRound(room,now){
  if(room.roundResults?.length)return; // Repeated finish ticks must never award points twice.
  const order=[...room.players.values()].sort(raceOrder);
  room.winnerId=order[0]?.id??null;
  room.nextStartFraction=order[0]?.car.trackFraction??room.roundStartFraction;
  room.roundResults=order.map((p,index)=>{
    const delta=order.length>1&&index===order.length-1?-2:PLACE_POINTS[index]??0;p.score=(p.score||0)+delta;p.ready=!!p.bot;
    return {id:p.id,name:p.name,color:p.color,rank:index+1,delta,total:p.score};
  });
  const champion=order.filter(p=>p.score>=(room.targetScore??targetScoreForPlayers(room.players.size))).sort((a,b)=>b.score-a.score||raceOrder(a,b))[0];
  room.tournamentWinnerId=champion?.id??null;room.tournamentComplete=!!champion;
  room.nextRoundAt=champion?null:now+ROUND_WAIT_MS;
}
export function nextRoundDue(room,now){
  if(room.phase!=='finished'||room.tournamentComplete||!room.roundResults?.length)return false;
  const humans=[...room.players.values()].filter(p=>!p.bot&&p.ws);
  return now>=room.nextRoundAt||(humans.length>0&&humans.every(p=>p.ready));
}
