import {STANDARD_MAPPING,gamepadButton} from './controller.js';

const actions={left:'Nudge left',steer:'Steer / aim',reverse:'Reverse',ready:'Ready',right:'Nudge right',fire:'Weapon',throttle:'Accelerate',steerLeft:'Steer left',steerRight:'Steer right'};
const colours={left:'#9bcfff',right:'#9bcfff',steer:'#e3e9ef',reverse:'#ffcc8c',ready:'#eddd93',fire:'#ff9ba9',throttle:'#9ce2b8',steerLeft:'#e3e9ef',steerRight:'#e3e9ef'};
const point=(x,y,label)=>({x,y,label});
export function controllerDiagramModel(device,mapping=device.mapping||STANDARD_MAPPING){
  const split=!!device.joyConSide,standard=device.pad.mapping==='standard';
  const kind=split?'joy-con':!standard?'generic':/DualSense/i.test(device.label)?'ps5':/DualShock/i.test(device.label)?'ps4':/Switch|Joy-Con/i.test(device.label)?'switch':'xbox';
  const buttons={},axes={};
  if(split){
    Object.assign(buttons,{0:point(465,237,'Bottom face'),2:point(433,205,'Left face'),1:point(465,173,'Top face'),5:point(497,205,'Right face'),6:point(285,130,'SL'),7:point(450,130,'SR'),4:point(226,172,device.joyConSide==='L'?'L':'R'),8:point(226,240,device.joyConSide==='L'?'ZL':'ZR'),9:point(369,185,device.joyConSide==='L'?'−':'+'),10:point(290,205,'Stick click'),16:point(370,235,device.joyConSide==='L'?'Capture':'Home')});
    axes[0]=point(290,205,'Stick');axes[1]=point(290,205,'Stick');
  }else if(standard){
    const playstation=kind==='ps5'||kind==='ps4',names=playstation?['×','○','□','△']:kind==='switch'?['B','A','Y','X']:['A','B','X','Y'];
    Object.assign(buttons,{0:point(480,202,names[0]),1:point(508,174,names[1]),2:point(452,174,names[2]),3:point(480,146,names[3]),4:point(260,108,playstation?'L1':kind==='switch'?'L':'LB'),5:point(540,108,playstation?'R1':kind==='switch'?'R':'RB'),6:point(260,78,playstation?'L2':kind==='switch'?'ZL':'LT'),7:point(540,78,playstation?'R2':kind==='switch'?'ZR':'RT'),8:point(352,128,kind==='switch'?'−':playstation?'Create / Share':'View'),9:point(448,128,kind==='switch'?'+':playstation?'Options':'Menu'),10:point(playstation?330:290,playstation?235:174,'Left stick click'),11:point(430,235,'Right stick click'),12:point(playstation?290:330,playstation?150:211,'D-pad up'),13:point(playstation?290:330,playstation?198:259,'D-pad down'),14:point(playstation?266:306,playstation?174:235,'D-pad left'),15:point(playstation?314:354,playstation?174:235,'D-pad right'),16:point(400,205,'Home')});
    axes[0]=point(playstation?330:290,playstation?235:174,'Left stick');axes[1]=axes[0];axes[2]=point(430,235,'Right stick');axes[3]=axes[2];
  }else{
    for(let i=0;i<device.pad.buttons.length;i++)buttons[i]=point(260+(i%5)*70,120+Math.floor(i/5)*42,`Button ${i+1}`);
    for(let i=0;i<device.pad.axes.length;i++)axes[i]=point(300+(i%3)*80,310+Math.floor(i/3)*20,`Axis ${i+1}`);
  }
  const bindings=Object.keys(actions).flatMap(action=>{
    const axis=action==='steer',index=axis?mapping.steerAxis:mapping.buttons?.[action];
    if(!Number.isInteger(index))return [];
    const target=(axis?axes:buttons)[index];
    const available=!(split&&[6,7].includes(index)&&!axis&&device.railButtonsAvailable===false);
    return [{action,title:actions[action],index,axis,target,available,colour:colours[action],detail:target?`${target.label}${available?'':' · unavailable'}`:`${axis?'Axis':'Button'} ${index+1}`}];
  });
  return {kind,split,buttons,axes,bindings,title:split?`Joy-Con ${device.joyConSide==='L'?'Left':'Right'} · sideways`:device.label,notice:split&&device.railButtonsAvailable===false?'This browser does not expose SL/SR for this pair. Try another browser, or use Configure to choose other nudge buttons.':!standard?'Browser button layout: press a button to identify it before assigning controls.':'Stick also aims the sky beam after elimination.'};
}
let serial=0;
const ns='http://www.w3.org/2000/svg';
const svgNode=(tag,attributes={},text)=>{const e=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attributes))e.setAttribute(key,String(value));if(text!==undefined)e.textContent=text;return e;};
export function createControllerDiagram(device,mapping=device.mapping||STANDARD_MAPPING){
  const figure=document.createElement('figure');figure.className='controller-diagram';
  let current=device;
  function render(nextMapping){
    const model=controllerDiagramModel(current,nextMapping),id=`controller-arrow-${++serial}`;
    const svg=svgNode('svg',{viewBox:'0 0 800 370',role:'img','aria-label':`${model.title}. ${model.bindings.map(b=>`${b.title}: ${b.detail}`).join('. ')}`});
    svg.append(svgNode('title',{},model.title));
    const defs=svgNode('defs'),marker=svgNode('marker',{id,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'});marker.append(svgNode('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'context-stroke'}));defs.append(marker);svg.append(defs);
    const body=svgNode('g',{'class':'controller-body'});
    if(model.split){
      body.append(svgNode('rect',{x:218,y:140,width:352,height:132,rx:58,fill:current.joyConSide==='L'?'#277c92':'#a34250'}));
      body.append(svgNode('rect',{x:250,y:122,width:66,height:16,rx:5}),svgNode('rect',{x:416,y:122,width:66,height:16,rx:5}));
    }else if(model.kind!=='generic'){
      body.append(svgNode('path',{d:model.kind==='ps5'?'M260 104 Q220 105 210 160 L186 278 Q180 324 215 326 Q239 326 278 275 L522 275 Q561 326 585 326 Q620 324 614 278 L590 160 Q580 105 540 104 Z':'M268 108 Q224 110 214 157 L195 278 Q190 315 220 318 Q244 318 279 274 L521 274 Q556 318 580 318 Q610 315 605 278 L586 157 Q576 110 532 108 Z',fill:model.kind==='ps5'?'#c9d3dd':'#344959'}));
      if(model.kind==='ps5'||model.kind==='ps4')body.append(svgNode('rect',{x:360,y:142,width:80,height:43,rx:9,fill:'#172b38'}));
      for(const i of [4,5,6,7]){const p=model.buttons[i];body.append(svgNode('rect',{x:p.x-24,y:p.y-11,width:48,height:22,rx:6}));}
    }
    svg.append(body);
    const drawPoint=(p,index,axis=false)=>{
      const group=svgNode('g',{'data-control':axis?`axis-${index}`:`button-${index}`,class:'controller-control'});
      group.append(svgNode('circle',{cx:p.x,cy:p.y,r:axis?22:12}));
      if(!axis)group.append(svgNode('text',{x:p.x,y:p.y+4,'text-anchor':'middle'},model.kind==='generic'?String(Number(index)+1):p.label.length<=2?p.label:''));
      svg.append(group);
    };
    for(const [index,p]of Object.entries(model.buttons))if(![10,11].includes(Number(index))||model.kind==='generic')drawPoint(p,index);
    for(const index of Object.keys(model.axes).filter((_,i)=>i%2===0))drawPoint(model.axes[index],index,true);
    const left=['left','steer','reverse','ready','steerLeft'];let li=0,ri=0;
    for(const binding of model.bindings){
      const onLeft=left.includes(binding.action),row=onLeft?li++:ri++,y=48+row*69,x=onLeft?16:610;
      const label=svgNode('text',{x,y,fill:binding.colour,class:'controller-action'});label.append(svgNode('tspan',{x,dy:0},binding.title),svgNode('tspan',{x,dy:20,class:'controller-button-label'},binding.detail));svg.append(label);
      if(binding.target){const p=binding.target;svg.append(svgNode('path',{d:`M ${onLeft?184:605} ${y+6} H ${onLeft?202:594} L ${p.x} ${p.y}`,fill:'none',stroke:binding.colour,'stroke-width':1.6,'stroke-dasharray':binding.available?'none':'4 4','marker-end':`url(#${id})`}));}
    }
    const caption=document.createElement('figcaption');caption.textContent=model.notice;caption.className=model.split&&current.railButtonsAvailable===false?'controller-diagram-notice':'';
    figure.replaceChildren(svg,caption);
  }
  function update(pad){
    for(const element of figure.querySelectorAll('[data-control]')){const [type,index]=element.dataset.control.split('-');const down=type==='button'?gamepadButton(pad,Number(index)):Math.abs(pad.axes[Number(index)]||0)>.2||Math.abs(pad.axes[Number(index)+1]||0)>.2;element.classList.toggle('is-pressed',down);}
  }
  render(mapping);return {element:figure,setMapping:render,update};
}
