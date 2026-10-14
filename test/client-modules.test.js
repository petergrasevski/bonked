import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

const specifiers=source=>[...source.matchAll(/(?:\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?|\bimport\s*\(\s*)['"]([^'"]+)['"]/g)].map(match=>match[1]);

test('the startup page serves its entire browser module graph, including shared dependencies',{timeout:15000},async t=>{
  const base='http://127.0.0.1:33231';
  const proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'33231',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  t.after(()=>proc.kill());
  await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('Test server failed to start');})]);
  const page=await fetch(base+'/');assert.equal(page.status,200);
  const html=await page.text(),scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  const imports=JSON.parse(scripts.find(([,attrs])=>/type="importmap"/.test(attrs))[2]).imports;
  const queue=[];
  for(const [,attrs,source]of scripts){
    if(/type="importmap"/.test(attrs))continue;
    const src=attrs.match(/src="([^"]+)"/);
    for(const specifier of src?[src[1]]:specifiers(source))queue.push({specifier,parent:base+'/'});
  }
  const seen=new Set();
  while(queue.length){
    const {specifier,parent}=queue.shift(),resolved=imports[specifier]||specifier;
    assert.ok(resolved.startsWith('/')||resolved.startsWith('.'),`Unmapped browser import: ${specifier}`);
    const url=new URL(resolved,parent).href;
    if(seen.has(url))continue;seen.add(url);
    const response=await fetch(url);
    assert.equal(response.status,200,`${url} imported by ${parent} must be served`);
    assert.match(response.headers.get('content-type'),/javascript/,`${url} must have a JavaScript content type`);
    for(const dependency of specifiers(await response.text()))queue.push({specifier:dependency,parent:url});
  }
  assert.ok(seen.has(base+'/startup.js'),'the test follows the actual startup entry point');
  assert.ok(seen.has(base+'/app.js?v=1.0.0'));
  assert.ok(seen.has(base+'/shared/coastal-barriers.js'),'the new shared module is reachable through browser imports');
  assert.ok(seen.size>50,'the full 3D game dependency graph is checked');
  assert.equal((await fetch(base+'/server.js')).status,404,'server implementation stays private');
});
