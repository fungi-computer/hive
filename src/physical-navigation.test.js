import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadOptimizer } from "./engine/colony/loader.ts";
import { createClearing, step, advanceTicks } from "./clearing.ts";
import { admitCommand } from "./orders.ts";
import { serializeClearing, parseLiveClearing } from "./clearing-state.ts";
import { groundFooting } from "./game-space.ts";
import { visualPosition } from "./movement.ts";

const optimizer = await loadOptimizer(
  await WebAssembly.compile(
    readFileSync(new URL("./engine/colony/colony.wasm", import.meta.url)),
  ),
);
const command = (state, action) => {
  const result = admitCommand(state, { ...action, party: "home" });
  assert.equal(result.status, "applied", result.reason);
};

// Initial terrain and actors are the maintained game fixture. Commands, paid
// movement and reconstruction use the actual current owners; no time is mocked.
test("paused Go admits intent and a paid physical edge survives current reload", () => {
  const state = createClearing();
  state.paused = true;
  const target = groundFooting(state.terrain, { x: 8, z: 10 });
  command(state, { kind: "draft", actor: "rowan" });
  command(state, { kind: "go", actor: "rowan", target });
  const tick = state.tick;
  assert.equal(state.actors.rowan.traversal.elapsed, 0);
  step(state, optimizer);
  assert.equal(state.tick, tick);
  state.paused = false;
  advanceTicks(state, optimizer, 2);
  state.paused = true;
  const before = visualPosition(state.actors.rowan);
  const restored = parseLiveClearing(serializeClearing(state));
  assert.deepEqual(visualPosition(restored.actors.rowan), before);
  assert.deepEqual(
    restored.actors.rowan.traversal,
    state.actors.rowan.traversal,
  );
  assert.deepEqual(restored.materials, state.materials);
  step(restored, optimizer);
  assert.deepEqual(visualPosition(restored.actors.rowan), before);
  restored.paused = false;
  advanceTicks(restored, optimizer, 4);
  assert.deepEqual(visualPosition(restored.actors.rowan), target);
  assert.equal(restored.actors.rowan.traversal, null);
  assert.equal(restored.tick, tick + 6);
  assert.doesNotThrow(() => serializeClearing(restored));
});

test("Go retarget during a paid edge keeps its timing and reaches the next intent", () => {
  const state = createClearing();
  command(state, { kind: "draft", actor: "rowan" });
  const first = groundFooting(state.terrain, { x: 8, z: 10 });
  command(state, { kind: "go", actor: "rowan", target: first });
  advanceTicks(state, optimizer, 2);
  const admitted = structuredClone(state.actors.rowan.traversal.edge);
  const position = visualPosition(state.actors.rowan);
  const target = groundFooting(state.terrain, { x: 8, z: 11 });
  command(state, { kind: "go", actor: "rowan", target });
  assert.deepEqual(state.actors.rowan.traversal.edge, admitted);
  assert.equal(state.actors.rowan.traversal.elapsed, 2);
  assert.deepEqual(visualPosition(state.actors.rowan), position);
  advanceTicks(state, optimizer, 10);
  assert.deepEqual(visualPosition(state.actors.rowan), target);
  assert.equal(state.actors.rowan.traversal, null);
  assert.doesNotThrow(() => serializeClearing(state));
});

test("undraft finishes only the paid edge before releasing movement intent", () => {
  const state = createClearing();
  command(state, { kind: "draft", actor: "rowan" });
  command(state, {
    kind: "go",
    actor: "rowan",
    target: groundFooting(state.terrain, { x: 9, z: 10 }),
  });
  advanceTicks(state, optimizer, 2);
  const endpoint = structuredClone(state.actors.rowan.traversal.edge.to);
  const before = visualPosition(state.actors.rowan);
  command(state, { kind: "undraft", actor: "rowan" });
  assert.deepEqual(visualPosition(state.actors.rowan), before);
  assert.equal(state.actors.rowan.workDisposition, "interrupt-at-footing");
  assert.equal(state.actors.rowan.traversal.remaining.length, 0);
  const restored = parseLiveClearing(serializeClearing(state));
  advanceTicks(restored, optimizer, 4);
  assert.deepEqual(visualPosition(restored.actors.rowan), endpoint);
  assert.equal(restored.actors.rowan.traversal, null);
  assert.equal(restored.actors.rowan.workDisposition, "continue");
  assert.doesNotThrow(() => serializeClearing(restored));
});

// Authored completed station and a filled pail are valid initial content facts.
// Water is moved from the real finite source through the current material owner.
test("canceling a carried pail waits for its paid edge then drops the same contents once", async () => {
  const { moveContainerPortions } = await import("./materials.ts");
  const { portableContainerInterior } = await import("./item-containers.ts");
  const { sourceContainerSpec } = await import("./finite-sources.ts");
  const { BUILDINGS, constructionBuffer } = await import("./construction.js");
  const state = createClearing();
  const pail = state.materials.lots.find((lot) => lot.material === "pail");
  pail.location = {
    kind: "ground",
    ...groundFooting(state.terrain, { x: 7, z: 10 }),
  };
  const source = sourceContainerSpec(
    state.sources.find((source) => source.kind === "spring"),
  );
  const water = state.materials.lots.find((lot) => lot.material === "water");
  const filled = moveContainerPortions(state.materials, {
    source,
    destination: portableContainerInterior(pail),
    material: "water",
    quantity: 2,
    portions: [{ lot: water.id, quantity: 2 }],
    access: { sourceReachable: true, destinationReachableWithPayload: true },
  });
  assert(filled.ok);
  const station = {
    id: "navigation-kettle",
    type: "brew-station",
    x: 7,
    z: 5,
    level: 0,
    direction: 0,
    work: BUILDINGS["brew-station"].ticks,
    finishedAt: 0,
  };
  state.sites.push(station);
  state.materials.embedded.push({
    container: constructionBuffer(station).id,
    material: "wood",
    quantity: 6,
  });
  state.felled = 1;
  assert.doesNotThrow(() => serializeClearing(state));
  command(state, {
    kind: "fill-kettle",
    station: station.id,
    actors: ["rowan"],
  });
  const carrying = () =>
    state.materials.lots.find((lot) => lot.id === pail.id)?.location.kind ===
      "hand" && state.actors.rowan.traversal?.elapsed > 0;
  for (let tick = 0; tick < 30 && !carrying(); tick++) step(state, optimizer);
  assert(carrying(), "real acquire starts the delivery's paid edge");
  const actor = state.actors.rowan;
  const job = actor.task.job,
    endpoint = structuredClone(actor.traversal.edge.to);
  const remaining = actor.traversal.edge.duration - actor.traversal.elapsed;
  const portions = structuredClone(
    state.materials.lots.filter(
      (lot) =>
        lot.location.kind === "container" &&
        lot.location.container === `vessel:${pail.id}`,
    ),
  );
  assert.equal(
    portions.reduce((sum, lot) => sum + lot.quantity, 0),
    2,
  );
  const before = visualPosition(actor);
  command(state, { kind: "cancel", job, actors: null });
  assert.deepEqual(visualPosition(state.actors.rowan), before);
  assert.equal(
    state.jobs.find((entry) => entry.id === job).lifecycle,
    "canceling",
  );
  const restored = parseLiveClearing(serializeClearing(state));
  advanceTicks(restored, optimizer, remaining);
  assert(!restored.jobs.some((entry) => entry.id === job));
  assert(!restored.operations.some((entry) => entry.job === job));
  assert.deepEqual(
    restored.materials.lots.find((lot) => lot.id === pail.id).location,
    { kind: "ground", ...endpoint },
  );
  assert.deepEqual(
    restored.materials.lots.filter((lot) =>
      portions.some((portion) => portion.id === lot.id),
    ),
    portions,
  );
  assert.equal(restored.materials.sinks.length, 0);
  assert.doesNotThrow(() => serializeClearing(restored));
});

test("the actual exposed generated edge uses one-voxel up/down timing", async () => {
  const { movement } = await import("./movement.ts");
  const state = createClearing(),
    routes = movement(state).forBody(state.actors.rowan);
  let pair = null;
  for (let z = 0; z < 15 && !pair; z++)
    for (let x = 0; x < 14 && !pair; x++) {
      const a = groundFooting(state.terrain, { x, z }),
        b = groundFooting(state.terrain, { x: x + 1, z });
      if (
        Math.abs(a.y - b.y) !== 1 ||
        !routes.standing(a) ||
        !routes.standing(b)
      )
        continue;
      pair = a.y < b.y ? [a, b] : [b, a];
    }
  assert(
    pair,
    "the declared generated clearing contains a dry exposed one-voxel ledge",
  );
  const up = routes.route(pair[0], pair[1]),
    down = routes.route(pair[1], pair[0]);
  assert.equal(up.edges.length, 1);
  assert.equal(up.ticks, 12);
  assert.equal(down.edges.length, 1);
  assert.equal(down.ticks, 9);
});

test("the current game admits multiple stairs and routes through each real link", async () => {
  const { BUILDINGS, constructionBuffer, removalProblem } =
    await import("./construction.js");
  const { stairLanding } = await import("./world.js");
  const { placementFooting } = await import("./game-space.ts");
  const { movement } = await import("./movement.ts");
  const planned = createClearing();
  planned.paused = true;
  for (const x of [8, 10])
    command(planned, {
      kind: "build",
      type: "stair",
      x,
      z: 5,
      level: 0,
      direction: 0,
      actors: null,
    });
  assert.equal(planned.sites.length, 2);
  assert.doesNotThrow(() => serializeClearing(planned));

  // A separate authored completed-content fixture isolates connectivity. Its
  // six embedded wood units have the current ordinary conservation provenance.
  const state = createClearing();
  state.felled = 1;
  for (const [index, x] of [8, 10].entries()) {
    const site = {
      id: `stair-${index}`,
      type: "stair",
      x,
      z: 5,
      level: 0,
      direction: 0,
      work: BUILDINGS.stair.ticks,
      finishedAt: 0,
    };
    state.sites.push(site);
    state.materials.embedded.push({
      container: constructionBuffer(site).id,
      material: "wood",
      quantity: 3,
    });
  }
  const start = placementFooting(stairLanding(state.sites[0]));
  const target = placementFooting(stairLanding(state.sites[1]));
  Object.assign(state.actors.rowan, start);
  assert.doesNotThrow(() => serializeClearing(state));
  const found = movement(state)
    .forBody(state.actors.rowan)
    .route(start, target);
  assert(found);
  assert.equal(found.ticks, 48);
  assert.deepEqual(
    found.edges
      .filter((edge) => edge.kind === "stair")
      .map((edge) => edge.link),
    ["stair-0", "stair-1"],
  );
  assert.match(
    removalProblem(state, state.sites[0]),
    /connected upstairs access/,
  );
});
