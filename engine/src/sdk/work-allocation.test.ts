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
    [{ task: haul, actor: carrier }, { task: dig, actor: null }],
    [
      { worker: carrier, task: dig, cost: 0 },
      { worker: free, task: haul, cost: 0 },
      { worker: free, task: dig, cost: 4 },
    ],
    candidate => candidate.cost,
    candidates => {
      calls++;
      assert.deepEqual(candidates, [{ worker: free, task: dig, cost: 4 }]);
      return candidates;
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(result, [{ worker: free, task: dig, cost: 4 }]);
  // Rebuilding from settled task state releases the actor without another owner.
  assert.equal(allocateWork([{ task: dig, actor: null }],
    [{ worker: carrier, task: dig, cost: 0 }], candidate => candidate.cost, rows => rows).length, 1);
});

test("conflicting task custody fails before the matcher runs", () => {
  const actor = entity("worker.one");
  const a = entity("job.a");
  const b = entity("job.b");
  const unexpected = () => { throw new Error("matcher must not run"); };
  assert.throws(() => allocateWork([{ task: a, actor }, { task: b, actor }], [], () => 0, unexpected), /competing/);
  assert.throws(() => allocateWork([{ task: a, actor: null }, { task: a, actor: null }], [], () => 0, unexpected), /duplicate/);
  assert.throws(() => allocateWork([], [{ worker: actor, task: a, cost: 1 }], () => 1, unexpected), /unknown/);
  assert.deepEqual(allocateWork([{ task: a, actor }], [{ worker: actor, task: a, cost: 1 }], () => 1, unexpected), []);
});

test("claimed and unreachable work never reaches costing or matching respectively", () => {
  const busy=entity("worker.busy"), free=entity("worker.free"), held=entity("job.held"), open=entity("job.open");
  const visited: string[]=[];
  const result=allocateWork([{task:held,actor:busy},{task:open,actor:null}],
    [{worker:busy,task:open},{worker:free,task:held},{worker:free,task:open}],
    pair=>{ visited.push(`${pair.worker}/${pair.task}`); return null; },
    ()=>{ throw new Error("no reachable candidates"); });
  assert.deepEqual(visited,[`${free}/${open}`]);
  assert.deepEqual(result,[]);
});
