import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "./authoring";
import { allocateWork } from "./work-allocation";

test("all work kinds retain saved claims before joint assignment", () => {
  const carrier = entity("worker.carrier");
  const free = entity("worker.free");
  const haul = entity("job.haul");
  const dig = entity("job.dig");
  let calls = 0;
  const result = allocateWork(
    [
      { task: haul, actor: carrier },
      { task: dig, actor: null },
    ],
    [
      { worker: carrier, task: dig, cost: 0 },
      { worker: free, task: haul, cost: 0 },
      { worker: free, task: dig, cost: 4 },
    ],
    (candidate) => candidate.cost,
    (candidate) => candidate.cost,
    (candidates) => {
      calls++;
      assert.deepEqual(candidates, [{ worker: free, task: dig, cost: 4 }]);
      return candidates;
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(result, [{ worker: free, task: dig, cost: 4 }]);
  // Rebuilding from settled task state releases the actor without another owner.
  assert.equal(
    allocateWork(
      [{ task: dig, actor: null }],
      [{ worker: carrier, task: dig, cost: 0 }],
      (candidate) => candidate.cost,
      (candidate) => candidate.cost,
      (rows) => rows,
    ).length,
    1,
  );
});

test("conflicting task custody fails before the matcher runs", () => {
  const actor = entity("worker.one");
  const a = entity("job.a");
  const b = entity("job.b");
  const unexpected = () => {
    throw new Error("matcher must not run");
  };
  assert.throws(
    () =>
      allocateWork(
        [
          { task: a, actor },
          { task: b, actor },
        ],
        [],
        () => 0,
        () => 0,
        unexpected,
      ),
    /competing/,
  );
  assert.throws(
    () =>
      allocateWork(
        [
          { task: a, actor: null },
          { task: a, actor: null },
        ],
        [],
        () => 0,
        () => 0,
        unexpected,
      ),
    /duplicate/,
  );
  assert.throws(
    () =>
      allocateWork(
        [],
        [{ worker: actor, task: a, cost: 1 }],
        () => 1,
        () => 1,
        unexpected,
      ),
    /unknown/,
  );
  assert.deepEqual(
    allocateWork(
      [{ task: a, actor }],
      [{ worker: actor, task: a, cost: 1 }],
      () => 1,
      () => 1,
      unexpected,
    ),
    [],
  );
});

test("claimed work skips costing and an unreachable proposal is removed", () => {
  const busy = entity("worker.busy"),
    free = entity("worker.free"),
    held = entity("job.held"),
    open = entity("job.open");
  const visited: string[] = [];
  let matchCalls = 0;
  const result = allocateWork(
    [
      { task: held, actor: busy },
      { task: open, actor: null },
    ],
    [
      { worker: busy, task: open },
      { worker: free, task: held },
      { worker: free, task: open },
    ],
    () => 0,
    (pair) => {
      visited.push(`${pair.worker}/${pair.task}`);
      return null;
    },
    (candidates) => {
      matchCalls++;
      return candidates;
    },
  );
  assert.deepEqual(visited, [`${free}/${open}`]);
  assert.equal(matchCalls, 1);
  assert.deepEqual(result, []);
});

test("joint assignment refines only candidates that can still win", () => {
  const worker = entity("worker.one");
  const first = entity("job.first");
  const winner = entity("job.winner");
  const distant = entity("job.distant");
  const exact = new Map([
    [first, 100],
    [winner, 2],
    [distant, 60],
  ]);
  const resolved: EntityId[] = [];
  const result = allocateWork(
    [
      { task: first, actor: null },
      { task: winner, actor: null },
      { task: distant, actor: null },
    ],
    [
      { worker, task: first, bound: 1 },
      { worker, task: winner, bound: 2 },
      { worker, task: distant, bound: 50 },
    ],
    (candidate) => candidate.bound,
    (candidate) => {
      resolved.push(candidate.task);
      return exact.get(candidate.task) ?? null;
    },
    (candidates) => [
      candidates.reduce((best, candidate) =>
        candidate.cost < best.cost ? candidate : best,
      ),
    ],
  );
  assert.deepEqual(resolved, [first, winner]);
  assert.deepEqual(result, [{ worker, task: winner, cost: 2 }]);
});

test("globally unavailable actors never reach route costing", () => {
  const worker = entity("worker.suspended");
  const task = entity("job.suspended");
  let costCalls = 0;
  const result = allocateWork(
    [{ task, actor: null }],
    [{ worker, task }],
    () => {
      costCalls++;
      throw new Error("unavailable actor was costed");
    },
    () => {
      costCalls++;
      throw new Error("unavailable actor was costed");
    },
    () => {
      throw new Error("unavailable actor was matched");
    },
    new Set([worker]),
  );
  assert.deepEqual(result, []);
  assert.equal(costCalls, 0);
});
