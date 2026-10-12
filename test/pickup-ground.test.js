import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrack,PICKUP_LOCATIONS,SEGMENTS,TRACK_LENGTH} from '../shared/game.js';
import {padRoadTriangles,samplePadRoad} from '../shared/boost-pads.js';
import {pickupGroundGeometry} from '../public/pickup-ground.js';

test('pickup ground markers follow the actual curved road triangles on ascent, descent and crossings',()=>{
  for(const track of ['coast','ice','desert']){
    selectTrack(track);
    for(const p of PICKUP_LOCATIONS){
      const geometry=pickupGroundGeometry(p),positions=geometry.attributes.position,surface=padRoadTriangles(SEGMENTS,p.fraction,TRACK_LENGTH);
      assert.ok(positions.count>0);
      // Check triangle interiors too: a ring tilted only at its centre can still clip.
      for(let i=0;i<positions.count;i+=3){
        let x=0,y=0,z=0;for(let j=0;j<3;j++){x+=positions.getX(i+j)/3;y+=positions.getY(i+j)/3;z+=positions.getZ(i+j)/3;}
        const ground=samplePadRoad(surface,p.x+x,p.z+z);assert.notEqual(ground,null);
        assert.ok(Math.abs(p.y+y-ground-.01)<.0001,`${track} pickup ${p.fraction} conforms to road`);
      }
      geometry.dispose();
    }
  }
  selectTrack('coast');
});
