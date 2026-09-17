import test from 'node:test';
import assert from 'node:assert/strict';
import {grassCover} from './living-terrain.js';

function geometry(root){return root.children.map(m=>Array.from(m.geometry.attributes.position.array));}
function dispose(root){for(const child of root.children)child.geometry.dispose();}
test('green and dead grass share exact geometry for every mask, variant and height',()=>{
  for(const height of ['short','full'])for(let variant=0;variant<3;variant++)for(let mask=0;mask<16;mask++){
    const green=grassCover({height,variant,mask}),dead=grassCover({height,variant,mask,condition:'dead'});
    assert.deepEqual(geometry(green),geometry(dead));
    assert.equal(green.children.length===0,mask===0);
    if(mask) assert.notDeepEqual(green.children.map(m=>m.material.color.getHex()),dead.children.map(m=>m.material.color.getHex()));
    dispose(green);dispose(dead);
  }
});
