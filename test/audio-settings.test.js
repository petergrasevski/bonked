import test from 'node:test';
import assert from 'node:assert/strict';
import {readAudioSettings,saveAudioSettings,AUDIO_SETTINGS_KEY} from '../public/audio-settings.js';
test('new profiles and unavailable or corrupt storage use audible 50% defaults',()=>{
  for(const storage of [undefined,{getItem(){throw Error('blocked');}},{getItem:()=>'{broken'}, {getItem:()=>'null'}, {getItem:()=>'{}'}, {getItem:()=>'{"effects":"0","music":null}'}]){
    assert.deepEqual(readAudioSettings(storage),{effects:.5,music:.5});
  }
  assert.doesNotThrow(()=>saveAudioSettings({setItem(){throw Error('blocked');}},{effects:.5,music:.5}));
});
test('volume preferences persist independently, including mute, and clamp stale values',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  saveAudioSettings(storage,{effects:0,music:.73});assert.deepEqual(readAudioSettings(storage),{effects:0,music:.73});
  storage.setItem(AUDIO_SETTINGS_KEY,'{"effects":-2,"music":4}');assert.deepEqual(readAudioSettings(storage),{effects:0,music:1});
});
