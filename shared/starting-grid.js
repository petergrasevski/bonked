import {TRACK_LENGTH,PICKUP_LOCATIONS,BOOST_PADS,MAX_PLAYERS,gridSlotDistance} from './game.js';

export const RESPAWN_PICKUP_CLEARANCE=20;
// Move the whole formation forward, preserving row spacing and unwrapped lap progress.
export function safeGridStartFraction(startFraction,count=MAX_PLAYERS,{length=TRACK_LENGTH,pickups=PICKUP_LOCATIONS,pads=BOOST_PADS}={}){
  if(count<1)return startFraction;
  const front=gridSlotDistance(0),rear=gridSlotDistance(count-1),lap=Math.floor(startFraction);
  const features=[...pickups.map(p=>({fraction:p.fraction,halfLength:0})),...pads.map(p=>({fraction:p.fraction,halfLength:p.length/2}))];
  const intervals=[];
  for(const feature of features){
    const fraction=((feature.fraction%1)+1)%1,clearance=RESPAWN_PICKUP_CLEARANCE+feature.halfLength;
    // Include the previous lap for grids straddling the seam, and enough road
    // ahead to find the next clear stretch even when several rows cluster.
    for(let cycle=lap-1;cycle<=lap+2;cycle++){
      const at=(cycle+fraction)*length;
      intervals.push([at+front-clearance,at+rear+clearance]);
    }
  }
  intervals.sort((a,b)=>a[0]-b[0]);
  const original=startFraction*length;
  let start=original;
  for(const [from,to]of intervals){
    if(start<from-1e-7)break;
    if(start<=to+1e-7)start=to+.01;
  }
  if(start-original>length)throw new Error('No clear starting grid on this circuit');
  return start===original?startFraction:start/length;
}
