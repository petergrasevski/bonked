import {controllerGeometry,createControllerArt,svgNode} from './controller-art.js';
import {STANDARD_MAPPING,gamepadButton} from './controller.js';

const actions={left:'Nudge left',steer:'Steer / aim',reverse:'Reverse',ready:'Ready',right:'Nudge right',fire:'Weapon',throttle:'Accelerate',steerLeft:'Steer left',steerRight:'Steer right'};
export function controllerDiagramModel(device,mapping=device.mapping||STANDARD_MAPPING){
  const split=!!device.joyConSide,standard=device.pad.mapping==='standard';
  const {kind,buttons,axes}=controllerGeometry(device);
  const bindings=Object.keys(actions).flatMap(action=>{
    const axis=action==='steer',index=axis?mapping.steerAxis:mapping.buttons?.[action];
    if(!Number.isInteger(index))return [];
    const target=(axis?axes:buttons)[index];
    const available=!(split&&[6,7].includes(index)&&!axis&&device.railButtonsAvailable===false);
    return [{action,title:actions[action],index,axis,target,available,detail:target?`${target.label}${available?'':' · unavailable'}`:`${axis?'Axis':'Button'} ${index+1}`}];
  });
  return {kind,split,buttons,axes,bindings,title:split?`Joy-Con ${device.joyConSide==='L'?'Left':'Right'} · sideways`:device.label,notice:split&&device.railButtonsAvailable===false?'SL/SR are missing from this browser’s paired-controller profile. Bonked cannot read buttons it does not receive. Configure can assign L/ZL or R/ZR instead.':!standard?'Browser button layout: press a button to identify it before assigning controls.':'Stick also aims the sky beam after elimination.'};
}
export function createControllerDiagram(device,mapping=device.mapping||STANDARD_MAPPING){
  const figure=document.createElement('figure');figure.className='controller-diagram';
  function render(nextMapping){
    const model=controllerDiagramModel(device,nextMapping),svg=createControllerArt(device),legend=document.createElement('div');legend.className='controller-bindings';
    svg.setAttribute('aria-label',`${model.title}. ${model.bindings.map(b=>`${b.title}: ${b.detail}`).join('. ')}`);
    const markers=new Map();
    for(const b of model.bindings){
      const key=`${b.axis?'axis':'button'}-${b.index}`;let number=markers.get(key);
      if(!number){number=markers.size+1;markers.set(key,number);
        if(b.target){const marker=svgNode('g',{'data-control':key,class:'controller-marker'});marker.append(svgNode('circle',{cx:b.target.x,cy:b.target.y,r:10}),svgNode('text',{x:b.target.x,y:b.target.y+3.6,'text-anchor':'middle'},String(number)));svg.append(marker);}
      }
      const row=document.createElement('div');row.className='controller-binding';
      const badge=document.createElement('b');badge.textContent=number;badge.className='controller-number';
      const label=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('small');title.textContent=b.title;detail.textContent=b.detail;label.append(title,detail);row.append(badge,label);if(!b.available)row.classList.add('unavailable');legend.append(row);
    }
    const caption=document.createElement('figcaption');caption.textContent=model.notice;caption.className=model.split&&device.railButtonsAvailable===false?'controller-diagram-notice':'';
    figure.replaceChildren(svg,legend,caption);
  }
  function update(pad){
    for(const element of figure.querySelectorAll('[data-control]')){const [type,index]=element.dataset.control.split('-'),n=Number(index);const down=type==='button'?gamepadButton(pad,n):Math.abs(pad.axes[n]||0)>.2||Math.abs(pad.axes[n+1]||0)>.2||gamepadButton(pad,n===0?10:11);element.classList.toggle('is-pressed',down);}
  }
  render(mapping);return {element:figure,setMapping:render,update};
}
