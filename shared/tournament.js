import { raceOrder } from './chase.js';
export const targetScoreForPlayers=count=>count<=4?15:10;
export const ROUND_WAIT_MS=5000;
export const PLACE_POINTS=[3,2,1,0,-1,-1,-1,-2];
export function scoreRound(room,now){
  if(room.roundResults?.length)return; // Repeated finish ticks must never award points twice.
  const order=[...room.players.values()].sort(room.gameType==='battle-arena'?(a,b)=>Number(a.car.eliminated)-Number(b.car.eliminated)||(b.car.health||0)-(a.car.health||0)||(b.car.eliminatedAt||0)-(a.car.eliminatedAt||0):raceOrder);
  room.winnerId=order[0]?.id??null;
  room.nextStartFraction=order[0]?.car.trackFraction??room.roundStartFraction;
  room.roundResults=order.map((p,index)=>{
    const award=order.length>1&&index===order.length-1?-2:PLACE_POINTS[index]??0;
    const kills=room.gameType==='battle-arena'?(p.roundKills||0):0;
    const previous=Math.max(0,room.gameType==='battle-arena'?(p.roundStartScore??(p.score||0)-kills):(p.score||0));
    // Kill bonuses were published as they happened. Apply placement to the
    // opening balance, then retain those bonuses even at the zero-score floor.
    p.score=Math.max(0,previous+award)+kills;const delta=p.score-previous;p.ready=!!p.bot;
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
