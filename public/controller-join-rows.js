// All detected, unclaimed devices remain visible without reserving player slots.
// Extra devices share the final open row when the grid has less room than pads.
export function controllerJoinRows(devices,openSlots){
  const waiting=Array.from(devices).filter(d=>!d.slotId),rows=Array.from({length:Math.max(0,openSlots)},()=>[]);
  if(!rows.length)return rows;
  for(let i=0;i<waiting.length;i++)rows[Math.min(i,rows.length-1)].push(waiting[i]);
  return rows;
}
