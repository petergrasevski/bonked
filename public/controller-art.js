const ns='http://www.w3.org/2000/svg';
export const svgNode=(tag,attrs={},text)=>{const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;};
export function controllerType(device){
  if(device.joyConSide)return 'joy-con';if(device.phone)return 'phone';
  if(device.pad?.mapping&&device.pad.mapping!=='standard')return 'generic';
  const label=device.label||'';
  return /DualSense/i.test(label)?'ps5':/DualShock/i.test(label)?'ps4':/Switch|Joy-Con/i.test(label)?'switch':/Xbox/i.test(label)?'xbox':'generic';
}
const p=(x,y,label)=>({x,y,label});
export function controllerGeometry(device){
  const kind=controllerType(device),buttons={},axes={};
  if(kind==='joy-con'){
    Object.assign(buttons,{0:p(222,135,'Bottom face'),1:p(222,93,'Top face'),2:p(201,114,'Left face'),5:p(243,114,'Right face'),6:p(98,59,'SL'),7:p(222,59,'SR'),4:p(47,89,device.joyConSide==='L'?'L':'R'),8:p(47,145,device.joyConSide==='L'?'ZL':'ZR'),9:p(160,96,device.joyConSide==='L'?'−':'+'),10:p(98,114,'Stick click'),16:p(160,142,device.joyConSide==='L'?'Capture':'Home')});axes[0]=p(98,114,'Stick');axes[1]=axes[0];
  }else if(kind==='generic'&&device.pad?.mapping!=='standard'){
    for(let i=0;i<(device.pad?.buttons.length||17);i++)buttons[i]=p(40+(i%6)*48,50+Math.floor(i/6)*38,`Button ${i+1}`);
    for(let i=0;i<(device.pad?.axes.length||2);i++)axes[i]=p(70+(i%4)*58,182,`Axis ${i+1}`);
  }else{
    const ps=kind==='ps5'||kind==='ps4',labels=ps?['×','○','□','△']:kind==='switch'?['B','A','Y','X']:['A','B','X','Y'];
    Object.assign(buttons,{0:p(244,111,labels[0]),1:p(265,90,labels[1]),2:p(223,90,labels[2]),3:p(244,69,labels[3]),4:p(73,34,ps?'L1':kind==='switch'?'L':'LB'),5:p(247,34,ps?'R1':kind==='switch'?'R':'RB'),6:p(73,14,ps?'L2':kind==='switch'?'ZL':'LT'),7:p(247,14,ps?'R2':kind==='switch'?'ZR':'RT'),8:p(105,61,kind==='switch'?'−':kind==='ps5'?'Create':kind==='ps4'?'Share':'View'),9:p(215,61,kind==='switch'?'+':ps?'Options':'Menu'),10:p(ps?126:76,ps?138:90,'Left stick click'),11:p(194,138,'Right stick click'),12:p(ps?76:126,ps?69:117,'D-pad up'),13:p(ps?76:126,ps?111:159,'D-pad down'),14:p(ps?55:105,ps?90:138,'D-pad left'),15:p(ps?97:147,ps?90:138,'D-pad right'),16:p(160,123,'Home')});axes[0]=p(ps?126:76,ps?138:90,'Left stick');axes[1]=axes[0];axes[2]=p(194,138,'Right stick');axes[3]=axes[2];
  }
  return {kind,buttons,axes};
}
export function createControllerArt(device,{icon=false}={}){
  const {kind,buttons,axes}=controllerGeometry(device),svg=svgNode('svg',{viewBox:kind==='joy-con'?'26 44 268 132':'0 0 320 220',role:'img','aria-label':device.phone?'Phone controller':`${device.label||'Controller'} controller`,class:icon?'controller-avatar':'controller-art'});
  svg.append(svgNode('title',{},device.label||'Controller'));
  const shape=(tag,attrs,cls='')=>svg.appendChild(svgNode(tag,{...attrs,class:cls}));
  if(kind==='phone'){
    shape('rect',{x:104,y:7,width:112,height:206,rx:22,fill:'#728899',stroke:'#c7d8e4','stroke-width':4},'controller-shell');shape('rect',{x:114,y:22,width:92,height:173,rx:12,fill:'#172c38'});shape('circle',{cx:144,cy:123,r:16,fill:'#6d9d92'});shape('circle',{cx:181,cy:123,r:16,fill:'#c99186'});return svg;
  }
  if(kind==='joy-con'){
    shape('rect',{x:55,y:57,width:210,height:15,rx:4,fill:'#182d3a',stroke:'#7e9aab','stroke-width':1.5});
    shape('path',{d:'M61 72 H259 Q282 72 282 96 V137 Q282 163 258 163 H62 Q38 163 38 137 V96 Q38 72 61 72Z',fill:device.joyConSide==='L'?'#21a8b8':'#e35c65',stroke:'#8fdae0','stroke-width':2},'controller-shell');
    shape('path',{d:'M64 77 H256',stroke:'#e2ffff','stroke-opacity':.35,'stroke-width':2,fill:'none'});
    for(let i=0;i<4;i++)shape('rect',{x:147+i*7,y:61,width:3,height:5,rx:1,fill:'#76c49a'});
  }else if(kind==='generic'&&device.pad?.mapping!=='standard'){
    shape('rect',{x:16,y:22,width:288,height:180,rx:14,fill:'#223a49',stroke:'#6a8799','stroke-width':2},'controller-shell');
  }else{
    const ps5=kind==='ps5',ps=ps5||kind==='ps4';
    const outline=ps5?'M94 43 C73 36 54 41 43 62 C31 84 18 139 12 179 C8 203 20 216 37 208 C52 201 70 177 88 153 C108 161 130 165 160 165 C190 165 212 161 232 153 C250 177 268 201 283 208 C300 216 312 203 308 179 C302 139 289 84 277 62 C266 41 247 36 226 43 Q160 31 94 43Z':kind==='ps4'?'M89 44 Q59 34 43 61 Q24 94 15 174 Q12 202 33 201 Q51 199 84 153 Q160 177 236 153 Q269 199 287 201 Q308 202 305 174 Q296 94 277 61 Q261 34 231 44 Q160 35 89 44Z':'M88 43 Q55 40 39 69 Q22 102 14 169 Q9 202 31 204 Q50 204 87 156 Q160 174 233 156 Q270 204 289 204 Q311 202 306 169 Q298 102 281 69 Q265 40 232 43 Q160 33 88 43Z';
    shape('path',{d:outline,fill:ps5?'#e4e9ed':kind==='ps4'?'#35414f':'#384b56',stroke:ps5?'#afc9db':'#8da6b8','stroke-width':2},'controller-shell');
    if(ps5)shape('path',{d:'M112 52 Q160 44 208 52 L227 107 Q215 132 212 156 Q160 174 108 156 Q105 132 93 107Z',fill:'#17232e',stroke:'#537a93','stroke-width':1.2});
    if(ps)shape('rect',{x:117,y:47,width:86,height:49,rx:7,fill:'#283746',stroke:ps5?'#81b8dd':'#738c9f','stroke-width':1.5});
  }
  for(const [index,target]of Object.entries(buttons)){
    const n=Number(index);if([10,11].includes(n))continue;
    const group=svgNode('g',{'data-control':`button-${n}`,class:'controller-control'});
    const rail=kind==='joy-con'&&[6,7].includes(n),shoulder=kind!=='joy-con'&&[4,5,6,7].includes(n);
    if(rail||shoulder)group.append(svgNode('rect',{x:target.x-18,y:target.y-7,width:36,height:14,rx:4}));
    else if(n>=12&&n<=15&&kind!=='joy-con'&&kind!=='generic')group.append(svgNode('rect',{x:target.x-7,y:target.y-7,width:14,height:14,rx:2}));
    else group.append(svgNode('circle',{cx:target.x,cy:target.y,r:[8,9,16].includes(n)?5:8.5}));
    if(!icon&&(target.label.length<=2||device.pad?.mapping!=='standard'&&kind==='generic'))group.append(svgNode('text',{x:target.x,y:target.y+3,'text-anchor':'middle'},kind==='generic'&&device.pad?.mapping!=='standard'?String(n+1):target.label));svg.append(group);
  }
  for(const index of Object.keys(axes).filter((_,i)=>i%2===0)){
    const t=axes[index],g=svgNode('g',{'data-control':`axis-${index}`,class:'controller-control'});
    g.append(svgNode('circle',{cx:t.x,cy:t.y,r:17}),svgNode('circle',{cx:t.x,cy:t.y,r:12,class:'controller-stick-cap'}));svg.append(g);
  }
  return svg;
}
