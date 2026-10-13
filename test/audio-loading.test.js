import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioBank,SOUND_FILES} from '../public/audio-bank.js';
import {MusicAudio} from '../public/music-audio.js';

test('transient downloads retry once; permanent failures retain their exact cause',async()=>{
  let requests=0;const context={decodeAudioData:async()=>({duration:1})};
  const bank=new AudioBank(context,{fetcher:async()=>{requests++;return requests===1?{ok:false,status:503}:{ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};}});
  const result=await bank.load();assert.equal(result.loaded,SOUND_FILES.length);assert.equal(requests,SOUND_FILES.length+1);assert.deepEqual(result.failed,[]);
  requests=0;const missing=new AudioBank(context,{fetcher:async()=>{requests++;return {ok:false,status:404};}});
  const failure=await missing.load();assert.equal(requests,SOUND_FILES.length);assert.equal(failure.errors['engine-idle'],'download: Error: HTTP 404');
});

test('default effects and music fetchers preserve the browser global receiver',async t=>{
  const original=globalThis.fetch;let calls=0;
  t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async function(){
    assert.equal(this,globalThis,'native Window.fetch rejects another receiver');calls++;
    return {ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};
  };
  const context={decodeAudioData:async()=>({duration:1})};
  const bank=new AudioBank(context),music=new MusicAudio(context);
  const result=await bank.load();assert.equal(result.loaded,SOUND_FILES.length);assert.deepEqual(result.failed,[]);
  assert.equal(await music.load(),true);assert.equal(calls,SOUND_FILES.length+1);
});
