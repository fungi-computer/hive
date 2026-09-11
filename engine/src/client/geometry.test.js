import assert from 'node:assert/strict';
import { test } from 'node:test';
import { project, groundPoint, surfacePoint, terrainPoint } from './geometry.js';
test('ground picking inverts the actual retained projection across the clearing', () => {
  for (let x=-7;x<=7;x++) for(let z=-7;z<=7;z++) {
    const point=project(x,0,z);
    const picked=groundPoint(point.x,point.y);
    assert.equal(picked.x+0,x);
    assert.equal(picked.z+0,z);
  }
});


test('raised moving-deck picking preserves local coordinates through rotation', () => {
  for(const facing of [0, 1, 2, 3, 0.5]) {
    const fact={id:'ship',pose:{position:{x:10,y:2,z:-4},facing},surface:{minX:-3,maxX:3,minZ:-2,maxZ:2,height:1}};
    const angle=facing*Math.PI/2;
    const screen=project(10+Math.cos(angle)*2-Math.sin(angle),3,-4+Math.sin(angle)*2+Math.cos(angle));
    const picked=surfacePoint(screen.x,screen.y,fact);
    assert.ok(Math.abs(picked.x-2)<1e-8);
    assert.ok(Math.abs(picked.z-1)<1e-8);
    assert.equal(picked.y,1);assert.equal(picked.frame,'ship');
    const outside=project(10+Math.cos(angle)*4,3,-4+Math.sin(angle)*4);
    assert.equal(surfacePoint(outside.x,outside.y,fact),null);
  }
});

test('terrain picking uses signed voxel elevation and rejects unpublished ground', () => {
  for (const cell of [[4,13,-3],[-12,-8,9]]) {
    const terrain={verticalMetres:0.54,surfaces:[{cell,material:1}]};
    const screen=project(cell[0],(cell[1]+0.5)*0.54,cell[2]);
    assert.deepEqual(terrainPoint(screen.x,screen.y,terrain),{
      cell,point:{x:cell[0],y:(cell[1]+0.5)*0.54,z:cell[2],frame:null}
    });
    const outside=project(cell[0]+2,(cell[1]+0.5)*0.54,cell[2]);
    assert.equal(terrainPoint(outside.x,outside.y,terrain),null);
  }
});

test('visible cliff faces block selection of a lower top behind them', () => {
  const terrain={verticalMetres:0.54,surfaces:[
    {cell:[0,3,0],material:1},{cell:[-1,0,-2],material:1}
  ]};
  const side=project(0.5,1.55,0);
  assert.deepEqual(terrainPoint(side.x,side.y,{...terrain,surfaces:[terrain.surfaces[1]]})?.cell,[-1,0,-2]);
  assert.equal(terrainPoint(side.x,side.y,terrain),null);
});
