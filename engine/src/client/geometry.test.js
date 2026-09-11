import assert from 'node:assert/strict';
import { test } from 'node:test';
import { project, groundPoint, surfacePoint, terrainPoint, terrainHit } from './geometry.js';
import { createTerrainPicker } from './geometry.js';
import { terrainFaces } from '../../../src/art/terrain-faces.js';
import { camera } from '../../../src/art/prop-camera.js';
import { Ray, Vector3 } from 'three';
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
    const terrain={structureSurfaces: [], verticalMetres:0.54,surfaces:[{cell,material:1}]};
    const screen=project(cell[0],(cell[1]+0.5)*0.54,cell[2]);
    assert.deepEqual(terrainPoint(screen.x,screen.y,terrain),{
      cell,point:{x:cell[0],y:(cell[1]+0.5)*0.54,z:cell[2],frame:null}
    });
    const outside=project(cell[0]+2,(cell[1]+0.5)*0.54,cell[2]);
    assert.equal(terrainPoint(outside.x,outside.y,terrain),null);
  }
});

test('visible cliff faces block selection of a lower top behind them', () => {
  const terrain={structureSurfaces: [], verticalMetres:0.54,surfaces:[
    {cell:[0,3,0],material:1},{cell:[-1,0,-2],material:1}
  ]};
  const side=project(0.5,1.55,0);
  assert.deepEqual(terrainPoint(side.x,side.y,{...terrain,surfaces:[terrain.surfaces[1]]})?.cell,[-1,0,-2]);
  assert.equal(terrainPoint(side.x,side.y,terrain),null);
  const hit=terrainHit(side.x,side.y,terrain);
  assert.equal(hit.kind,"terrain-side");
  assert.equal(hit.standingPoint,null);
  assert.deepEqual(hit.column,[0,3,0]);
});

test('world camera can pick the near edge of the full generated map', () => {
  const cell=[31,13,31];
  const terrain={structureSurfaces: [], verticalMetres:0.54,surfaces:[{cell,material:1}]};
  const screen=project(31,13.5*0.54,31);
  assert.deepEqual(terrainPoint(screen.x,screen.y,terrain)?.cell,cell);
});


test('authored upper floors are pickable faces without invented earth skirts', () => {
  const frame = { verticalMetres: 0.54, surfaces: [], structureSurfaces: [
    { cell: [0, 4, 0] }, { cell: [0, 8, 0] },
  ] };
  const top = project(0, 8.5 * 0.54, 0);
  const hit = terrainHit(top.x, top.y, frame);
  assert.equal(hit.kind, "structure-top");
  assert.deepEqual(hit.column, [0, 8, 0]);
  assert.equal(hit.standingPoint.frame, null);
  const below = project(0, 2, 0);
  assert.equal(terrainHit(below.x, below.y, frame), null);
});

function exhaustiveHit(x, y, terrain) {
  const ndc = new Vector3(x / 640 * 2 - 1, 1 - y / 400 * 2, -1);
  const view = camera(640, 400, 1.03, 256);
  const origin = ndc.clone().unproject(view);
  const far = ndc.clone().setZ(1).unproject(view);
  const ray = new Ray(origin, far.sub(origin).normalize());
  const hit = new Vector3();
  const faces = [
    ...[...terrainFaces(terrain.surfaces, terrain.verticalMetres)].map((face) => ({ ...face, source: 'terrain' })),
    ...terrain.structureSurfaces.map((surface) => {
      const [x, y, z] = surface.cell;
      const height = (y + 0.5) * terrain.verticalMetres;
      return { surface, source: 'structure', top: true, vertices: [
        [x - .5, height, z - .5], [x - .5, height, z + .5],
        [x + .5, height, z + .5], [x + .5, height, z - .5],
      ] };
    }),
  ];
  let picked = null, nearest = Infinity;
  for (const face of faces) {
    const vertices = face.vertices.map((vertex) => new Vector3(...vertex));
    for (const indices of [[0, 1, 2], [0, 2, 3]]) {
      if (!ray.intersectTriangle(...indices.map((index) => vertices[index]), true, hit)) continue;
      const distance = origin.distanceToSquared(hit);
      if (distance >= nearest) continue;
      nearest = distance;
      const [cx, cy, cz] = face.surface.cell;
      picked = {
        kind: face.source === 'structure' ? 'structure-top' : face.top ? 'terrain-top' : 'terrain-side',
        surface: face.surface,
        column: face.surface.cell,
        position: { x: hit.x, y: hit.y, z: hit.z },
        standingPoint: face.top ? { x: cx, y: (cy + .5) * terrain.verticalMetres, z: cz, frame: null } : null,
      };
    }
  }
  return picked;
}

test('cached picker matches exhaustive face ownership at triangle boundaries and ties', () => {
  const terrain = {
    verticalMetres: 0.54,
    surfaces: [{ cell: [0, -4, 0], material: 1 }, { cell: [1, 2, 0], material: 2 }],
    structureSurfaces: [{ cell: [0, 2, 0] }, { cell: [0, 2, 0] }],
  };
  const picker = createTerrainPicker();
  const points = [
    project(0, (-4 + 0.5) * terrain.verticalMetres, 0),
    project(0.5, (-4 + 0.5) * terrain.verticalMetres, 0.5),
    project(0, (2 + 0.5) * terrain.verticalMetres, 0),
    project(1, (2 + 0.5) * terrain.verticalMetres, 0),
  ];
  for (const point of points) {
    const expected = exhaustiveHit(point.x, point.y, terrain);
    const actual = picker.hit(point.x, point.y, terrain, 7);
    assert.equal(actual?.kind, expected?.kind);
    assert.deepEqual(actual?.column, expected?.column);
    if (actual && expected) {
      assert.ok(Math.abs(actual.position.x - expected.position.x) < 1e-9);
      assert.ok(Math.abs(actual.position.y - expected.position.y) < 1e-9);
      assert.ok(Math.abs(actual.position.z - expected.position.z) < 1e-9);
    }
  }
  picker.dispose();
});
