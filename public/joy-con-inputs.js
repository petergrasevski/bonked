// Browser/OS pairs remain intact; only input routing is split into two players.
export function isJoyConPair(pad){
  return !!pad&&pad.mapping==='standard'&&pad.axes.length>=4&&pad.buttons.length>=16&&/joy.?con/i.test(pad.id)&&/l\s*[/+]\s*r|pair/i.test(pad.id);
}
export function splitJoyCon(pad){
  const button=index=>pad.buttons[index]||{pressed:false,value:0};
  return ['L','R'].map((side,i)=>{
    const buttons=Array.from({length:17},()=>({pressed:false,value:0}));
    // Horizontal grip: bottom accelerates, left reverses, top fires. Outer
    // shoulder/trigger nudge, and minus/plus readies. No dependency on SL/SR,
    // which some macOS combined profiles omit entirely.
    const source=i?{0:1,1:3,2:0,5:2,6:5,7:7,9:9}:{0:14,1:15,2:13,5:12,6:4,7:6,9:8};
    for(const [to,from]of Object.entries(source))buttons[to]=button(from);
    return {index:i?-(pad.index+1):pad.index,id:`Joy-Con (${side}) · split ${pad.id}`,mapping:'standard',connected:pad.connected,axes:i?[-pad.axes[3],pad.axes[2]]:[pad.axes[1],-pad.axes[0]],buttons,physicalIndex:pad.index,joyConSide:side};
  });
}
