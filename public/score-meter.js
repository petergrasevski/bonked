// The same segmented thermometer powers the race HUD and the results screen.
export function scoreSegments(total,target,delta=null){
  const previous=delta===null?total:total-delta,history=delta!==null;
  const positiveCount=history?Math.max(target,total,previous):target,negativeCount=history?Math.max(0,-total,-previous):0,segments=[];
  for(let debt=negativeCount;debt>=1;debt--){
    const current=debt<=-total,old=debt<=-previous;
    segments.push({value:-debt,state:current?(old?'lit':'lost'):old?'gained':'empty',debt:true});
  }
  for(let value=1;value<=positiveCount;value++)segments.push({value,state:value<=total?(history&&value>previous?'gained':'lit'):history&&value<=previous?'lost':'empty',debt:false});
  return segments;
}
export function createScoreMeter(name,total,target,delta=null){
  const meter=document.createElement('div');meter.className='score-meter';meter.setAttribute('role','meter');meter.setAttribute('aria-label',name+' score');
  meter.setAttribute('aria-valuemin',Math.min(0,total,delta===null?total:total-delta));meter.setAttribute('aria-valuemax',Math.max(target,total,delta===null?total:total-delta));meter.setAttribute('aria-valuenow',total);
  meter.setAttribute('aria-valuetext',delta===null?`${total} of ${target} points`:`${total} points, ${delta>0?'+':''}${delta} from ${total-delta}`);
  let wasDebt=false;
  for(const segment of scoreSegments(total,target,delta)){
    if(wasDebt&&!segment.debt){const zero=document.createElement('b');zero.className='score-zero';zero.setAttribute('aria-hidden','true');meter.append(zero);}
    const block=document.createElement('i');block.className=segment.state+(segment.debt?' debt':'');block.dataset.points=segment.value;block.setAttribute('aria-hidden','true');meter.append(block);wasDebt=segment.debt;
  }
  return meter;
}
