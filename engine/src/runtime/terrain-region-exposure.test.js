import assert from "node:assert/strict";
import test from "node:test";
import { exposeTerrainFaces } from "./terrain-region-exposure.js";
const bounds = { minX: 0, maxX: 3, minY: 0, maxY: 8, minZ: 0, maxZ: 3 };
const core = { minX: 1, maxX: 2, minZ: 1, maxZ: 2 };
const sample = ([x, y, z]) => ({
  kind: "known",
  solid: x === 1 && z === 1 && (y === 0 || y === 3),
  material: 1,
});
test("exposure preserves cave floor, ceiling and all side orientations without camera state", () => {
  const faces = exposeTerrainFaces({ bounds, core, level: 7, sample });
  assert.equal(faces.length, 11, "world bottom is not invented air");
  assert.deepEqual(
    faces.filter((f) => f.face === "top").map((f) => f.cell),
    [
      [1, 0, 1],
      [1, 3, 1],
    ],
  );
  assert(faces.some((f) => f.face === "bottom" && f.cell[1] === 3));
  assert.deepEqual(
    new Set(faces.map((f) => f.face)),
    new Set(["top", "bottom", "east", "west", "south", "north"]),
  );
  assert.deepEqual(
    exposeTerrainFaces({ bounds, core, level: 7, sample, columnTop: () => 3 }),
    faces,
  );
});
test("cut caps differ from natural tops and unknown/outside never invent side faces", () => {
  const solid = () => ({ kind: "known", solid: true, material: 2 });
  const faces = exposeTerrainFaces({ bounds, core, level: 2, sample: solid });
  assert.deepEqual(faces, [
    { cell: [1, 2, 1], face: "top", material: 2, cap: true },
  ]);
  const edge = exposeTerrainFaces({
    bounds,
    core: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
    level: 7,
    sample: solid,
  });
  assert.deepEqual(edge, [
    { cell: [0, 7, 0], face: "top", material: 2, cap: true },
  ]);
  const unknown = (cell) =>
    cell[0] === 1 && cell[2] === 1 ? solid() : { kind: "unknown" };
  assert.deepEqual(
    exposeTerrainFaces({ bounds, core, level: 2, sample: unknown }),
    faces,
  );
  assert.equal(
    exposeTerrainFaces({ bounds, core, level: 0, sample })[0].cap,
    false,
  );
});
test("exposure rejects unsupported work or face budgets instead of truncating", () => {
  assert.throws(
    () => exposeTerrainFaces({ bounds, core, level: 7, sample, maxFaces: 2 }),
    /face budget/,
  );
  assert.throws(
    () =>
      exposeTerrainFaces({
        bounds: { ...bounds, maxY: 2048 },
        core,
        level: 2047,
        sample,
      }),
    /work budget/,
  );
  assert.deepEqual(exposeTerrainFaces({ bounds, core, level: -1, sample }), []);
});

test("material slabs preserve caves and overhangs across horizontal/vertical seams at every cut",async()=>{
 const {materialPatch}=await import('./terrain-region-fixture.js');
 const {exposeTerrainPatch,terrainPatchExposureSteps}=await import('./terrain-region-exposure.js');
 const bounds={minX:0,maxX:10,minY:0,maxY:260,minZ:0,maxZ:10};
 const baseline={protocolVersion:5,bounds,materials:[{slot:0,solid:false},{slot:1,solid:true},{slot:2,solid:false}]};
 const material=([x,y,z])=>(x===7||x===8||z===7)&&(y%64===0||y===127||y===128)?1:y===200?2:0;
 const patches=[];
 for(let rx=0;rx<2;rx++)for(let rz=0;rz<2;rz++)for(let slab=0;slab<3;slab++)patches.push(materialPatch([rx,rz,slab],bounds,material));
 const key=face=>`${face.cell.join(',')}:${face.face}:${face.material}:${face.cap}`;
 for(const level of [-1,0,63,64,126,127,128,129,199,200,201,255,259]) {
  const expected=exposeTerrainFaces({bounds,core:bounds,level,sample:cell=>({kind:'known',solid:material(cell)===1,material:material(cell)})});
  const actual=patches.flatMap(patch=>exposeTerrainPatch({patch,baseline,level}));
  assert.equal(new Set(actual.map(key)).size,actual.length,'no duplicated seam faces');
  assert.deepEqual(actual.map(key).sort(),expected.map(key).sort(),`cut ${level} preserves full authoritative exposure`);
 }
 for(const patch of patches) {
  const steps=[...terrainPatchExposureSteps({patch,baseline,level:259})];
  assert.equal(steps.length,(patch.bounds.maxX-patch.bounds.minX)*(patch.bounds.maxZ-patch.bounds.minZ));
  assert(steps.every(faces=>faces.length<=128*6),'one step never processes more than one bounded core column');
 }
});
