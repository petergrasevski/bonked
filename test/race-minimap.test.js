import test from 'node:test';
import assert from 'node:assert/strict';
import {minimapProjection,minimapFocus,focusedProjection,showRaceMinimap,RaceMinimap} from '../public/race-minimap.js';
import {TRACKS,selectTrack,TRACK,trackAt} from '../shared/game.js';

test('minimap fits every racing circuit without distorting its shape',()=>{
  for(const id of Object.keys(TRACKS).filter(id=>id!=='cafe')){
    selectTrack(id);const projection=minimapProjection(TRACK);
    for(const p of TRACK){const q=projection.point(p.x,p.z);assert.ok(q.x>=15.99&&q.x<=224.01);assert.ok(q.y>=15.99&&q.y<=164.01);}
    const a=projection.point(0,0),b=projection.point(10,10);assert.ok(Math.abs((b.x-a.x)-(b.y-a.y))<1e-8);
  }
});
test('minimap visibility is limited to active third-person racing',()=>{
  for(const phase of ['lobby','finished'])assert.equal(showRaceMinimap({phase,trackId:'coast'},true),false);
  assert.equal(showRaceMinimap({phase:'racing',trackId:'cafe'},true),false);
  assert.equal(showRaceMinimap({phase:'racing',trackId:'coast'},false),false);
  assert.equal(showRaceMinimap({phase:'racing',trackId:'coast'},true),true);
  assert.equal(showRaceMinimap({phase:'countdown',trackId:'ice'},true),true);
  assert.equal(showRaceMinimap(null,true),false);
});
test('minimap renders the moving death line and every car, marking the local driver last',()=>{
  selectTrack('coast');const strokes=[],arcs=[];
  const ctx={setTransform(){},clearRect(){},drawImage(){},beginPath(){},moveTo(x,y){this.from={x,y};},lineTo(x,y){this.to={x,y};},stroke(){strokes.push({color:this.strokeStyle,from:this.from,to:this.to});},arc(x,y,r){arcs.push({x,y,r});},fill(){},closePath(){}};
  const map=Object.create(RaceMinimap.prototype);Object.assign(map,{root:{hidden:true},ctx,route:{getContext:()=>ctx},track:'coast',points:Array.from({length:512},(_,i)=>trackAt(i/512)),lastDraw:0,projection:minimapProjection(TRACK)});
  const p=trackAt(.2),q=trackAt(.3),players=[{id:'me',color:'#ffaa00',...p},{id:'other',color:'#0099ff',...q},{id:'out',...q,eliminated:true}];
  const state={trackId:'coast',phase:'racing',players,chase:{active:true,progress:.188,...p}};
  map.update(state,'me',{enabled:true,now:100});assert.equal(arcs.length,3);assert.equal(arcs.at(-1).r,4);const first=strokes.find(s=>s.color==='#ff4b55');assert.ok(first);
  state.chase={active:true,progress:.288,...q};map.update(state,'me',{enabled:true,now:200});const last=strokes.filter(s=>s.color==='#ff4b55').at(-1);assert.notDeepEqual(last.from,first.from);
  map.update(state,'me',{enabled:false,now:300});assert.equal(map.root.hidden,true);
});


test('moving minimap crops tightly around the pack and death line',()=>{
  selectTrack('ice');const p=trackAt(.2),q=trackAt(.22),line=trackAt(.16);
  const state={players:[{...p,progress:.188},{...q,progress:.208}],chase:{...line,progress:.148,active:true}};
  const focus=minimapFocus(state),projection=focusedProjection(focus),full=minimapProjection(TRACK);
  assert.ok(projection.scale>full.scale*2,'zoom into the relevant section');
  for(const p of [...state.players,line]){const point=projection.point(p.x,p.z);assert.ok(point.x>=16&&point.x<=224);assert.ok(point.y>=16&&point.y<=164);}
  const moved={players:state.players.map(p=>({...p,x:p.x+100})),chase:{...state.chase,x:line.x+100}};
  const next=minimapFocus(moved,focus,.05);assert.ok(next.x>focus.x&&next.x<focus.x+100,'pan smoothly');
  const wide={players:[{x:-400,z:-150},{x:400,z:150}],chase:{progress:.148,...line}};
  const expanded=focusedProjection(minimapFocus(wide,focus,.05));
  for(const car of wide.players){const p=expanded.point(car.x,car.z);assert.ok(p.x>=16&&p.x<=224);assert.ok(p.y>=16&&p.y<=164);}
});
