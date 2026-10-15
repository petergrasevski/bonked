import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectTrack,trackAt,terrainAt,volcanoRecoverableAt,OBSTACLES,getLandscape} from '../shared/game.js';
import {volcanoRecoveryBoundary,volcanoShrubStyle} from '../shared/volcano-boundary.js';

test('vegetation traces the actual death-timer boundary including sharp shelf ends',()=>{
  selectTrack('volcano');const obstacles=OBSTACLES.length,triangles=getLandscape().surface,points=volcanoRecoveryBoundary();
  assert.ok(points.length>150&&points.length<400,'bounded scenery budget');
  for(const p of points){
    const adjacent=[[.15,0],[-.15,0],[0,.15],[0,-.15]].map(([dx,dz])=>{const x=p.x+dx,z=p.z+dz,s=terrainAt(x,z);return !!s&&volcanoRecoverableAt({...p,x,z,y:s.y});});
    assert.ok(adjacent.some(Boolean)&&!adjacent.every(Boolean),`safe and unsafe terrain must meet at ${p.trackFraction}`);
  }
  assert.ok(points.some(p=>p.trackFraction<.2&&p.extra>20));assert.ok(points.some(p=>p.trackFraction>.6&&p.extra>20));
  assert.equal(OBSTACLES.length,obstacles);assert.equal(getLandscape().surface,triangles);
  assert.deepEqual(volcanoRecoveryBoundary(),points,'deterministic placement');
});
test('terrain becomes substantially steeper immediately below the planted shelf lip',()=>{
  selectTrack('volcano');for(const f of [.16,.66]){const p=trackAt(f),height=extra=>terrainAt(p.x-p.nx*(p.halfWidth+extra),p.z-p.nz*(p.halfWidth+extra)).y;
    const upper=(height(24)-height(28))/4,lower=(height(30)-height(34))/4;
    assert.ok(upper<Math.tan(35*Math.PI/180));assert.ok(lower>2&&lower>upper*5);
  }
});
test('shrubs provide stable variation in species, silhouette, palette and scale',()=>{
  const styles=Array.from({length:300},(_,i)=>volcanoShrubStyle(i));assert.equal(new Set(styles.map(s=>s.kind)).size,3);assert.equal(new Set(styles.map(s=>s.color)).size,5);
  assert.ok(Math.max(...styles.map(s=>s.height))-Math.min(...styles.map(s=>s.height))>.9);assert.deepEqual(volcanoShrubStyle(42),volcanoShrubStyle(42));
});
test('boundary planting is render-only and exclusive to Krakatoa',async()=>{
  for(const id of ['coast','ice','desert','factory']){selectTrack(id);assert.deepEqual(volcanoRecoveryBoundary(),[]);}
  const source=await readFile(new URL('../public/volcano-bushes.js',import.meta.url),'utf8');assert.doesNotMatch(source,/OBSTACLES|addTriangles|collider/);
});
