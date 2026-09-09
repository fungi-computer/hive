import type {
  PositiveInt,
  Site,
  WaterDeliveryOperation,
} from "../../src/model.ts";
import { createClearing } from "../../src/clearing.ts";
import { snapshotFor } from "../../src/clearing-state.ts";
import { excavateTerrain } from "../../src/terrain.ts";
import {
  createGroundLot,
  moveContainerPortions,
  pickupTransfer,
  selectContainerPortions,
} from "../../src/materials.ts";
import { portableContainerInterior } from "../../src/item-containers.ts";
import { sourceContainerSpec } from "../../src/finite-sources.ts";
import { finiteWorkOwner } from "../../src/water-delivery.ts";
import { advanceFiniteWork } from "../../src/engine/work/progress.ts";
import { BUILDINGS, constructionBuffer } from "../../src/construction.js";
const access = { sourceReachable: true, destinationReachableWithPayload: true };
function requireFixture(value: unknown): asserts value {
  if (!value) throw new Error("invalid-held-field-fixture");
}

export function createHeldFieldFixture() {
  const state = createClearing();
  state.terrain = excavateTerrain(state.terrain, [0, 14, 128]);
  requireFixture(
    createGroundLot(state.materials, "soil", 1, { x: 6, z: 9, level: 0 }).ok,
  );
  const station: Site = {
    id: "station",
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
    quantity: 6 as PositiveInt,
  });
  state.felled = 1;
  const pail = state.materials.lots.find((l) => l.material === "pail");
  requireFixture(pail);
  pail.location = { kind: "ground", x: 7, z: 10, level: 0 };
  const interior = portableContainerInterior(pail);
  requireFixture(interior);
  const source = sourceContainerSpec(
    state.sources.find((s) => s.kind === "spring")!,
  );
  const portion = selectContainerPortions(
    state.materials,
    source.id,
    "water",
    2,
  );
  requireFixture(
    moveContainerPortions(state.materials, {
      source,
      destination: interior,
      material: "water",
      quantity: 2,
      portions: portion.portions,
      access,
    }).ok,
  );
  const operation: WaterDeliveryOperation = {
    kind: "water-delivery",
    id: "water-operation",
    job: "water-job",
    target: { kind: "kettle", station: station.id },
    quantity: 2 as PositiveInt,
    pail: pail.id,
    supply: { kind: "container", container: source.id },
    execution: { phase: "acquire" },
  };
  state.jobs.push({
    id: operation.job,
    kind: "fill-kettle",
    target: station.id,
    scope: { party: "home", actors: null },
    reason: "Ordered",
    routine: false,
  });
  requireFixture(
    finiteWorkOwner.admit(state.operations, state.materials, operation, {
      kind: "vessel",
      request: {
        id: "use",
        operation: operation.id,
        actor: "rowan",
        vessel: pail.id,
        access,
      },
    }).ok,
  );
  requireFixture(pickupTransfer(state.materials, "use", access).ok);
  // A lawful intermediate work phase, constructed without advancing a different
  // clock. Actual optimizer routing is the separate all-consumer integration law.
  advanceFiniteWork(
    operation,
    { kind: "vessel", interruption: "park" },
    {
      acquire: () => "ready",
      draw: () => ({ status: "pending" }),
      deliver() {
        throw Error("not delivered");
      },
      consume() {
        throw Error("not consumed");
      },
    },
  );
  state.actors.rowan.mode = "water-delivery";
  state.actors.rowan.task = {
    kind: "water-delivery",
    job: operation.job,
    target: operation.id,
    duration: 1,
  };
  state.actors.rowan.assignment = {
    character: "rowan",
    task: operation.job,
    cost: 0,
  };
  snapshotFor(state);
  return { state, operation, interior, station };
}
