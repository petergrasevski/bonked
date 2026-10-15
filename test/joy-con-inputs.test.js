import test from 'node:test';
import assert from 'node:assert/strict';
import {splitJoyCon} from '../public/joy-con-inputs.js';
import {decodeController,STANDARD_MAPPING} from '../public/controller.js';
import {controllerDiagramModel} from '../public/controller-diagram.js';
const pair=(length=22)=>({index:0,id:'Joy-Con (L/R)',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length},()=>({pressed:false,value:0}))});
const press=(pad,index)=>pad.buttons[index]={pressed:true,value:1};
test('physical sideways face positions match on both Joy-Cons using the reported macOS layout',()=>{
  for(const [side,raw]of [[0,{throttle:14,reverse:12,fire:13}],[1,{throttle:0,reverse:1,fire:2}]])for(const [action,index]of Object.entries(raw)){
    const pad=pair();press(pad,index);const halves=splitJoyCon(pad),input=decodeController(halves[side]),other=decodeController(halves[1-side]);
    assert.equal(!!input[action],true,`${side}: ${action}`);
    for(const name of ['throttle','reverse','fire']){if(name!==action)assert.equal(!!input[name],false);assert.equal(!!other[name],false);}
  }
});
test('SL/SR independently nudge each half; outer shoulder and trigger do not nudge by default',()=>{
  for(const [side,sl,sr,shoulder,trigger]of [[0,18,19,4,6],[1,20,21,5,7]]){
    for(const [index,left,right]of [[sl,true,false],[sr,false,true],[shoulder,false,false],[trigger,false,false]]){
      const pad=pair();press(pad,index);const halves=splitJoyCon(pad),input=decodeController(halves[side]),other=decodeController(halves[1-side]);
      assert.equal(input.left,left);assert.equal(input.right,right);assert.equal(other.left,false);assert.equal(other.right,false);
    }
    const pad=pair();press(pad,trigger);const half=splitJoyCon(pad)[side];assert.equal(decodeController(half,{...STANDARD_MAPPING,buttons:{...STANDARD_MAPPING.buttons,left:8}}).left,true,'outer trigger remains available for explicit remapping');
  }
});
test('missing rail buttons stay neutral and the visual guide explains the limitation',()=>{
  const pad=pair(17);press(pad,4);press(pad,6);
  for(const half of splitJoyCon(pad)){
    assert.equal(half.railButtonsAvailable,false);assert.equal(decodeController(half).left,false);assert.equal(decodeController(half).right,false);
    const model=controllerDiagramModel({pad:half,label:'Joy-Con',joyConSide:half.joyConSide,railButtonsAvailable:half.railButtonsAvailable,mapping:STANDARD_MAPPING});
    assert.match(model.notice,/does not expose SL\/SR/);assert.equal(model.bindings.find(b=>b.action==='left').available,false);
  }
});
test('the same visual guide describes Joy-Con defaults, PS5 buttons and saved/custom remapping',()=>{
  const half=splitJoyCon(pair())[0],device={pad:half,label:'Joy-Con Left',joyConSide:'L',railButtonsAvailable:true,mapping:STANDARD_MAPPING};
  const model=controllerDiagramModel(device),binding=action=>model.bindings.find(b=>b.action===action);
  assert.equal(binding('throttle').detail,'Bottom face');assert.equal(binding('fire').detail,'Right face');assert.equal(binding('reverse').detail,'Left face');assert.equal(binding('left').detail,'SL');assert.equal(binding('right').detail,'SR');
  const custom={...STANDARD_MAPPING,buttons:{...STANDARD_MAPPING.buttons,fire:4,left:8}};
  const configured=controllerDiagramModel(device,custom);assert.equal(configured.bindings.find(b=>b.action==='fire').detail,'L');assert.equal(configured.bindings.find(b=>b.action==='left').detail,'ZL');
  const ps5=controllerDiagramModel({pad:pair(),label:'DualSense',mapping:STANDARD_MAPPING});assert.equal(ps5.kind,'ps5');assert.equal(ps5.bindings.find(b=>b.action==='throttle').detail,'×');assert.equal(ps5.bindings.find(b=>b.action==='fire').detail,'R1');
  const unknown=controllerDiagramModel({pad:{...pair(),mapping:''},label:'Controller',mapping:STANDARD_MAPPING});assert.equal(unknown.kind,'generic');assert.match(unknown.notice,/Browser button layout/);
});
