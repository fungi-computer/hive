import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gridConnectionMasks } from '../sdk/grid-connections.ts';
import { colonyConstructionVisuals } from '../games/colony-construction-visuals.ts';
import { DEFAULT_VISUAL_BINDINGS } from './visual-bindings.js';

test('grid connections are order-independent and never cross levels', () => {
  const entries = [
    {id:'center',cell:[0,4,0]}, {id:'east',cell:[1,4,0]},
    {id:'south',cell:[0,4,1]}, {id:'above',cell:[0,5,0]},
  ];
  const masks=gridConnectionMasks(entries);
  assert.equal(masks.get('center'),3);
  assert.equal(masks.get('east'),4);
  assert.equal(masks.get('south'),8);
  assert.equal(masks.get('above'),0);
  assert.deepEqual([...masks].sort(),[...gridConnectionMasks([...entries].reverse())].sort());
});

test('Colony joins original wall art using actual site neighbors and checked bank paths', () => {
  const sites=[['a',0,0],['b',1,0],['c',1,1]].map(([id,x,z])=>({id,get:()=>({
    catalog:'timber-wall',x,y:14,z,orientation:'east',phase:'finished',seconds:4,
  })}));
  const visuals=colonyConstructionVisuals({query:()=>sites});
  assert.deepEqual(visuals.map(v=>v.visual),[
    'colony.wall.finished.joint-1','colony.wall.finished.joint-6','colony.wall.finished.joint-8',
  ]);
  const bank=JSON.parse(readFileSync('public/generated-art/goblin-static-art-v2/manifest.json','utf8'));
  const paths=new Set(bank.entries.map(e=>JSON.stringify(e.path)));
  for(const visual of visuals){
    const binding=DEFAULT_VISUAL_BINDINGS[visual.visual];
    assert.equal(binding.facing,false);
    assert(paths.has(JSON.stringify(binding.path)),visual.visual);
  }
  for(const stage of ['stakes','frame','finished'])for(let mask=0;mask<16;mask++)
    assert(paths.has(JSON.stringify(DEFAULT_VISUAL_BINDINGS[`colony.wall.${stage}.joint-${mask}`].path)));
});

test('constructed shelves use the retained two-facing shelf artwork', () => {
  const [visual] = colonyConstructionVisuals({query:()=>[{id:'shelf',get:()=>({
    catalog:'timber-shelf',x:2,y:14,z:3,orientation:'east',phase:'finished',seconds:4,
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
