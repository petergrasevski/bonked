import { START_FRACTION, TRACK_LENGTH, TOP_SPEED, trackAt } from './game.js';
export const CAMERA_LOOKAHEAD = 9; // Road metres ahead of the leader.
export const CHASE_DISTANCE = TOP_SPEED * 2.25; // Fixed road distance, not a timer.
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
export const CAMERA_REAR_SPACE = 9;
// All drivers receive the same route target. Eliminated cars stop stretching the pack.
export function cameraFrame(chase,cars=[]){
  const running=cars.filter(car=>!car.eliminated);
  const leader=running.length?Math.max(...running.map(car=>car.progress)):chase.leaderProgress;
  const rear=running.length?Math.min(...running.map(car=>car.progress)):leader;
  const spread=Math.max(0,(leader-rear)*TRACK_LENGTH),middle=(rear+leader)/2;
  const target=trackAt(START_FRACTION+middle+(CAMERA_LOOKAHEAD-CAMERA_REAR_SPACE)/2/TRACK_LENGTH);
  // A forward chord anticipates bends and averages the track's segment tangents.
  const behind=trackAt(START_FRACTION+middle-5/TRACK_LENGTH);
  const ahead=trackAt(START_FRACTION+middle+20/TRACK_LENGTH);
  const angle=Math.hypot(ahead.x-behind.x,ahead.z-behind.z)>1?Math.atan2(ahead.z-behind.z,ahead.x-behind.x):target.angle;
  const t=Math.max(0,Math.min(1,(spread-18)/70)),rise=t*t*(3-2*t);
  return {y:target.y,x:target.x,z:target.z,angle,pitch:(29+41*rise)*Math.PI/180,spread,from:rear-CAMERA_REAR_SPACE/TRACK_LENGTH,to:leader+CAMERA_LOOKAHEAD/TRACK_LENGTH};
}
export function raceOrder(a,b){
  const ca=a.car||a,cb=b.car||b;
  return Number(ca.eliminated)-Number(cb.eliminated)||Number(cb.finished)-Number(ca.finished)||(ca.finished&&cb.finished?ca.finishTime-cb.finishTime:ca.eliminated&&cb.eliminated?cb.eliminatedAt-ca.eliminatedAt:cb.progress-ca.progress);
}

// Follow the same corrected, fractional-tick progress as the rendered leader.
// Authority still decides elimination; this only positions its visible warning.
export function renderedChase(chase,players){
  if(!chase?.active)return chase;
  const running=players.filter(p=>!p.eliminated);if(!running.length)return chase;
  const leaderProgress=Math.max(...running.map(p=>p.progress)),progress=chase.progress+leaderProgress-chase.leaderProgress;
  return {...chase,progress,leaderProgress,...trackAt(START_FRACTION+progress)};
}
