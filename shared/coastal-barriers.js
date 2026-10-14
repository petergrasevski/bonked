import {COAST_BEACH_SECTIONS} from './coastal-crabs.js';

// Road fractions follow driving direction; side is relative to the road normal.
// Open only the outside of these bends, keeping the inside bumper for recovery.
export const COAST_OUTER_GAPS=Object.freeze([
  Object.freeze({from:.216,to:.239,side:-1}),
  Object.freeze({from:.433,to:.452,side:-1}),
  Object.freeze({from:.757,to:.780,side:1}),
  Object.freeze({from:.899,to:.918,side:1}),
]);
const wrap=fraction=>((fraction%1)+1)%1;
export const isCoastalBeach=fraction=>COAST_BEACH_SECTIONS.includes(Math.floor(wrap(fraction)*24));
export function coastalHasBarrier(fraction,side=0){
  if(isCoastalBeach(fraction))return false;
  const f=wrap(fraction);
  return !COAST_OUTER_GAPS.some(gap=>side===gap.side&&f>=gap.from&&f<gap.to);
}
