import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {assetHeaders,matchesETag,clientRevision} from '../server-assets.js';

test('content validators reuse unchanged files and invalidate only changed content',()=>{
  const first=assetHeaders('public/app.js',Buffer.from('old'));
  assert.equal(assetHeaders('public/app.js',Buffer.from('old')).ETag,first.ETag);
  assert.notEqual(assetHeaders('public/app.js',Buffer.from('new')).ETag,first.ETag);
  assert.equal(first['Cache-Control'],'public, no-cache');
  assert.equal(matchesETag(first.ETag,first.ETag),true);
  assert.equal(matchesETag(`"other", ${first.ETag.replace('W/','')}`,first.ETag),true);
  assert.equal(matchesETag('*',first.ETag),true);
  assert.equal(matchesETag(undefined,first.ETag),false);
  assert.equal(matchesETag('W/"different"',first.ETag),false);
  assert.match(assetHeaders('public/track-titles/coast.12314dc1cd97.webp',Buffer.from('image'))['Cache-Control'],/immutable/);
});

test('release fingerprint is stable across restarts and changes with client, shared or vendor content',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'bonked-revision-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const files=['public/index.html','public/app.js','shared/game.js',...['build/three.module.js','build/three.core.js','examples/jsm/utils/BufferGeometryUtils.js','examples/jsm/geometries/RoundedBoxGeometry.js'].map(p=>'node_modules/three/'+p)];
  for(const filename of files){await mkdir(path.dirname(path.join(root,filename)),{recursive:true});await writeFile(path.join(root,filename),filename);}
  let previous=await clientRevision(root);assert.equal(await clientRevision(root),previous);
  await writeFile(path.join(root,'server.js'),'server-only');assert.equal(await clientRevision(root),previous);
  for(const filename of ['public/app.js','shared/game.js','node_modules/three/build/three.core.js']){
    await writeFile(path.join(root,filename),'changed');const next=await clientRevision(root);assert.notEqual(next,previous);previous=next;
  }
});

test('HTTP assets return body-free 304s and the page and uncached version API agree',{timeout:15000},async t=>{
  const base='http://127.0.0.1:33239';
  const proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'33239',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  t.after(()=>proc.kill());
  await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('Test server failed');})]);
  const version=await fetch(base+'/api/version');assert.equal(version.headers.get('cache-control'),'no-store');
  const {revision}=await version.json();assert.match(revision,/^[a-f0-9]{64}$/);
  assert.match(await (await fetch(base+'/')).text(),new RegExp(`name="bonked-revision" content="${revision}"`));
  for(const pathname of ['/','/app.js?v=1.0.0','/shared/game.js','/vendor/three.core.js','/sounds/engine-idle.wav','/music/chill-menu.ogg','/style.css','/fonts/Righteous-Regular.ttf']){
    const first=await fetch(base+pathname),etag=first.headers.get('etag');assert.ok(etag,pathname);assert.ok((await first.arrayBuffer()).byteLength>0);
    const cached=await fetch(base+pathname,{headers:{'If-None-Match':etag}});
    assert.equal(cached.status,304,pathname);assert.equal((await cached.arrayBuffer()).byteLength,0);assert.equal(cached.headers.get('etag'),etag);
    const changed=await fetch(base+pathname,{headers:{'If-None-Match':'W/"old"'}});assert.equal(changed.status,200);
    const head=await fetch(base+pathname,{method:'HEAD'});assert.equal(head.headers.get('etag'),etag);assert.equal((await head.arrayBuffer()).byteLength,0);
  }
});
