import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {AudioBank,SOUND_FILES} from '../public/audio-bank.js';
import {AudioMixer,mixTargets} from '../public/audio-mixer.js';
import {EngineAudio,engineBlend} from '../public/engine-audio.js';
import {WeaponAudio,weaponFocus} from '../public/weapon-audio.js';
import {RoadAudio,skidParameters,ambienceParameters} from '../public/road-audio.js';
import {audioContext,audioBank} from './audio-helpers.js';
const car=(id,x=0)=>({id,x,y:0,z:0,groundY:0,angle:0,vx:25,vz:8,input:{throttle:1}});
const state=players=>({code:'ABC',round:1,phase:'racing',trackId:'coast',time:100,players,sounds:[],raceTime:0});
const listener={x:0,z:0,angle:0};
test('CC0 manifest covers every shipped buffer with intact WAV data and bounded size',()=>{
  const root=new URL('../public/sounds/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('sources.json',root)));
  assert.equal(manifest.licence,'CC0-1.0');assert.equal(manifest.attributionRequired,false);
  for(const s of [...manifest.sources,...manifest.packs])assert.equal(s.licence,'CC0-1.0');let total=0;
  for(const name of SOUND_FILES){const asset=manifest.assets[name];assert.ok(asset,name);const path=new URL(asset.file,root),bytes=readFileSync(path);
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.ok(asset.duration>0&&asset.duration<16);total+=statSync(path).size;}
  assert.ok(total<5*1024*1024);
});
test('bank shares load, bounds requests and retries only failures',async()=>{
  const ctx=audioContext();let inFlight=0,max=0,calls=0,fail=true;
  const bank=new AudioBank(ctx,{fetcher:async url=>{calls++;max=Math.max(max,++inFlight);await new Promise(r=>setTimeout(r,1));inFlight--;
    return {ok:!(fail&&url.includes('engine-low')),status:503,arrayBuffer:async()=>new ArrayBuffer(4)};}});
  const first=bank.load();assert.equal(bank.load(),first);const result=await first;assert.equal(result.loaded,SOUND_FILES.length-1);assert.ok(max<=4);assert.deepEqual(result.failed,['engine-low']);
  fail=false;const before=calls;await bank.load();assert.equal(calls,before+1);assert.equal(bank.errors.size,0);
});
test('engine bands crossfade at equal power',()=>{
  for(let rpm=850;rpm<7000;rpm+=23){const w=engineBlend(rpm);assert.ok(w.every(v=>v>=0&&v<=1));assert.ok(Math.abs(w.reduce((n,v)=>n+v*v,0)-1)<1e-9);assert.ok(w.filter(v=>v>0).length<=2);}
});
test('local engine stays foreground at camera edge and routes separately',()=>{
  const ctx=audioContext(),mixer=new AudioMixer(ctx),fx=new EngineAudio(ctx,{bank:audioBank(),mixer});
  fx.update(state([car('self',80),car('other',80)]),listener,true,'self');const own=fx.engines.get('self'),other=fx.engines.get('other');
  assert.ok(own.level.gain.value>other.level.gain.value*5);assert.equal(own.pan.connections[0],mixer.bus('playerEngine'));assert.equal(other.pan.connections[0],mixer.bus('rivalEngines'));
  fx.stop();for(const layer of own.layers){assert.ok(layer.source.stopped);layer.source.end();}assert.ok(own.filter.disconnected);
});
test('impact and speech ducking preserve important cues and release',()=>{
  const base=mixTargets(),hit=mixTargets({impact:1}),speech=mixTargets({speech:1});
  assert.ok(hit.rivalEngines/base.rivalEngines<hit.playerEngine/base.playerEngine);assert.ok(hit.ambience<base.ambience*.5);assert.equal(hit.weapons,base.weapons);
  for(const name of ['weapons','playerEngine','rivalEngines','ambience'])assert.ok(speech[name]>0&&speech[name]<base[name]);
  const ctx=audioContext(),mixer=new AudioMixer(ctx);mixer.accent();mixer.update(true,.1);assert.equal(mixer.bus('ambience').gain.value,mixTargets({impact:1,speech:1}).ambience);
  ctx.currentTime=1;mixer.update(true);assert.equal(mixer.bus('ambience').gain.value,base.ambience);mixer.stop();assert.equal(mixer.master.gain.value,0);
});
test('skids follow sideways slip, not boosts, nudges or airborne cars; ice is softer',()=>{
  const c=car('self');assert.ok(skidParameters(c).strength>0);assert.equal(skidParameters({...c,vx:54,vz:0,padBoostRemaining:2}).strength,0);
  for(const change of [{y:2},{falling:true},{eliminated:true},{overturned:true},{nudgeTime:.1},{nudgeMoved:true},{finished:true}])assert.equal(skidParameters({...c,...change}).strength,0);
  assert.ok(skidParameters(c,'ice').strength<skidParameters(c,'coast').strength);
});
test('road audio bounds skids, follows circuit and stops with lifecycle',()=>{
  const ctx=audioContext(),road=new RoadAudio(ctx,{bank:audioBank()}),s=state(Array.from({length:8},(_,i)=>car(String(i),i)));
  road.update(s,listener,true,'7');assert.equal(road.skids.size,4);assert.ok(road.skids.has('7'));assert.equal(road.ambience.size,2);
  const loops=[...road.skids.values(),...road.ambience.values()];road.update(s,listener,false);assert.equal(road.skids.size,0);assert.equal(road.ambience.size,0);assert.ok(loops.every(l=>l.source.stopped));
  road.update({...s,trackId:'ice'},listener,true);assert.deepEqual([...road.ambience.keys()],['wind']);road.update(null,listener,false);assert.equal(road.ambience.size,0);
  assert.equal(ambienceParameters({...s,trackId:'desert'},listener).coast,0);
});
test('weapon allocator protects local critical events, varies samples, bounds releases and frees nodes',()=>{
  const ctx=audioContext(),fx=new WeaponAudio(ctx,{bank:audioBank(),random:()=>0}),p={volume:.1,pan:0};
  const a=fx.voice('impact',p),b=fx.voice('impact',p);assert.notEqual(a.sources[0].buffer,b.sources[0].buffer);
  for(let i=2;i<32;i++)fx.voice('machinegun',p);assert.equal(fx.voices.size,32);
  const important=fx.voice('explosion',{volume:1,pan:0},{local:true});assert.ok(important);assert.ok([...fx.voices].some(v=>v.stopped));
  for(let i=0;i<100;i++)fx.voice('machinegun',p);assert.ok(fx.voices.size<=40);assert.equal(important.stopped,false);
  fx.stop();for(const v of [...fx.voices])for(const source of v.sources)source.end();assert.equal(fx.voices.size,0);
});
test('late-loading samples do not replay old events',()=>{
  const ctx=audioContext(),bank=audioBank(),fx=new WeaponAudio(ctx,{bank}),s=state([car('self')]);s.sounds=[{id:'a',kind:'machinegun',owner:'self',x:0,z:0,at:100}];
  const buffer=bank.buffers.get('gunshot');bank.buffers.delete('gunshot');fx.update(s,listener,true,'self');assert.equal(fx.voices.size,0);
  bank.buffers.set('gunshot',buffer);fx.update(s,listener,true,'self');assert.equal(fx.voices.size,0);
  s.sounds.push({...s.sounds[0],id:'b'});fx.update(s,listener,true,'self');assert.equal(fx.voices.size,1);
});

test('nearby enemy impacts outrank distant owned explosions, with camera listening after death',()=>{
  const self=car('self',80);
  assert.equal(weaponFocus({kind:'explosion',owner:'enemy',x:82,z:0},self),true);
  assert.equal(weaponFocus({kind:'explosion',owner:'self',x:-50,z:0},self),false);
  assert.equal(weaponFocus({kind:'shotgun',owner:'self',x:80,z:0},self),true);
  assert.equal(weaponFocus({kind:'shotgun',owner:'self',x:80,z:0},{...self,eliminated:true}),false);
});
