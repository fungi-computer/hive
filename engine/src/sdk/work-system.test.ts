import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createWorkSystem, shouldRetryWorkTask, WORK_RETRY_INTERVAL } from "./work-system";
import { component, entity } from "./authoring";
import { WorkParticipation } from "./work-control";
import type { EntityId } from "../contracts";

const base = {
  clock: { now: 0, delta: 0.1, tick: 1 },
  outcomes: [],
  impacts: [],
  random: { next: () => 0 },
  query: () => [],
  workMaterialFacts: () => ({ version: 1 as const, containers: [], lots: [] }),
  routeCosts: () => {
    throw new Error("unexpected route query");
  },
  routeToAny: () => {
    throw new Error("unexpected route query");
  },
  environmentFacts: () => {
    throw new Error("unexpected environment query in this fixture");
  },
  constructionReadiness: (sites: readonly EntityId[]) =>
    sites.map((site) => ({ site, status: "ready" as const })),
  constructionAccess: () => [],
  deconstructionAccess: () => [],
  atmosphereSamples: () => {
    throw new Error("unexpected atmosphere query in this fixture");
  },
  physicalContacts: () => {
    throw new Error("unexpected physical contact query in this fixture");
  },
  terrainMaterials: () => [],
  terrainSurfaces: () => [],
  worldPoses: () => [],
  write: () => {},
  createAuthoredEntity: () => {
    throw new Error("unexpected authored creation");
  },
  removeAuthoredEntity: () => {
    throw new Error("unexpected authored removal");
  },
  action: () => {},
};

test("blocked work gets one deterministic retry slot per interval", () => {
  const tasks = Array.from({ length: 32 }, (_, index) => entity(`retry-task-${index}`));
  const first = tasks.map(task => Array.from({ length: WORK_RETRY_INTERVAL }, (_, tick) => shouldRetryWorkTask(task, tick)));
  const second = tasks.map(task => Array.from({ length: WORK_RETRY_INTERVAL }, (_, tick) => shouldRetryWorkTask(task, tick)));
  assert.deepEqual(second, first, "the slot is stable across repeated planning");
  for (const slots of first) assert.equal(slots.filter(Boolean).length, 1, "every task retries once per interval");
  assert.ok(new Set(first.map(slots => slots.findIndex(Boolean))).size > 1, "task ids are distributed across slots");
  for (const task of tasks) for (let tick = 0; tick < WORK_RETRY_INTERVAL * 3; tick++) {
    assert.equal(shouldRetryWorkTask(task, tick), shouldRetryWorkTask(task, tick + WORK_RETRY_INTERVAL));
  }
});

test("shared work system calls one matcher and preserves claims across providers", () => {
  const worker = entity("worker.shared");
  const heldWorker = entity("worker.held");
  const heldTask = entity("delivery.held");
  const delivery = entity("delivery.shared");
  const dig = entity("dig.shared");
  const calls: unknown[][] = [];
  const applied: string[] = [];
  const progressed: string[] = [];
  const system = createWorkSystem({
    id: "test.shared-work",
    version: 1,
    reads: [],
    writes: [],
    providers: [
      () => ({
        claims: [
          { task: heldTask, actor: heldWorker },
          { task: delivery, actor: null },
        ],
        candidates: [{ worker, task: delivery }],
        lowerBound: () => 11,
        estimate: () => 11,
        apply: (assignments) => applied.push(`delivery:${assignments.length}`),
        progress: () => progressed.push("delivery"),
      }),
      () => ({
        claims: [{ task: dig, actor: null }],
        candidates: [{ worker, task: dig }],
        lowerBound: () => 13,
        estimate: () => 13,
        apply: (assignments) => applied.push(`dig:${assignments.length}`),
        progress: () => progressed.push("dig"),
      }),
    ],
  });
  system.run({
    ...base,
    assign: (candidates) => {
      calls.push([...candidates]);
      return candidates.slice(-1);
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 2);
  assert.deepEqual(applied, ["delivery:0", "dig:1"]);
  assert.deepEqual(progressed, ["delivery", "dig"]);
});

test("authored providers cannot reassign an actor held by a canonical work attempt", () => {
  const worker = entity("worker.native-held");
  const task = entity("task.authored");
  let matcherCalls = 0;
  const system = createWorkSystem({
    id: "test.canonical-work-custody",
    version: 1,
    reads: [],
    writes: [],
    providers: [() => ({
      claims: [{ task, actor: null }],
      candidates: [{ worker, task }],
      lowerBound: () => 1,
      estimate: () => 1,
      apply: (assignments) => assert.equal(assignments.length, 0),
      progress: () => {},
    })],
  });
  system.run({
    ...base,
    query: (spec) => spec.components[0]?.id === WorkParticipation.id
      ? [{ id: worker, get: (() => ({ automatic: true })) as never }]
      : [],
    workAttemptForWorker: (actor) => actor === worker ? ({ key: { task: entity("task.native"), generation: 1 } } as never) : null,
    assign: () => {
      matcherCalls += 1;
      return [];
    },
  } as never);
  assert.equal(matcherCalls, 0);
});

test("planning phases run before providers and expose their overlay writes", () => {
  const marker = entity("phase.marker");
  const Marker = component<{ value: number }>("test.marker", {
    version: 1,
    fields: { value: "number" },
  });
  let value = 0;
  const phaseSystem = createWorkSystem({
    id: "test.phase-order",
    version: 1,
    reads: [Marker],
    writes: [Marker],
    phases: [(ctx) => ctx.write(Marker, marker, { value: 7 })],
    providers: [
      (ctx) => {
        assert.equal(
          ctx.query({ components: [Marker] })[0]?.get(Marker).value,
          7,
        );
        return {
          claims: [],
          candidates: [],
          lowerBound: () => 0,
          estimate: () => null,
          apply: () => {},
          progress: () => {},
        };
      },
    ],
  });
  phaseSystem.run({
    ...base,
    assign: () => [],
    query: (spec) =>
      (spec.components[0]?.id === "test.marker"
        ? [{ id: marker, get: (() => ({ value })) as never }]
        : []) as never,
    write: (_definition, _entity, next) => {
      value = (next as { value: number }).value;
    },
  });
});
