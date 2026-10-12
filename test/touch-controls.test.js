import test from 'node:test';
import assert from 'node:assert/strict';
import {driveThrottle,SteeringTouches,bindTouchSteering} from '../public/touch-controls.js';
import {detectDevice} from '../public/display.js';
const bounds={left:0,width:400};

test('auto-drive is restricted to racing touch devices, yields to reverse, and never revs during countdown',()=>{
  for(const phase of ['lobby','countdown','finished',undefined])assert.equal(driveThrottle({mobile:true,phase}),0);
  assert.equal(driveThrottle({mobile:true,phase:'racing'}),1);
  assert.equal(driveThrottle({mobile:true,phase:'racing',reverse:true,accelerating:true}),0);
  assert.equal(driveThrottle({mobile:false,phase:'racing'}),0);
  assert.equal(driveThrottle({mobile:false,phase:'countdown',accelerating:true}),1);
  assert.equal(driveThrottle({mobile:true,phase:'racing',reverse:false}),1);
});
test('touch controls include phones and tablets, but exclude desktop touchscreens',()=>{
  for(const device of [
    {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)'},
    {userAgent:'Mozilla/5.0 (Linux; Android 16; Pixel) Chrome/140.0 Mobile Safari/537.36'},
    {userAgent:'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X)'},
    {platform:'MacIntel',maxTouchPoints:5},
    {userAgent:'Mozilla/5.0 (Linux; Android 16; Tablet) Chrome/140.0 Safari/537.36'},
  ])assert.equal(detectDevice(device).mobile,true);
  assert.equal(detectDevice({platform:'Win32',maxTouchPoints:10}).mobile,false);
});
test('a connected controller retains manual acceleration on phones and tablets',()=>{
  assert.equal(driveThrottle({mobile:true,controllerConnected:true,phase:'racing'}),0);
  assert.equal(driveThrottle({mobile:true,controllerConnected:true,phase:'racing',accelerating:true}),1);
  assert.equal(driveThrottle({mobile:true,controllerConnected:true,phase:'racing',accelerating:true,reverse:true}),0);
});
test('held touches steer independently; releasing either preserves the other',()=>{
  const t=new SteeringTouches();t.start(1,80,150,0,bounds);assert.equal(t.steer,-1);
  t.start(2,300,150,0,bounds);assert.equal(t.steer,0);
  t.end(1);assert.equal(t.steer,1);t.end(2);assert.equal(t.steer,0);
});
test('swipes in either direction nudge once and stop that touch steering until release',()=>{
  for(const direction of [-1,1]){
    const t=new SteeringTouches();t.start(1,200,150,0,bounds);
    assert.equal(t.move(1,200+direction*60,155,100,bounds),direction);assert.equal(t.steer,0);
    assert.equal(t.move(1,200-direction*80,155,180,bounds),0);assert.equal(t.steer,0);
    t.end(1);t.start(1,80,150,200,bounds);assert.equal(t.steer,-1);
  }
});
test('a quick swipe after a long steering hold still nudges',()=>{
  const t=new SteeringTouches();t.start(1,100,100,0,bounds);
  assert.equal(t.move(1,110,101,2000,bounds),0);
  assert.equal(t.move(1,165,104,2080,bounds),1);assert.equal(t.steer,0);
});
test('slow drags switch steering areas, vertical drags and jitter do not nudge',()=>{
  const t=new SteeringTouches();t.start(1,100,100,0,bounds);
  for(let i=1;i<=20;i++)assert.equal(t.move(1,100+i*10,100,i*100,bounds),0);
  assert.equal(t.steer,1);t.end(1);t.start(1,100,100,0,bounds);
  assert.equal(t.move(1,160,220,100,bounds),0);
  t.end(1);t.start(1,100,100,0,bounds);
  for(let i=1;i<=10;i++)assert.equal(t.move(1,100+(i%2?5:-5),100,i*10,bounds),0);
});
test('leaving the steering area releases steering and resets clear all touches',()=>{
  const t=new SteeringTouches();t.start(1,399,100,0,bounds);t.move(1,410,100,100,bounds);assert.equal(t.steer,0);
  t.start(2,100,100,100,bounds);assert.equal(t.steer,-1);t.clear();assert.equal(t.steer,0);
});

// Exercise actual pointer listeners, including browser cancellation and capture loss.
class Surface extends EventTarget{
  captures=new Set();
  getBoundingClientRect(){return bounds;}
  setPointerCapture(id){this.captures.add(id);}
  hasPointerCapture(id){return this.captures.has(id);}
  releasePointerCapture(id){this.captures.delete(id);this.pointer('lostpointercapture',id,0,0,0);}
  pointer(type,id,x,y,time){const e=new Event(type,{cancelable:true});Object.defineProperties(e,{pointerId:{value:id},button:{value:0},clientX:{value:x},clientY:{value:y},timeStamp:{value:time}});this.dispatchEvent(e);}
}
test('pointer cancellation, lost capture, disable and reset never leave steering held or emit a nudge',()=>{
  const element=new Surface();let enabled=true,steer=0;const nudges=[];
  const reset=bindTouchSteering(element,{enabled:()=>enabled,steer:v=>steer=v,nudge:v=>nudges.push(v),activate:()=>{}});
  for(const end of ['pointercancel','lostpointercapture']){
    element.pointer('pointerdown',1,80,100,0);assert.equal(steer,-1);
    element.pointer(end,1,160,100,80);assert.equal(steer,0);assert.equal(element.captures.size,0);
  }
  element.pointer('pointerdown',1,80,100,0);enabled=false;element.pointer('pointermove',1,160,100,80);assert.equal(steer,0);
  element.pointer('pointerdown',1,80,100,0);assert.equal(steer,0);
  enabled=true;element.pointer('pointerdown',1,80,100,0);reset();assert.equal(steer,0);assert.deepEqual(nudges,[]);
});
test('pointerup completes a flick even without intermediate move events',()=>{
  const element=new Surface();let steer=0;const nudges=[];
  bindTouchSteering(element,{enabled:()=>true,steer:v=>steer=v,nudge:v=>nudges.push(v),activate:()=>{}});
  element.pointer('pointerdown',1,80,100,0);element.pointer('pointerup',1,160,100,80);
  assert.deepEqual(nudges,[1]);assert.equal(steer,0);assert.equal(element.captures.size,0);
});
