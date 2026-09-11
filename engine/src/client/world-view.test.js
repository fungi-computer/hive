import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorldView,
  projectWorldFact,
  setWorldViewLevel,
  toggleWorldCutaway,
} from "./world-view.js";
import { selectionFromSubjects, surfaceSubjectAt } from "./controls.js";

test("world view clamps only through its declared signed range", () => {
  const view = createWorldView({ range: { min: -2, max: 3 }, level: 0 });
  assert.equal(setWorldViewLevel(view, -1).level, -1);
  assert.equal(setWorldViewLevel(view, 4), view);
});

test("cover remains hidden and unpickable without presented surface metadata", () => {
  const view = createWorldView({ range: { min: 0, max: 0 }, presentedSurfaces: [] });
  assert.deepEqual(projectWorldFact({ view: { covered: true, surfaceId: "roof" } }, view), { visible: false, pickable: false });
  assert.deepEqual(projectWorldFact({ view: { covered: true, surfaceId: "roof" } }, toggleWorldCutaway(view, true)), { visible: false, pickable: false });
});

test("cutaway reveals only a covered fact in presented surface metadata", () => {
  const view = createWorldView({ range: { min: 0, max: 1 }, level: 1, presentedSurfaces: ["roof"] });
  const fact = { view: { level: 1, covered: true, surfaceId: "roof" } };
  assert.deepEqual(projectWorldFact(fact, view), { visible: false, pickable: false });
  assert.deepEqual(projectWorldFact(fact, toggleWorldCutaway(view, true)), { visible: true, pickable: true });
  assert.equal(projectWorldFact({ view: { level: 0 } }, view).visible, false);
});

test("visible but unpickable projected facts never enter selection", () => {
  const subjects = [
    { id: "covered", screen: { x: 10, y: 10 }, pickable: false },
    { id: "open", screen: { x: 10, y: 10 }, pickable: true },
  ];
  assert.deepEqual(selectionFromSubjects(subjects, { left: 10, right: 10, top: 10, bottom: 10 }), ["open"]);
});

test("surface fallback also excludes a visible unpickable deck", () => {
  const subjects = [
    { id: "hidden-deck", surface: {}, pickable: false },
    { id: "open-deck", surface: {}, pickable: true },
  ];
  assert.equal(surfaceSubjectAt(subjects, { x: 2, y: 3 }, (x, y) => x === 2 && y === 3)?.id, "open-deck");
});
