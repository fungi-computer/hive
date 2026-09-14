import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { edgeAdjacency } from '../sdk/edge-connections.ts';
import { colonyConstructionVisuals } from '../games/colony-construction-visuals.ts';
import { colonyEnvironment } from '../games/colony-environment.ts';
import { DEFAULT_VISUAL_BINDINGS } from './visual-bindings.js';

test('edge connections are order-independent and never cross levels', () => {
  const entries = [
    {id:'x',edge:{cell:[0,4,0],axis:'x'}},
    {id:'z',edge:{cell:[0,4,0],axis:'z'}},
    {id:'above',edge:{cell:[0,5,0],axis:'z'}},
  ];
  const connections=edgeAdjacency(entries);
  assert.deepEqual(connections.get('x'),{
    negative:{tangent:false,perpendicular:0}, positive:{tangent:false,perpendicular:1},
  });
  assert.deepEqual(connections.get('z'),{
    negative:{tangent:false,perpendicular:0}, positive:{tangent:false,perpendicular:1},
  });
  assert.deepEqual(connections.get('above'),{
    negative:{tangent:false,perpendicular:0}, positive:{tangent:false,perpendicular:0},
  });
  assert.deepEqual([...connections], [...edgeAdjacency([...entries].reverse())].reverse());
});

test('Colony derives edge-wall joints from canonical physical neighbors', () => {
  const sites=[
    ['a',0,0,'x'], ['b',0,0,'z'], ['above',0,0,'z',15],
  ].map(([id,x,z,axis,y=14])=>({id,get:()=>({
    catalog:'timber-wall',targetKind:'edge',targetX:x,targetY:y,targetZ:z,targetDirection:axis,phase:'finished',seconds:4,
  })}));
  const visuals=colonyConstructionVisuals({query:()=>sites});
  assert.deepEqual(visuals.map(v=>v.visual),[
    'colony.wall.finished.corner.x','colony.wall.finished.corner.z','colony.wall.finished.end.z',
  ]);
  const wallY=(14-.5)*colonyEnvironment.world.verticalMetres;
  const upperWallY=(15-.5)*colonyEnvironment.world.verticalMetres;
  assert.deepEqual(visuals.map(v=>v.pose.position),[
    {x:0.5,y:wallY,z:0},{x:0,y:wallY,z:0.5},{x:0,y:upperWallY,z:0.5},
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
