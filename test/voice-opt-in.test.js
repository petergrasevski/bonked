import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function setup(getMedia,{setTimer=setTimeout,clearTimer=clearTimeout}={}){
  const sent=[],messages=[],attributes={},bar={hidden:true},track={enabled:true,stop(){this.stopped=true;}},stream={getTracks:()=>[track]};let requests=0;
  const button={hidden:true,closest:()=>bar,setAttribute:(k,v)=>attributes[k]=v};
  class Context{constructor(){this.state='running';this.destination={};this.audioWorklet={addModule:async()=>{}};}async resume(){}createMediaStreamSource(){return {connect(){},disconnect(){}};}}
  class Socket{static OPEN=1;constructor(){this.readyState=1;this.bufferedAmount=0;}send(m){sent.push(m);}close(){this.readyState=3;}}
  class Node{constructor(){this.port={postMessage:m=>messages.push(m)};}connect(){}}
  const scope={window:{AudioContext:Context,addEventListener(){}},document:{hidden:false,addEventListener(){}},navigator:{mediaDevices:{getUserMedia:()=>{requests++;return getMedia?getMedia(stream):Promise.resolve(stream);}}},location:{protocol:'https:',host:'game.test'},WebSocket:Socket,AudioWorkletNode:Node,setTimeout:setTimer,clearTimeout:clearTimer};
  vm.runInNewContext(readFileSync(new URL('../public/voice.js',import.meta.url),'utf8').replace('export class PartyVoice','this.PartyVoice=class PartyVoice'),scope);
  const voice=new scope.PartyVoice(button),join=async()=>{await voice.join({code:'ABC',token:'test'});voice.socket.onopen();voice.socket.onmessage({data:JSON.stringify({type:'ready'})});};
  const receive=()=>voice.socket.onmessage({data:new ArrayBuffer(641)}),packet=()=>voice.node.port.onmessage({data:{type:'packet',buffer:new ArrayBuffer(640)}});
  return {voice,button,attributes,bar,track,messages,sent,join,receive,packet,requests:()=>requests};
}
test('joining enables incoming voice without requesting microphone access or transmitting',async()=>{
  const h=setup();await h.join();assert.equal(h.requests(),0);assert.equal(h.voice.muted,true);assert.equal(h.attributes['aria-pressed'],'false');assert.equal(h.button.hidden,false);assert.equal(h.bar.hidden,true);
  h.receive();assert.equal(h.messages.at(-1).type,'audio');h.packet();assert.equal(h.sent.filter(x=>typeof x!=='string').length,0);
});
test('mic button alone enables capture; mute preserves incoming audio and unmute reuses permission',async()=>{
  const h=setup();await h.join();await h.button.onclick();assert.equal(h.requests(),1);assert.equal(h.attributes['aria-pressed'],'true');assert.equal(h.track.enabled,true);
  h.packet();assert.equal(h.sent.filter(x=>typeof x!=='string').length,1);
  await h.button.onclick();assert.equal(h.track.enabled,false);assert.equal(h.attributes['aria-pressed'],'false');h.packet();assert.equal(h.sent.filter(x=>typeof x!=='string').length,1);
  h.receive();assert.equal(h.messages.at(-1).type,'audio');await h.button.onclick();assert.equal(h.track.enabled,true);assert.equal(h.requests(),1);
  await h.join();assert.equal(h.track.stopped,true);assert.equal(h.voice.muted,true);assert.equal(h.requests(),1);assert.equal(h.attributes['aria-pressed'],'false');
});
test('permission denial leaves incoming audio enabled and the mic off',async()=>{
  const h=setup(async()=>{throw new Error('NotAllowedError');});await h.join();await h.button.onclick();assert.equal(h.requests(),1);assert.equal(h.attributes['aria-pressed'],'false');assert.equal(h.button.disabled,false);
  h.receive();assert.equal(h.messages.at(-1).type,'audio');h.packet();assert.equal(h.sent.filter(x=>typeof x!=='string').length,0);
});
test('permission resolving after leaving cannot start capture in another room',async()=>{
  let resolve;const h=setup(stream=>new Promise(r=>{resolve=()=>r(stream);}));await h.join();const pending=h.button.onclick();await Promise.resolve();assert.equal(h.requests(),1);
  await h.join();resolve();await pending;assert.equal(h.track.stopped,true);assert.equal(h.voice.stream,null);assert.equal(h.attributes['aria-pressed'],'false');
});
test('voice reconnect preserves microphone permission and resumes sending only after authentication',async()=>{
  let retry,delay;const h=setup(undefined,{setTimer:(fn,ms)=>{retry=fn;delay=ms;return 1;},clearTimer:()=>{retry=null;}});
  await h.join();await h.voice.enable();assert.equal(h.requests(),1);const stream=h.voice.stream,old=h.voice.socket;
  old.onclose();assert.equal(delay,1500);assert.equal(h.voice.authenticated,false);assert.equal(h.voice.stream,stream);
  const before=h.sent.filter(x=>typeof x!=='string').length;h.packet();assert.equal(h.sent.filter(x=>typeof x!=='string').length,before);
  retry();assert.notEqual(h.voice.socket,old);h.voice.socket.onopen();assert.deepEqual(JSON.parse(h.sent.at(-1)),{type:'join',code:'ABC',token:'test'});
  h.packet();assert.equal(h.sent.filter(x=>typeof x!=='string').length,before);
  h.voice.socket.onmessage({data:'{"type":"ready"}'});h.packet();assert.equal(h.sent.filter(x=>typeof x!=='string').length,before+1);assert.equal(h.requests(),1);assert.equal(h.voice.muted,false);h.voice.leave();
});
test('leaving cancels voice reconnect and stale authentication cannot reopen the session',async()=>{
  let retry;const h=setup(undefined,{setTimer:fn=>{retry=fn;return 1;},clearTimer:()=>{retry=null;}});await h.join();
  const old=h.voice.socket;old.onclose();assert.equal(typeof retry,'function');h.voice.leave();assert.equal(retry,null);
  old.onmessage({data:'{"type":"ready"}'});assert.equal(h.voice.authenticated,false);assert.equal(h.voice.session,null);assert.equal(h.button.hidden,true);
});
