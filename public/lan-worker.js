import {createPartyHost} from '/shared/party-host.js';
import {TRACKS,selectTrack,getLandscape} from '/shared/game.js';
import {skySurfaces} from '/shared/sky-ground.js';

const host=createPartyHost({post:message=>postMessage(message)});
let previous=performance.now();
onmessage=({data})=>{
  if(data.type==='create'){
    for(const track of Object.keys(TRACKS)){selectTrack(track);getLandscape();skySurfaces();}
    previous=performance.now();
  }
  host.handle(data);
};
setInterval(()=>{const current=performance.now();host.advance((current-previous)/1000);previous=current;},8);
