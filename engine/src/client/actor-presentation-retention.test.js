import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { Container, Texture, TextureSource } from 'pixi.js';
import { registerVisibleSilhouette } from '../../../src/visual-hit-geometry.js';
import { createActorPresentationOwner } from './actor-presentation-owner.js';
import { createOrderingProjection } from './ordering-projection.js';

const priorStyle = globalThis.getComputedStyle;
afterEach(() => { globalThis.getComputedStyle = priorStyle; });

function texture() {
  const value = new Texture({source:new TextureSource({width:8,height:8})});
  registerVisibleSilhouette(value,{width:8,height:8,rows:[0,1,2,3,4,5,6,7,8],spans:Array.from({length:16},(_,i)=>i%2?7:0)});
  return value;
}
function setup() {
  globalThis.getComputedStyle=()=>({fontFamily:'sans-serif'});
  const parent=new Container(), a=texture(), b=texture(), projection=createOrderingProjection();
  const binding={kind:'static',path:['props','box'],facing:false,anchor:'propAnchor'};
  const art={props:{box:a},propAnchor:{x:.5,y:1},pawnAnchor:{x:.5,y:1},orderingByTexture:new Map([[a,{kind:'volume',min:{x:-.2,y:0,z:-.2},max:{x:.2,y:.5,z:.2}}],[b,{kind:'volume',min:{x:-.2,y:0,z:-.2},max:{x:.2,y:.5,z:.2}}]])};
  let now=0;
  const owner=createActorPresentationOwner({parent,project:(x,y,z)=>projection.project({x,y,z}),bindings:{box:binding,figure:{kind:'figure',key:'test'}},root:{},effectClock:()=>now});
  const subject=(id,x=0)=>({id,x,y:0,z:0,visual:'box',name:id,facing:0});
  const input={subjects:[subject('a'),subject('b',3)],selectedIds:[],art,terrainFrame:{verticalMetres:.54},paused:true,frameSequence:1,cameraTurn:0,projection};
  return {owner,parent,a,b,art,input,subject,setNow:value=>now=value};
}

test('unchanged projected facts retain records; moving one static actor invalidates only itself',()=>{
 const s=setup();try{
  const first=s.owner.update(s.input);
  const next=s.owner.update({...s.input,subjects:s.input.subjects.map(x=>({...x})),terrainFrame:{verticalMetres:.54},frameSequence:2});
  assert.equal(next,first);assert.equal(next[0],first[0]);
  const moved=s.owner.update({...s.input,subjects:[s.subject('a',1),s.subject('b',3)]});
  assert.notEqual(moved[0],first[0]);assert.equal(moved[1],first[1]);
  assert.equal(moved[0].footprint[0].x,1);
 }finally{s.owner.dispose();s.a.destroy(true);s.b.destroy(true);}
});

test('selection, labels and progress update without rebuilding visual geometry',()=>{
 const s=setup();try{
  const first=s.owner.update(s.input), container=first[0].display;
  const changed=s.owner.update({...s.input,selectedIds:['a'],subjects:[{...s.subject('a'),name:'Renamed',activity:{progress:.5,target:[0,0]}},s.subject('b',3)]});
  assert.equal(changed,first);assert.equal(container.children[1].visible,true);assert.equal(container.children[2].text,'Renamed');assert.equal(container.children[3].visible,true);
  const cleared=s.owner.update(s.input);assert.equal(cleared,first);assert.equal(container.children[1].visible,false);assert.equal(container.children[3].visible,false);
 }finally{s.owner.dispose();s.a.destroy(true);s.b.destroy(true);}
});

test('texture, camera, metadata and pickability changes invalidate retained records',()=>{
 const s=setup();try{
  const first=s.owner.update(s.input);
  s.art.props.box=s.b;
  const swapped=s.owner.update(s.input);assert.notEqual(swapped[0],first[0]);assert.equal(swapped[0].display.children[0].texture,s.b);
  const rotated=s.owner.update({...s.input,cameraTurn:1,projection:createOrderingProjection()});assert.notEqual(rotated[0],swapped[0]);
  const changed=s.owner.update({...s.input,subjects:[{...s.subject('a'),pickable:false},s.subject('b',3)]});assert.equal(changed[0].pickable,false);
  s.art.orderingByTexture.set(s.b,{kind:'volume',min:{x:-.4,y:0,z:-.4},max:{x:.4,y:1,z:.4}});
  const metadata=s.owner.update(s.input);assert.equal(metadata[0].orderGeometry.max.y,1);
 }finally{s.owner.dispose();s.a.destroy(true);s.b.destroy(true);}
});

test('reactions expire, removal and reset release cached displays and preserve shared textures',()=>{
 const s=setup();try{
  const first=s.owner.update(s.input);
  s.owner.react('a',[s.b],50);
  const reacting=s.owner.update(s.input);assert.notEqual(reacting[0],first[0]);assert.equal(reacting[1],first[1]);
  s.setNow(51);const restored=s.owner.update(s.input);assert.equal(restored[0].display.children[0].texture,s.a);
  s.owner.update({...s.input,subjects:[s.subject('b',3)]});assert.equal(first[0].display.destroyed,true);
  s.owner.clear();assert.equal(s.parent.children.length,0);assert.equal(s.a.destroyed,false);
  assert.notEqual(s.owner.update(s.input)[1],restored[1]);
 }finally{s.owner.dispose();s.owner.dispose();s.a.destroy(true);s.b.destroy(true);}
 assert.throws(()=>s.owner.update(s.input),/disposed/);
});

test('multipart siblings retain geometry/displays and cleanly change back to one sprite',()=>{
 const s=setup();try{
  const geometry={footprint:[[-.2,0,-.2],[.2,0,-.2],[.2,0,.2],[-.2,0,.2]],minY:0,maxY:.5};
  s.art.partsByOwner=new Map([['["props","box"]',[{id:'surface',role:'supporting-surface',texture:s.a,geometry},{id:'rail',role:'upright-boundary',texture:s.b,geometry}]]]);
  const input={...s.input,subjects:[s.subject('a')]};
  const first=s.owner.update(input);assert.equal(first.length,2);
  assert.equal(s.owner.update({...input,subjects:[s.subject('a')]}),first);
  first[0].display.zIndex=2;first[1].display.zIndex=5;s.owner.syncOverlays();
  assert.equal(s.parent.children[0].zIndex,5.5);
  const moved=s.owner.update({...input,subjects:[s.subject('a',1)]});
  assert.notEqual(moved[0],first[0]);assert.equal(moved[0].display,first[0].display);
  assert.equal(moved[0].contactSurface[0].x,.8);
  s.art.partsByOwner.clear();const whole=s.owner.update(input);
  assert.equal(whole.length,1);assert.equal(whole[0].part,'body');assert.equal(first[0].display.destroyed,true);assert.equal(first[1].display.destroyed,true);
 }finally{s.owner.dispose();s.a.destroy(true);s.b.destroy(true);}
});

test('figure locomotion keeps texture animation independent from static retention',()=>{
 const s=setup();try{
  s.art.figures={test:{idle:Array.from({length:4},()=>[s.a]),walk:Array.from({length:4},()=>[s.b])}};
  const idle={...s.subject('walker'),visual:'figure'};
  const first=s.owner.update({...s.input,subjects:[idle,s.subject('box')],paused:false});
  const moved=s.owner.update({...s.input,subjects:[{...idle,x:.1},s.subject('box')],paused:false,frameSequence:2});
  assert.equal(moved[0],first[0]); // IDs sort box before walker
  assert.notEqual(moved[1],first[1]);assert.equal(moved[1].display.children[0].texture,s.b);
  const paused=s.owner.update({...s.input,subjects:[{...idle,x:.1},s.subject('box')],paused:true,frameSequence:2});
  assert.equal(paused,moved);
 }finally{s.owner.dispose();s.a.destroy(true);s.b.destroy(true);}
});
