import test from "node:test";
import assert from "node:assert/strict";
import { createWorldView, projectWorldFact, setWorldViewLevel, toggleWorldCutaway } from "./world-view.js";
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
