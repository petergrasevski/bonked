// Pointer tilt is decorative only: touch controls and reduced-motion stay still.
export function initMetalInteractions(){
  const enabled=()=>matchMedia('(hover:hover) and (pointer:fine)').matches&&!matchMedia('(prefers-reduced-motion:reduce)').matches;
  let current=null,frame=0,pointer;
  const reset=()=>{if(current){for(const key of ['--tilt-x','--tilt-y','--shine-x','--shine-y'])current.style.removeProperty(key);current.classList.remove('pointer-tilt');current=null;}};
  document.addEventListener('pointermove',event=>{
    const button=event.target.closest?.('.primary,.track-card');
    if(!enabled()||event.pointerType==='touch'||!button||button.disabled){reset();return;}
    if(current!==button){reset();current=button;current.classList.add('pointer-tilt');}
    pointer={x:event.clientX,y:event.clientY};if(frame)return;
    frame=requestAnimationFrame(()=>{frame=0;if(!current)return;const r=current.getBoundingClientRect(),x=Math.max(0,Math.min(1,(pointer.x-r.left)/r.width)),y=Math.max(0,Math.min(1,(pointer.y-r.top)/r.height));current.style.setProperty('--tilt-x',`${(0.5-y)*9}deg`);current.style.setProperty('--tilt-y',`${(x-.5)*11}deg`);current.style.setProperty('--shine-x',`${x*100}%`);current.style.setProperty('--shine-y',`${y*100}%`);});
  },{passive:true});
  document.addEventListener('pointerout',event=>{if(current&&!current.contains(event.relatedTarget))reset();});
  window.addEventListener('blur',reset);
}
