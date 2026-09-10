import assert from "node:assert/strict";
import test from "node:test";
import { createClearing } from "./clearing.ts";
import { createNavigationSpaces } from "./navigation-space.ts";
import { fieldWaterSources } from "./field-water-source.ts";
import { clearingAirPresentation } from "./air-presentation.ts";

test("clearing query projections reuse unchanged owner inputs", () => {
  const state = createClearing();
  assert.strictEqual(createNavigationSpaces(state), createNavigationSpaces(state));
  assert.strictEqual(fieldWaterSources(state), fieldWaterSources(state));
  assert.strictEqual(clearingAirPresentation(state), clearingAirPresentation(state));
});

test("mutable site and actor arrays invalidate dependent projections", () => {
  const state = createClearing();
  const beforeNavigation = createNavigationSpaces(state);
  const beforeWater = fieldWaterSources(state);
  const beforeAir = clearingAirPresentation(state);
  state.sites.push({
    id: "query-cache-wall",
    type: "wall",
    x: 4,
    z: 4,
    level: 0,
    direction: 0,
    work: 1,
    finishedAt: null,
  });
  state.actors.rowan.x += 1;
  assert.notStrictEqual(createNavigationSpaces(state), beforeNavigation);
  assert.notStrictEqual(fieldWaterSources(state), beforeWater);
  assert.notStrictEqual(clearingAirPresentation(state), beforeAir);

  const afterSiteNavigation = createNavigationSpaces(state);
  const afterSiteWater = fieldWaterSources(state);
  state.trees[0].felledAt = 1;
  assert.notStrictEqual(createNavigationSpaces(state), afterSiteNavigation);
  assert.notStrictEqual(fieldWaterSources(state), afterSiteWater);
});

test("field source access follows a real fixed rim obstacle", () => {
  const state = createClearing();
  const source = fieldWaterSources(state)[0];
  assert(source, "clearing fixture must expose a finite water rim");
  const blockers = source.accessCells.map((rim, index) => ({
    ...state.trees[0],
    id: `query-rim-blocker-${index}`,
    x: rim.x,
    y: rim.y,
    z: rim.z,
    felledAt: null,
  }));
  state.trees.push(...blockers);
  assert.equal(
    fieldWaterSources(state).some((candidate) => candidate.nodeId === source.nodeId),
    false,
  );
  for (const blocker of blockers) blocker.felledAt = 1;
  assert(
    fieldWaterSources(state).some((candidate) => candidate.nodeId === source.nodeId),
  );
});
