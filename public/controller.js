export function readController(pads){
  const pad=Array.from(pads||[]).find(p=>p?.connected&&p.mapping==='standard');
  if(!pad)return {connected:false,steer:0,throttle:0,brake:false,fire:false,left:false,right:false};
  const axis=Number.isFinite(pad.axes[0])?pad.axes[0]:0,dead=.14;
  const pressed=i=>!!pad.buttons[i]?.pressed||(pad.buttons[i]?.value||0)>.3;
  return {connected:true,steer:Math.abs(axis)<=dead?0:Math.sign(axis)*Math.min(1,(Math.abs(axis)-dead)/(1-dead)),throttle:pressed(0)?1:0,brake:pressed(2),fire:pressed(5),left:pressed(6),right:pressed(7)};
}
