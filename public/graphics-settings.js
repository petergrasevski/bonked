const KEY='bonked-graphics-quality';
export function readGraphicsQuality(storage){try{return storage?.getItem(KEY)==='high'?'high':'auto';}catch{return 'auto';}}
export function saveGraphicsQuality(storage,quality){try{storage?.setItem(KEY,quality==='high'?'high':'auto');}catch{}}
export function resolutionLabel({quality,ratio,nativeRatio,width,height}){
  const percent=Math.round(ratio/nativeRatio*100),w=Math.floor(width*ratio),h=Math.floor(height*ratio);
  return `${quality==='high'?'High':'Auto'} · ${percent}% of native · ${w} × ${h}`;
}
