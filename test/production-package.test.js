import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('the files shipped by Docker can boot and serve the game',{timeout:15000},async t=>{
  const root=fileURLToPath(new URL('..',import.meta.url));
  const staged=await mkdtemp(path.join(tmpdir(),'bonked-production-'));
  let proc;
  t.after(async()=>{if(proc&&proc.exitCode===null){const exited=once(proc,'exit');proc.kill();await exited;}await rm(staged,{recursive:true,force:true});});
  // Stage the actual Docker COPY manifest, leaving unshipped source files behind.
  const dockerfile=await readFile(path.join(root,'Dockerfile'),'utf8');
  for(const line of dockerfile.split('\n').filter(line=>line.startsWith('COPY '))){
    const parts=line.slice(5).trim().split(/\s+/),destination=parts.pop();
    for(const source of parts){
      const names=source==='package*.json'?(await readdir(root)).filter(name=>/^package.*\.json$/.test(name)):[source];
      for(const name of names)await cp(path.join(root,name),path.join(staged,destination==='./'?name:destination),{recursive:true});
    }
  }
  await symlink(path.join(root,'node_modules'),path.join(staged,'node_modules'),'dir');
  let logs='';
  proc=spawn(process.execPath,['server.js'],{cwd:staged,env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'33343',LAN_MODE:'0'},stdio:['ignore','pipe','pipe']});
  proc.stderr.on('data',chunk=>logs+=chunk);
  await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error(logs||'Packaged server failed to boot');})]);
  for(const route of ['/health','/','/lan.html','/shared/contact-feedback.js'])assert.equal((await fetch('http://127.0.0.1:33343'+route)).status,200,route);
  assert.equal(logs,'');
});
