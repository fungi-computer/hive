import test from "node:test";
import assert from "node:assert/strict";
import { createTerrainProjectionCache, createWorldView, displayedTerrain, projectWorldFact, setTerrainLevelRange, setWorldViewLevel, terrainLevelRange, toggleWorldCutaway } from "./world-view.js";
import { eligibleSelectedIds, selectionFromSubjects, surfaceSubjectAt } from "./controls.js";

test("world view honors its supplied signed range", () => {
  const view = createWorldView({ range: { min: -2, max: 3 }, level: 0 });
  assert.equal(setWorldViewLevel(view, -1).level, -1);
  assert.equal(setWorldViewLevel(view, 4), view);
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
  assert.equal(surfaceSubjectAt(subjects, { x: 2, y: 3 }, () => true)?.id, "open");
  assert.deepEqual(eligibleSelectedIds(subjects, ["hidden", "open"]), ["open"]);
  assert.deepEqual(eligibleSelectedIds(subjects, ["hidden"]), []);
});

test("cutaway displays only published exterior columns at or below the selected level", () => {
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
  assert.deepEqual(cut.water.map(({ at }) => at), [[1, 1, 0]]);
  assert.deepEqual(displayedTerrain(frame, view).surfaces, frame.surfaces);
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
