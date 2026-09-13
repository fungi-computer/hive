import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createWorkSystem } from "./work-system";
import { entity } from "./authoring";

const base = {
  clock: { now: 0, delta: 0.1, tick: 1 },
  outcomes: [],
  impacts: [],
  random: { next: () => 0 },
  query: () => [],
  workMaterialFacts: () => ({ version: 1 as const, containers: [], lots: [] }),
  routeCosts: () => { throw new Error("unexpected route query"); },
  environmentFacts: () => { throw new Error("unexpected environment query in this fixture"); },
    atmosphereSamples: () => { throw new Error("unexpected atmosphere query in this fixture"); },
    physicalContacts: () => { throw new Error("unexpected physical contact query in this fixture"); }, terrainMaterials: () => [],
  terrainSurfaces: () => [],
  worldPoses: () => [],
  write: () => {},
  createAuthoredEntity: () => { throw new Error("unexpected authored creation"); },
  removeAuthoredEntity: () => { throw new Error("unexpected authored removal"); },
  action: () => {},
};

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
        claims: [{ task: heldTask, actor: heldWorker }, { task: delivery, actor: null }],
        candidates: [{ worker, task: delivery }],
        estimate: () => 11,
        apply: (assignments) => applied.push(`delivery:${assignments.length}`),
        progress: () => progressed.push("delivery"),
      }),
      () => ({
        claims: [{ task: dig, actor: null }],
        candidates: [{ worker, task: dig }],
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
