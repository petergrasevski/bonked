import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CarNameTooltip,pickCar} from '../public/car-name-tooltip.js';
const rect={left:0,top:0,width:800,height:600};
function fixture(){
  const camera=new THREE.PerspectiveCamera(55,4/3,.1,200);camera.position.set(0,22,25);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const cars=new Map();for(const [id,x]of [['me',-7],['one',0],['two',7]]){const car=new THREE.Group();car.position.x=x;car.updateMatrixWorld();cars.set(id,car);}
  const point=id=>{const p=new THREE.Vector3(0,.5,0).applyMatrix4(cars.get(id).matrixWorld).project(camera);return {x:(p.x+1)*400,y:(1-p.y)*300};};
  return {camera,cars,point};
}
test('car picking selects visible opponents, ignores own car and offscreen cars, and allows a touch margin',()=>{
  const {camera,cars,point}=fixture();
  for(const touch of [false,true])for(const id of ['me','one','two']){const p=point(id);assert.equal(pickCar(cars,camera,rect,p.x,p.y,'me',touch),id==='me'?null:id);}
  const p=point('one');cars.get('one').visible=false;assert.equal(pickCar(cars,camera,rect,p.x,p.y,'me'),null);
  cars.get('one').visible=true;assert.equal(pickCar(cars,camera,rect,0,0,'me',true),null);
  let marginPoint;for(let x=p.x;x<p.x+100;x++)if(!pickCar(cars,camera,rect,x,p.y,'me')&&pickCar(cars,camera,rect,x,p.y,'me',true)==='one'){marginPoint=x;break;}
  assert.ok(marginPoint,'touch adds tolerance beyond mouse bounds');
  cars.get('one').position.copy(camera.position).add(new THREE.Vector3(0,5,5));cars.get('one').updateMatrixWorld();assert.equal(pickCar(cars,camera,rect,p.x,p.y,'me'),null);
});
test('tap and click replace one following tooltip, expire in three seconds, and reject drags and controls',()=>{
  const view=fixture(),handlers={},surface={addEventListener:(event,fn)=>handlers[event]=fn,getBoundingClientRect:()=>rect};
  const label={hidden:true,textContent:'',style:{setProperty(){}}};let now=0,enabled=true;
  const state={phase:'racing',code:'ABC',round:1,trackId:'coast',players:[{id:'one',name:'<b>Nova</b>',color:'#ff0000'},{id:'two',name:'Mika',color:'#00ff00'}]};
  const tooltip=new CarNameTooltip(surface,label,{world:()=>view,state:()=>state,localId:()=> 'me',enabled:()=>enabled,now:()=>now});
  const event=(id,type='mouse')=>{const p=view.point(id);return {button:0,pointerId:7,pointerType:type,clientX:p.x,clientY:p.y};};
  const tap=(id,type)=>{const e=event(id,type);handlers.pointerdown(e);handlers.pointerup(e);};
  tap('one');assert.equal(label.textContent,'<b>Nova</b>','names are assigned as text, never HTML');assert.equal(label.hidden,false);
  const position=label.style.transform;view.cars.get('one').position.x+=1;view.cars.get('one').updateMatrixWorld();tooltip.update(16);assert.notEqual(label.style.transform,position);
  now=2000;tap('two','touch');assert.equal(label.textContent,'Mika');assert.equal(tooltip.selected.id,'two');
  tooltip.update(4999);assert.equal(label.hidden,false);tooltip.update(5000);assert.equal(label.hidden,true);
  now=6000;const e=event('one','touch');handlers.pointerdown(e);handlers.pointermove({...e,clientX:e.clientX+20});handlers.pointerup(e);assert.equal(tooltip.selected,null,'drag returning to its start is not a tap');
  handlers.pointerdown(e);handlers.pointercancel(e);handlers.pointerup(e);assert.equal(tooltip.selected,null);
  enabled=false;tap('one');assert.equal(tooltip.selected,null);enabled=true;
  tap('one');state.round++;tooltip.update(now);assert.equal(label.hidden,true,'round changes clear selection');
  tap('two');state.players=[];tooltip.update(now);assert.equal(label.hidden,true,'departed players lose their label');
});
