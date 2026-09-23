import test from "node:test";
import assert from "node:assert/strict";
import { createTerrainProjectionCache, createWorldView, displayedTerrain, projectWorldFact, setTerrainLevelRange, setWorldViewLevel, terrainLevelRange, toggleWorldCutaway } from "./world-view.js";
import { eligibleSelectedIds, selectionFromSubjects } from "./controls.js";
import { surfaceSubjectFromOrdered } from "./draw-record-facts.js";

test("world view honors its supplied signed range", () => {
  const view = createWorldView({ range: { min: -2, max: 3 }, level: 0 });
  assert.equal(setWorldViewLevel(view, -1).level, -1);
  assert.equal(setWorldViewLevel(view, 4), view);
});

test("a visible surface does not cap how deeply the camera can cut", () => {
  const frame = { baseline: { bounds: { minY: -32, maxY: 40 } },
    surfaces: [{ cell: [0, 18, 0] }], structureSurfaces: [] };
  const range = terrainLevelRange(frame);
  assert.deepEqual(range, { min: -32, max: 18 });
  const view = setTerrainLevelRange(createWorldView(), range, 18);
  assert.equal(setWorldViewLevel(view, 16).level, 16);
});

test("untagged facts remain visible and covered facts need presented cutaway data", () => {
  const view = createWorldView({ range: { min: 0, max: 1 }, level: 1, presentedSurfaces: ["roof"] });
  assert.deepEqual(projectWorldFact({}, view), { visible: true, pickable: true });
  const fact = { view: { level: 1, covered: true, surfaceId: "roof" } };
  assert.deepEqual(projectWorldFact(fact, view), { visible: false, pickable: false });
  assert.deepEqual(projectWorldFact(fact, toggleWorldCutaway(view, true)), { visible: true, pickable: true });
  assert.equal(projectWorldFact({ view: { level: 0 } }, view).visible, false);
});

test("projected unpickable subjects are excluded from point, box, and surface paths", () => {
  const subjects = [
    { id: "hidden", screen: { x: 10, y: 10 }, pickable: false, surface: {} },
    { id: "open", screen: { x: 10, y: 10 }, pickable: true, surface: {} },
  ];
  const box = { left: 10, right: 10, top: 10, bottom: 10 };
  assert.deepEqual(selectionFromSubjects(subjects, box), ["open"]);
  assert.equal(surfaceSubjectFromOrdered(
    subjects.map((subject) => ({ id: subject.id })),
    subjects,
    { x: 2, y: 3 },
    () => true,
  )?.subject.id, "open");
  assert.deepEqual(eligibleSelectedIds(subjects, ["hidden", "open"]), ["open"]);
  assert.deepEqual(eligibleSelectedIds(subjects, ["hidden"]), []);
});

test("cutaway retains published cave water at or below the selected level", () => {
  const frame = {
    revision: 4,
    structureSurfaces: [], verticalMetres: 0.5,
    surfaces: [
      { cell: [0, 3, 0], material: 1 },
      { cell: [1, 1, 0], material: 1 },
    ],
    water: [
      { at: [0, 1, 0], liquidVolumeM3: 0.1, massKg: 100 },
      { at: [1, 1, 0], liquidVolumeM3: 0.1, massKg: 100 },
    ],
  };
  const view = setTerrainLevelRange(createWorldView(), terrainLevelRange(frame), 1);
  const cut = displayedTerrain(frame, toggleWorldCutaway(view, true));
  assert.deepEqual(cut.surfaces.map(({ cell }) => cell), [[1, 1, 0]]);
  assert.deepEqual(cut.water.map(({ at }) => at), [[0, 1, 0], [1, 1, 0]]);
  assert.deepEqual(displayedTerrain(frame, view).surfaces, frame.surfaces);
});

test("cutaway water visibility follows height rather than the old exterior-column filter", () => {
  const frame = {
    revision: 5,
    structureSurfaces: [],
    surfaces: [{ cell: [0, 3, 0], material: 1 }],
    water: [
      { at: [0, 1, 0], liquidVolumeM3: 0.1, massKg: 100 },
      { at: [1, 1, 0], liquidVolumeM3: 0.1, massKg: 100 },
    ],
  };
  const view = toggleWorldCutaway(createWorldView({ range: { min: 0, max: 3 }, level: 1 }), true);
  assert.deepEqual(displayedTerrain(frame, view).water.map(({ at }) => at), [[0, 1, 0], [1, 1, 0]]);
});

test("terrain projection cache reuses surfaces while accepting newer water", () => {
  const frame = { revision: 2, structureSurfaces: [], verticalMetres: 0.5, surfaces: [{ cell: [0, 1, 0], material: 1 }], water: [] };
  const cache = createTerrainProjectionCache();
  const view = toggleWorldCutaway(setTerrainLevelRange(createWorldView(), terrainLevelRange(frame), 1), true);
  const first = cache.update(frame, view, 3);
  assert.strictEqual(cache.update(frame, view, 3), first);
  const next = cache.update({ ...frame, water: [{ at: [0, 1, 0], liquidVolumeM3: 0.1, massKg: 100 }] }, view, 3);
  assert.strictEqual(next.surfaces, first.surfaces);
  assert.notStrictEqual(next.water, first.water);
  assert.equal(next.water[0].liquidVolumeM3, 0.1);
  const changed = cache.update({ ...frame, revision: 3 }, view, 3);
  assert.notStrictEqual(changed.surfaces, first.surfaces);
  assert.equal(cache.update(undefined, view, 4), undefined);
});

test("terrain projection cache accepts arriving water in an open column", () => {
  const frame = { revision: 2, structureSurfaces: [], verticalMetres: 0.5, surfaces: [], water: [] };
  const cache = createTerrainProjectionCache();
  const view = toggleWorldCutaway(createWorldView({ range: { min: 0, max: 1 }, level: 1 }), true);
  const first = cache.update(frame, view, 3);
  const next = cache.update({ ...frame, water: [{ at: [2, 1, 0], liquidVolumeM3: 0.1, massKg: 100 }] }, view, 3);
  assert.strictEqual(next.surfaces, first.surfaces);
  assert.deepEqual(next.water.map(({ at }) => at), [[2, 1, 0]]);
});


test("cutaway retains lower authored floors and caches their surface identity", () => {
  const frame = { revision: 7, verticalMetres: 0.54, surfaces: [], water: [],
    structureSurfaces: [{ cell: [0, 4, 0] }, { cell: [0, 8, 0] }, { cell: [0, 12, 0] }] };
  assert.deepEqual(terrainLevelRange(frame), { min: 4, max: 12 });
  const view = createWorldView({ range: terrainLevelRange(frame), level: 8, cutaway: true });
  const cache = createTerrainProjectionCache();
  const cut = cache.update(frame, view, 1);
  assert.deepEqual(cut.structureSurfaces.map(face => face.cell[1]), [4, 8]);
  assert.strictEqual(cache.update({ ...frame, water: [] }, view, 1).structureSurfaces, cut.structureSurfaces);
});


test("construction cutaway hides upper art without changing lower storeys", () => {
  const view = createWorldView({range:{min:13,max:21},level:17,cutaway:true});
  assert.equal(projectWorldFact({view:{pickable:false,cutawayTop:17}},view).visible,true);
  assert.equal(projectWorldFact({view:{pickable:false,cutawayTop:21}},view).visible,false);
  assert.equal(projectWorldFact({view:{pickable:false,cutawayTop:21}},toggleWorldCutaway(view,false)).visible,true);
});

test("a lowered cut hides ordinary physical objects above it", () => {
  const view = createWorldView({ range: { min: 0, max: 20 }, level: 16, cutaway: true });
  const at = level => ({ pose: { position: { x: 0, y: (level + .5) * .54, z: 0 } },
    view: { pickable: true } });
  assert.deepEqual(projectWorldFact(at(18), view, .54), { visible: false, pickable: false });
  assert.deepEqual(projectWorldFact(at(16), view, .54), { visible: true, pickable: true });
  assert.equal(projectWorldFact(at(18), toggleWorldCutaway(view, false), .54).visible, true);
  const authored = { ...at(14), view: { pickable: true, cutawayTop: 18 } };
  assert.equal(projectWorldFact(authored, view, .54).visible, false,
    "a tall authored object uses its declared upper extent");
});


test("cutaway refreshes mown cover and authored surfaces without a voxel revision", () => {
  const cache = createTerrainProjectionCache();
  const view = createWorldView({ range: { min: 0, max: 14 }, level: 13, cutaway: true });
  const grass = { cell: [0, 13, 0], cover: { kind: "grass", height: "full" } };
  const frame = { revision: 7, surfaces: [grass, { cell: [0, 14, 0] }],
    structureSurfaces: [{ cell: [1, 13, 0] }], water: [] };
  const first = cache.update(frame, view, 1);
  const mown = { ...frame, surfaces: [{ ...grass, cover: { ...grass.cover, height: "short" } }, frame.surfaces[1]] };
  const next = cache.update(mown, view, 1);
  assert.equal(next.surfaces.length, 1, "updated cover still obeys the cut plane");
  assert.equal(next.surfaces[0].cover.height, "short");
  assert.strictEqual(next.structureSurfaces, first.structureSurfaces);
  assert.equal(first.surfaces[0].cover.height, "full", "previous frames remain immutable");
  const built = { ...mown, structureSurfaces: [...mown.structureSurfaces, { cell: [2, 13, 0] }, { cell: [2, 14, 0] }] };
  const latest = cache.update(built, view, 1);
  assert.strictEqual(latest.surfaces, next.surfaces);
  assert.deepEqual(latest.structureSurfaces.map(({ cell }) => cell), [[1, 13, 0], [2, 13, 0]]);
  assert.strictEqual(cache.update(built, view, 1), latest);
});
