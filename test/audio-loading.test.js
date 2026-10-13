import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AudioBank,SOUND_FILES,decodePcmWav} from '../public/audio-bank.js';

const pcmContext=()=>({createBuffer(channels,length,sampleRate){
  const data=Array.from({length:channels},()=>new Float32Array(length));
  return {numberOfChannels:channels,length,sampleRate,duration:length/sampleRate,getChannelData:channel=>data[channel]};
}});
function bytes(name){const file=readFileSync(new URL(`../public/sounds/${name}.wav`,import.meta.url));return file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength);}

test('all shipped effects recover when the native decoder detaches and rejects valid WAV data',async()=>{
  const context={...pcmContext(),async decodeAudioData(input){structuredClone(input,{transfer:[input]});throw new DOMException('Decoding failed','EncodingError');}};
  const bank=new AudioBank(context,{fetcher:async url=>({ok:true,arrayBuffer:async()=>bytes(url.split('/').pop().replace('.wav',''))})});
  const result=await bank.load();assert.equal(result.loaded,SOUND_FILES.length);assert.deepEqual(result.failed,[]);
  assert.equal(Object.keys(result.decodeFallbacks).length,SOUND_FILES.length);
  for(const name of SOUND_FILES){const buffer=bank.get(name);assert.equal(buffer.sampleRate,32000);assert.equal(buffer.numberOfChannels,1);assert.ok(buffer.duration>0&&buffer.duration<16);
    const data=buffer.getChannelData(0);assert.ok(data.some(sample=>sample!==0));assert.ok(data.every(sample=>Number.isFinite(sample)&&Math.abs(sample)<=1));}
});

test('PCM fallback preserves stereo samples, chunk padding and the original sample rate',()=>{
  const buffer=new ArrayBuffer(62),view=new DataView(buffer),text=(at,value)=>[...value].forEach((letter,i)=>view.setUint8(at+i,letter.charCodeAt(0)));
  text(0,'RIFF');view.setUint32(4,54,true);text(8,'WAVE');text(12,'JUNK');view.setUint32(16,1,true);
  text(22,'fmt ');view.setUint32(26,16,true);view.setUint16(30,1,true);view.setUint16(32,2,true);view.setUint32(34,44100,true);view.setUint32(38,176400,true);view.setUint16(42,4,true);view.setUint16(44,16,true);
  text(46,'data');view.setUint32(50,8,true);[-32768,16384,0,32767].forEach((sample,i)=>view.setInt16(54+i*2,sample,true));
  const decoded=decodePcmWav(pcmContext(),buffer);assert.equal(decoded.sampleRate,44100);assert.deepEqual([...decoded.getChannelData(0)],[-1,0]);assert.deepEqual([...decoded.getChannelData(1)],[.5,32767/32768]);
  assert.throws(()=>decodePcmWav(pcmContext(),buffer.slice(0,60)),/Truncated/);
});

test('transient downloads retry once; permanent failures retain their exact cause',async()=>{
  let requests=0;const context={decodeAudioData:async()=>({duration:1})};
  const bank=new AudioBank(context,{fetcher:async()=>{requests++;return requests===1?{ok:false,status:503}:{ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};}});
  const result=await bank.load();assert.equal(result.loaded,SOUND_FILES.length);assert.equal(requests,SOUND_FILES.length+1);assert.deepEqual(result.failed,[]);
  requests=0;const missing=new AudioBank(context,{fetcher:async()=>{requests++;return {ok:false,status:404};}});
  const failure=await missing.load();assert.equal(requests,SOUND_FILES.length);assert.equal(failure.errors['engine-idle'],'download: Error: HTTP 404');
});
