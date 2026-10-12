import {ROUND_WAIT_MS} from '../shared/tournament.js';
import {createScoreMeter} from './score-meter.js';
export function leaderboardResults(state){
  return (state.roundResults||[]).map(result=>{const player=state.players.find(p=>p.id===result.id);return {...result,total:player?.score??result.total,ready:!!(player?.bot||player?.ready)};})
    .sort((a,b)=>b.total-a.total||a.rank-b.rank);
}
export function readyProgress(nextRoundAt,serverNow){
  return Number.isFinite(nextRoundAt)?Math.max(0,Math.min(1,1-(nextRoundAt-serverNow)/ROUND_WAIT_MS)):0;
}
const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;};
export class RoundResults{
  constructor(root){this.root=root;this.key='';this.find=id=>root.querySelector('#'+id);}
  render(state,myId,serverNow){
    const me=state.players.find(p=>p.id===myId),complete=state.tournamentComplete,champion=state.players.find(p=>p.id===state.tournamentWinnerId),rows=leaderboardResults(state);
    this.find('results-title').textContent=complete?`${champion?.name||'Winner'} wins!`:'Round results';
    this.find('results-target').textContent=`${state.targetScore} points to win`;
    const key=JSON.stringify([state.code,state.round,state.targetScore,myId,rows]);
    if(key!==this.key){this.key=key;const list=this.find('standings');list.replaceChildren();list.style.setProperty('--result-count',Math.max(1,rows.length));
      for(let i=0;i<rows.length;i++){
        const result=rows[i],cell=node('div','result-player');cell.dataset.playerId=result.id;cell.classList.toggle('me',result.id===myId);cell.style.setProperty('--car',result.color);cell.style.setProperty('--glow','3px');
        const previous=rows[i-1],rank=previous&&previous.total===result.total?Number(list.lastElementChild.dataset.rank):i+1;cell.dataset.rank=rank;
        const heading=node('span','leaderboard-place',`#${rank}`),meter=createScoreMeter(result.name,result.total,state.targetScore,result.delta),total=node('strong','result-score',String(result.total));
        const name=node('div','result-driver'),label=node('span','result-driver-name',result.name+(result.id===myId?' (you)':'')),tick=node('span','ready-tick','✓');tick.hidden=!result.ready;tick.setAttribute('aria-label','Ready');name.append(label,tick);
        const delta=node('span','result-change',`${result.delta>0?'+':''}${result.delta} ${Math.abs(result.delta)===1?'point':'points'}`);delta.classList.toggle('loss',result.delta<0);
        cell.append(heading,meter,total,name,delta);list.append(cell);
      }
    }
    this.find('results-lobby').hidden=state.host!==myId;
    const ready=this.find('ready');ready.hidden=!!complete;ready.disabled=!!me?.ready;ready.textContent=me?.ready?'Ready ✓':'Ready';
    this.find('rematch').hidden=!complete||state.host!==myId;this.find('rematch-hint').textContent=complete&&state.host!==myId?'Waiting for host.':'';
    this.progress(state,serverNow);
  }
  progress(state,serverNow){if(state.phase!=='finished'||state.tournamentComplete)return;this.find('ready').style.setProperty('--ready-progress',`${readyProgress(state.nextRoundAt,serverNow)*100}%`);}
}
