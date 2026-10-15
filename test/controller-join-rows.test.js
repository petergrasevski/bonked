import test from 'node:test';
import assert from 'node:assert/strict';
import {controllerJoinRows} from '../public/controller-join-rows.js';
const devices=Array.from({length:3},(_,index)=>({index,label:'Controller '+index,slotId:null}));
test('detected controllers occupy distinct open join rows without consuming player slots',()=>{
  const rows=controllerJoinRows(devices,8);assert.equal(rows.length,8);assert.deepEqual(rows.slice(0,3),devices.map(d=>[d]));assert.ok(rows.slice(3).every(r=>r.length===0));assert.ok(devices.every(d=>d.slotId===null));
});
test('extra controllers overlap in the last available row and all remain represented',()=>{
  assert.deepEqual(controllerJoinRows(devices,1),[devices]);assert.deepEqual(controllerJoinRows(devices,2),[[devices[0]],[devices[1],devices[2]]]);
});
test('joined controllers leave the waiting rows and a full grid has no join prompt',()=>{
  assert.deepEqual(controllerJoinRows([{...devices[0],slotId:'player'},devices[1],devices[2]],1),[[devices[1],devices[2]]]);assert.deepEqual(controllerJoinRows(devices,0),[]);
});
