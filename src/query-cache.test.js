import assert from "node:assert/strict";
import test from "node:test";
import { createClearing } from "./clearing.ts";
import { createNavigationSpaces } from "./navigation-space.ts";
import { fieldWaterSources } from "./field-water-source.ts";
import { clearingAirPresentation } from "./air-presentation.ts";
import { createHeldFieldFixture } from "../tools/engine-do/goblin-field-fixture.ts";
import { selectContainerPortions } from "./materials.ts";
import { returnFieldWater } from "./field-water.ts";
import { FIELD_WATER } from "./field-water-source.ts";

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

test("field source facts invalidate on an admitted water stock change", () => {
  const fixture = createHeldFieldFixture();
  const reference = {
    binding: FIELD_WATER.id,
    nodeId: "reservoir:column-p0-p128",
  };
  const before = fieldWaterSources(fixture.state);
  const returned = returnFieldWater(fixture.state, {
    ...reference,
    operation: fixture.operation.id,
    quantity: 2,
    portions: selectContainerPortions(
      fixture.state.materials,
      fixture.interior.id,
      "water",
      2,
    ).portions,
  });
  assert.equal(returned.ok, true);
  const after = fieldWaterSources(fixture.state);
  assert.notStrictEqual(after, before);
  assert(after.some((source) => source.nodeId === reference.nodeId));
});
