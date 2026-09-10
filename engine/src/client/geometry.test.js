import assert from 'node:assert/strict';
import { test } from 'node:test';
import { project, groundPoint } from './geometry.js';
test('ground picking inverts the actual retained projection across the clearing', () => {
  for (let x=-7;x<=7;x++) for(let z=-7;z<=7;z++) {
    const point=project(x,0,z);
    const picked=groundPoint(point.x,point.y);
    assert.equal(picked.x+0,x);
    assert.equal(picked.z+0,z);
  }
});
