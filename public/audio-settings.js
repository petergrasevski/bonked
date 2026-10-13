export const AUDIO_SETTINGS_KEY='bonked-audio-volumes';
export function readAudioSettings(storage){
  let saved;try{saved=JSON.parse(storage?.getItem(AUDIO_SETTINGS_KEY)||'null');}catch{}
  const level=value=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):.5;
  return {effects:level(saved?.effects),music:level(saved?.music),muted:saved?.muted===true};
}
export function saveAudioSettings(storage,settings){try{storage?.setItem(AUDIO_SETTINGS_KEY,JSON.stringify(settings));}catch{}}
