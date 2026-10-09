import { START_FRACTION, TRACK_LENGTH, ROAD_WIDTH, TOP_SPEED, trackAt } from './game.js';
export const CAMERA_LOOKAHEAD = 22; // Road metres ahead of the leader.
export const CHASE_DISTANCE = TOP_SPEED * 3; // Fixed road distance, not a timer.
// Race progress is unwrapped across the start line. Never compare wrapped fractions.
export function createChase(cars) {
  const leaderProgress=cars.length?Math.max(...cars.map(c=>c.progress)):-6/TRACK_LENGTH;
  return {progress:leaderProgress-CHASE_DISTANCE/TRACK_LENGTH,active:false,leaderId:null,leaderProgress};
}
export function updateChase(chase,players,elapsedMs) {
  const running=players.filter(p=>!p.car.eliminated);
  if(!running.length)return [];
  const leader=running.reduce((a,b)=>a.car.progress>=b.car.progress?a:b);
  chase.leaderId=leader.id;chase.leaderProgress=leader.car.progress;
  chase.progress=leader.car.progress-CHASE_DISTANCE/TRACK_LENGTH;
  chase.active=true;
  const eliminated=[];
  for(const p of running)if(!p.car.finished&&p.car.progress<chase.progress-1e-7){
    p.car.eliminated=true;p.car.eliminatedAt=elapsedMs;p.car.vx=0;p.car.vz=0;p.car.item=null;eliminated.push(p);
  }
  return eliminated;
}
export function chaseSnapshot(chase){
  return {active:chase.active,progress:chase.progress,leaderId:chase.leaderId,leaderProgress:chase.leaderProgress,...trackAt(START_FRACTION+chase.progress)};
}
// Common camera frame: no player ID, local prediction, or viewport enters this calculation.
export function cameraFrame(chase){
  const from=chase.progress,to=Math.max(from,chase.leaderProgress)+CAMERA_LOOKAHEAD/TRACK_LENGTH;
  const mid=trackAt(START_FRACTION+(from+to)/2),c=Math.cos(mid.angle),s=Math.sin(mid.angle);
  let left=Infinity,right=-Infinity,near=Infinity,far=-Infinity;
  for(let i=0;i<=24;i++){
    const p=trackAt(START_FRACTION+from+(to-from)*i/24);
    for(const side of [-1,1]){
      const x=p.x+p.nx*(p.halfWidth+2)*side,z=p.z+p.nz*(p.halfWidth+2)*side;
      const across=x*c+z*s,depth=-x*s+z*c;
      left=Math.min(left,across);right=Math.max(right,across);near=Math.min(near,depth);far=Math.max(far,depth);
    }
  }
  const across=(left+right)/2,depth=(near+far)/2;
  return {x:across*c-depth*s,z:across*s+depth*c,angle:mid.angle,halfWidth:Math.max(25,(right-left)/2+10),halfHeight:Math.max(16,(far-near)*.84/2+7)};
}
export function raceOrder(a,b){
  const ca=a.car||a,cb=b.car||b;
  return Number(ca.eliminated)-Number(cb.eliminated)||Number(cb.finished)-Number(ca.finished)||(ca.finished&&cb.finished?ca.finishTime-cb.finishTime:ca.eliminated&&cb.eliminated?cb.eliminatedAt-ca.eliminatedAt:cb.progress-ca.progress);
}
