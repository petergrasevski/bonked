import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {selectTrack,trackAt,spawnCar,constrainRoad,stepCar,NEUTRAL,STEP,terrainAt,getLandscape} from '../shared/game.js';
import {bodyOffset,WHEEL_POINTS} from '../shared/edge-physics.js';
import {predictFleet} from '../shared/prediction.js';
const edgeCar=(id,f,lateral,heading=0)=>{selectTrack(id);const p=trackAt(f);return {...spawnCar(),id:'a',x:p.x+p.nx*lateral,z:p.z+p.nz*lateral,y:p.y,groundY:p.y,trackFraction:f,progress:f,angle:p.angle+heading,pitch:Math.atan(p.grade||0)};};

test('lost outer tyres tip progressively in the correct direction, not an immediate fall',()=>{
  for(const side of [-1,1]){
    const car=edgeCar('ice',.1,side*9.2);constrainRoad(car);
    assert.equal(car.supportedWheels,2);assert.equal(car.falling,false);
    for(let i=0;i<6;i++)stepCar(car,NEUTRAL);
    assert.equal(car.falling,false);assert.ok(car.roll*side>.02);assert.ok(Math.abs(car.roll)<.3);assert.equal(car.health,100);
    for(let i=0;i<90;i++)stepCar(car,NEUTRAL);
    assert.equal(car.falling,true);assert.ok(Math.abs(car.roll)>.15);
  }
});

test('a car can regain wheel support before it tips over the edge',()=>{
  const car=edgeCar('ice',.1,9.2);for(let i=0;i<6;i++)stepCar(car,NEUTRAL);
  const road=trackAt(.1);car.x=road.x;car.z=road.z;
  for(let i=0;i<60;i++)stepCar(car,NEUTRAL);
  assert.equal(car.falling,false);assert.equal(car.health,100);assert.equal(car.supportedWheels,4);assert.ok(Math.abs(car.roll)<.01);
});

test('front wheel loss pitches the nose down rather than rolling sideways',()=>{
  const car=edgeCar('ice',.1,9.2,Math.PI/2);constrainRoad(car);assert.equal(car.supportedWheels,2);
  for(let i=0;i<6;i++)stepCar(car,NEUTRAL);
  assert.ok(car.pitch<-.02);assert.ok(Math.abs(car.roll)<.01);assert.equal(car.falling,false);
});

test('edge and terrain contacts agree between authority and prediction',()=>{
  const server=edgeCar('desert',.18,9.2),client={...server};
  for(let i=0;i<100;i++){stepCar(server,NEUTRAL);predictFleet(client,[],NEUTRAL,STEP);for(const key of ['x','y','z','pitch','roll','vx','vy','vz'])assert.ok(Math.abs(server[key]-client[key])<1e-8,key);assert.equal(server.falling,client.falling);}
});

test('falling cars and wrecks collide with visible mountain and coastal banks',()=>{
  for(const [id,f]of [['desert',.18],['desert',.34],['coast',.15]]){
    const car=edgeCar(id,f,trackWidth(id,f)+.2);car.shield=8;let contact=0,low=car.y,rotation=0;
    for(let i=0;i<240;i++){
      stepCar(car,NEUTRAL);low=Math.min(low,car.y);rotation=Math.max(rotation,Math.abs(car.roll)+Math.abs(car.pitch));
      for(const [x,z]of WHEEL_POINTS){const p=bodyOffset(car,x,0,z),ground=terrainAt(car.x+p.x,car.z+p.z,car.y+3);if(ground&&car.falling){assert.ok(car.y+p.y>=ground.y-.03,`${id} tyre penetrates terrain`);if(car.y+p.y-ground.y<.3)contact++;}}
      for(const key of ['x','y','z','pitch','roll'])assert.ok(Number.isFinite(car[key]));
    }
    assert.ok(contact>0,`${id} catches the falling chassis`);assert.ok(low<trackAt(f).y-.5);assert.ok(rotation>.3);assert.equal(car.health,0);assert.equal(car.shield,0);
  }
});
function trackWidth(id,f){selectTrack(id);return trackAt(f).halfWidth;}

test('terrain collision samples match the actual triangles used by the renderer',()=>{
  for(const id of ['coast','desert']){
    selectTrack(id);const landscape=getLandscape(),arrays=id==='coast'?landscape.lands.flatMap(l=>l.bands):landscape.mountains.flatMap(m=>m.bands);
    let checked=0;for(const vertices of arrays){
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
      for(let i=0;i<vertices.length;i+=Math.max(9,Math.floor(vertices.length/9/12)*9)){
        const x=(vertices[i]+vertices[i+3]+vertices[i+6])/3,z=(vertices[i+2]+vertices[i+5]+vertices[i+8])/3;
        const hit=new THREE.Raycaster(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0)).intersectObject(mesh)[0],surface=landscape.surface.sample(x,z);
        if(hit&&surface){assert.ok(surface.y>=hit.point.y-.0001);checked++;}
      }
      g.dispose();mesh.material.dispose();
    }assert.ok(checked>20);
  }
});
