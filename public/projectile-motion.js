// Velocity-led movement with soft authoritative corrections. Draw calls never
// jump directly between 20Hz positions; stale snapshots stop extrapolating.
export function projectilePose(previous,shot,snapshotTime,dt,now){
  const vx=Math.cos(shot.angle)*shot.speed,vz=Math.sin(shot.angle)*shot.speed;
  if(!previous)return {x:shot.x,y:shot.y??.7,z:shot.z,vx,vz,angle:shot.angle,snapshotTime,receivedAt:now,anchorX:shot.x,anchorZ:shot.z};
  const p={...previous},fresh=p.snapshotTime!==snapshotTime;
  const oldAge=(now-p.receivedAt)/1000;
  if(oldAge<.15){p.x+=p.vx*dt;p.z+=p.vz*dt;}
  if(fresh){p.snapshotTime=snapshotTime;p.receivedAt=now;p.anchorX=shot.x;p.anchorZ=shot.z;p.vx=vx;p.vz=vz;}
  const age=Math.min(.15,Math.max(0,(now-p.receivedAt)/1000)),x=p.anchorX+vx*age,z=p.anchorZ+vz*age;
  const blend=1-Math.exp(-dt*14),distance=Math.hypot(x-p.x,z-p.z);
  if(distance>18){p.x=x;p.z=z;}else{p.x+=(x-p.x)*blend;p.z+=(z-p.z)*blend;}
  p.y+=( (shot.y??.7)-p.y)*blend;p.angle+=Math.atan2(Math.sin(shot.angle-p.angle),Math.cos(shot.angle-p.angle))*blend;
  return p;
}
