// A shallow overflowing lava tongue: the same meandering banks drive the road
// mesh and tyre contact. Distances are in metres, so track tessellation is irrelevant.
export const VOLCANO_CROSSINGS=[{fraction:.365,length:13}];
const signedDistance=(a,b,length)=>(((a-b+.5)%1+1)%1-.5)*length;
export function volcanoCrossingBounds(lane,index=0){
  const zone=VOLCANO_CROSSINGS[index],center=Math.sin(lane*2.8+index)*1.25+lane*1.8;
  const width=zone.length*.5*(.82+.12*Math.sin(lane*7+1));
  return [center-width,center+width];
}
export function volcanoLavaGrip(fraction,lateral,halfWidth,length){
  if(Math.abs(lateral)>halfWidth+.5)return 1;
  const lane=lateral/halfWidth;
  for(let i=0;i<VOLCANO_CROSSINGS.length;i++){
    const along=signedDistance(fraction,VOLCANO_CROSSINGS[i].fraction,length),[lo,hi]=volcanoCrossingBounds(lane,i);
    if(along>lo&&along<hi)return .24;
  }
  return 1;
}
