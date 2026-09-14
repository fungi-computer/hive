import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { edgeJunctions } from '../sdk/edge-connections.ts';
import { colonyConstructionVisuals } from '../games/colony-construction-visuals.ts';
import { colonyEnvironment } from '../games/colony-environment.ts';
import { DEFAULT_VISUAL_BINDINGS } from './visual-bindings.js';

test('edge junctions retain exact directions, are order-independent, and never cross levels', () => {
  const entries = [
    {id:'x',edge:{cell:[0,4,0],axis:'x'}},
    {id:'z',edge:{cell:[0,4,0],axis:'z'}},
    {id:'above',edge:{cell:[0,5,0],axis:'z'}},
  ];
  const normalize=(values)=>values.map(({point,mask,incident})=>({point,mask,incident})).sort((left,right)=>JSON.stringify(left.point).localeCompare(JSON.stringify(right.point)));
  assert.deepEqual(normalize(edgeJunctions(entries)),normalize([
    {point:[0.5,4,-0.5],mask:2,incident:['x']},
    {point:[0.5,4,0.5],mask:12,incident:['x','z']},
    {point:[-0.5,4,0.5],mask:1,incident:['z']},
    {point:[0.5,5,0.5],mask:4,incident:['above']},
    {point:[-0.5,5,0.5],mask:1,incident:['above']},
  ]));
  assert.deepEqual(edgeJunctions(entries), edgeJunctions([...entries].reverse()));
});

test('Colony derives edge-wall joints from canonical physical neighbors', () => {
  const sites=[
    ['a',0,0,'x'], ['b',0,0,'z'], ['above',0,0,'z',15],
  ].map(([id,x,z,axis,y=14])=>({id,get:()=>({
    catalog:'timber-wall',targetKind:'edge',targetX:x,targetY:y,targetZ:z,targetDirection:axis,phase:'finished',seconds:4,
  })}));
  const visuals=colonyConstructionVisuals({query:()=>sites});
  assert.deepEqual(visuals.slice(0,3).map(v=>v.visual),[
    'colony.wall.segment.finished.x','colony.wall.segment.finished.z','colony.wall.segment.finished.z',
  ]);
  const wallY=(14-.5)*colonyEnvironment.world.verticalMetres;
  const upperWallY=(15-.5)*colonyEnvironment.world.verticalMetres;
  assert.deepEqual(visuals.slice(0,3).map(v=>v.pose.position),[
    {x:0.5,y:wallY,z:0},{x:0,y:wallY,z:0.5},{x:0,y:upperWallY,z:0.5},
  ]);
  assert.deepEqual(visuals.map(v=>v.placement),[
    {kind:'edge',edge:{cell:[0,14,0],axis:'x'}},
    {kind:'edge',edge:{cell:[0,14,0],axis:'z'}},
    {kind:'edge',edge:{cell:[0,15,0],axis:'z'}},
  ]);
});

test('constructed shelves use the retained two-facing shelf artwork', () => {
  const [visual] = colonyConstructionVisuals({query:()=>[{id:'shelf',get:()=>({
    catalog:'timber-shelf',targetKind:'cell',targetX:2,targetY:14,targetZ:3,targetDirection:'east',phase:'finished',seconds:4,
  })}]});
  assert.equal(visual.visual, 'colony.shelf.finished');
  const binding=DEFAULT_VISUAL_BINDINGS[visual.visual];
  assert.equal(binding.facing,true);
  const bank=JSON.parse(readFileSync('public/generated-art/goblin-static-art-v2/manifest.json','utf8'));
  const paths=new Set(bank.entries.map(e=>JSON.stringify(e.path)));
  assert(paths.has(JSON.stringify([...binding.path,1])));
});

test('brew-station construction stages use the retained clearing artwork', () => {
  const bank=JSON.parse(readFileSync('public/generated-art/goblin-static-art-v2/manifest.json','utf8'));
  const paths=new Set(bank.entries.map(e=>JSON.stringify(e.path)));
  for(const stage of ['stakes','frame','finished']){
    const binding=DEFAULT_VISUAL_BINDINGS[`colony.brew-station.${stage}`];
    assert.equal(binding.facing,false);
    assert(paths.has(JSON.stringify(binding.path)),`missing retained brew-station ${stage} art`);
  }
  assert.equal(DEFAULT_VISUAL_BINDINGS['colony.brew-station'],undefined);
});

test('brew-station process profiles bind every retained frame bank through one static animation shape', () => {
  const bank=JSON.parse(readFileSync('public/generated-art/goblin-static-art-v2/manifest.json','utf8'));
  const paths=new Set(bank.entries.map(e=>JSON.stringify(e.path)));
  for(const profile of ['empty','stock-w0-b0-k0','stock-w1-b1-k1','prepare','prepare-attended','ferment','ferment-burning','keg','settled']){
    const binding=DEFAULT_VISUAL_BINDINGS[`colony.brew-station.profile.${profile}`];
    assert.equal(binding.frames,true);
    assert(paths.has(JSON.stringify([...binding.path,0])),`missing retained brew-station ${profile} frame`);
  }
});
