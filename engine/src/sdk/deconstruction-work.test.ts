import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "./authoring";
import {
  DeconstructionOrder,
  deconstructionWorkProvider,
  queueDeconstruction,
} from "./deconstruction-work";
import { ConstructionSite } from "./construction";
import { Body, Container, Traversal } from "./common";
import { OwnedByParty, PartyMember } from "./party";
import type {
  EntityId,
  QuerySpec,
  WorkAttempt,
  WriteContext,
} from "../contracts";

const site = entity("site.finished");

test("deconstruction intent stores task-owned target, progress, and status facts", () => {
  const record = queueDeconstruction(site);
  const state = record.components[DeconstructionOrder.id] as Record<
    string,
    unknown
  >;
  assert.equal(state.site, site);
  assert.equal(state.seconds, 0);
  assert.equal(state.salvageQuantity, 0);
  assert.equal(state.workSeconds, 0);
  assert.equal(state.status, "queued");
  assert.equal("actor" in state, false);
  assert.equal("phase" in state, false);
});

test("an empty queue does not query routing or create worker ownership", () => {
  const context = {
    query: () => [],
    deconstructionAccess: () => {
      throw new Error("unexpected native access query");
    },
  } as unknown as WriteContext;
  const provider = deconstructionWorkProvider(context, [], new Set());
  assert.deepEqual(provider.candidates, []);
  assert.deepEqual(provider.claims, []);
});

test("native attempt routes, performs timed deconstruction, and records one terminal result", () => {
  const worker = entity("worker.deconstructor");
  const party = entity("party.deconstructor");
  const order = entity("order.deconstructor");
  const rows = [
    row(order, DeconstructionOrder, {
      site,
      contactX: 0,
      contactY: 0,
      contactZ: 0,
      seconds: 0,
      salvageQuantity: 0,
      workSeconds: 0,
      status: "queued",
      retryKey: "",
      reason: "",
    }),
    row(site, ConstructionSite, {
      catalog: "floor",
      x: 1,
      y: 0,
      z: 1,
      orientation: "north",
      seconds: 1,
      phase: "finished",
    }),
    row(site, OwnedByParty, { party }),
    row(worker, PartyMember, { party }),
    row(worker, Body, { speed: 1 }),
    row(worker, Container, { capacity: 8 }),
    row(worker, Traversal, { clearanceCells: 1, maxStepCells: 1 }),
  ];
  let current: WorkAttempt | undefined;
  const actions: unknown[] = [];
  const writes: unknown[] = [];
  const context = {
    query(spec: QuerySpec<any>) {
      return rows.filter((candidate) =>
        spec.components.every(
          (definition) => candidate.values[definition.id] !== undefined,
        ),
      );
    },
    worldPoses: () => [
      {
        id: worker,
        local: { x: 0, y: 0, z: 0, facing: 0 },
        world: { x: 0, y: 0, z: 0, facing: 0 },
        support: null,
        surface: null,
      },
    ],
    deconstructionAccess: () => [
      {
        site,
        status: "ready",
        contacts: [{ x: 1, y: 0, z: 1, frame: null, kind: "origin" }],
        salvageQuantity: 2,
        workSeconds: 3,
      },
    ],
    routeToAny: () => ({
      actor: worker,
      status: "reachable",
      targetIndex: 0,
      cost: 1,
    }),
    workAttempts: () => (current ? [current] : []),
    action: (value: unknown) => actions.push(value),
    write: (_definition: unknown, _id: unknown, value: unknown) =>
      writes.push(value),
  } as unknown as WriteContext;
  const provider = deconstructionWorkProvider(context, [worker], new Set());
  assert.equal(provider.candidates.length, 1);
  assert.equal(provider.estimate(provider.candidates[0]), 1);
  provider.apply([{ worker, task: order, cost: 1 }]);
  assert.equal((actions[0] as any).kind, "begin-work-attempt");
  const key = (actions[0] as any).task;
  current = {
    key: { task: key, generation: 1 },
    worker,
    party,
    phase: {
      kind: "outcome",
      operation: { attempt: { task: key, generation: 1 }, sequence: 1 },
      activity: {
        kind: "route",
        destination: { x: 1, y: 0, z: 1, frame: null },
      },
      result: { kind: "completed" },
    },
  };
  provider.progress();
  assert.equal((actions[1] as any).kind, "continue-work-attempt");
  current = {
    ...current,
    phase: {
      kind: "outcome",
      operation: { attempt: { task: key, generation: 1 }, sequence: 2 },
      activity: {
        kind: "deconstruction",
        site,
        contact: { x: 1, y: 0, z: 1, frame: null, kind: "origin" },
      },
      result: { kind: "completed" },
    },
  };
  provider.progress();
  assert.equal((writes[0] as any).status, "complete");
  assert.equal((actions[2] as any).kind, "acknowledge-work-attempt");
  current = {
    ...current,
    phase: {
      kind: "outcome",
      operation: { attempt: { task: key, generation: 1 }, sequence: 3 },
      activity: {
        kind: "route",
        destination: { x: 1, y: 0, z: 1, frame: null },
      },
      result: { kind: "completed" },
    },
  };
  deconstructionWorkProvider(context, [worker], new Set([worker])).progress();
  assert.equal((actions[3] as any).kind, "acknowledge-work-attempt");
});

function row(id: EntityId, definition: { id: string }, value: unknown): any {
  const values = { [definition.id]: value };
  return {
    id,
    values,
    get: (requested: { id: string }) => values[requested.id],
  };
}
