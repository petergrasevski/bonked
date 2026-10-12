export function readController(pads){
  const pad=Array.from(pads||[]).find(p=>p?.connected&&p.mapping==='standard');
  if(!pad)return {connected:false,aimY:0,steer:0,throttle:0,reverse:false,fire:false,left:false,right:false};
  const axis=Number.isFinite(pad.axes[0])?pad.axes[0]:0,dead=.14;
  const pressed=i=>!!pad.buttons[i]?.pressed||(pad.buttons[i]?.value||0)>.3;
  const vertical=Number.isFinite(pad.axes[1])?pad.axes[1]:0;
  return {connected:true,aimY:Math.abs(vertical)<=dead?0:-Math.sign(vertical)*Math.min(1,(Math.abs(vertical)-dead)/(1-dead)),steer:Math.abs(axis)<=dead?0:Math.sign(axis)*Math.min(1,(Math.abs(axis)-dead)/(1-dead)),throttle:pressed(0)?1:0,reverse:pressed(2),fire:pressed(5),left:pressed(6),right:pressed(7)};
}
