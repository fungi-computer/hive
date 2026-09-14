import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "./authoring";
import { acknowledgeWorkAttempt, beginRouteWorkAttempt, interruptWorkAttempt, retargetRouteWorkAttempt, workAttempt, workAttemptsFor } from "./work-attempt";
import { checkedAction } from "../runtime/actions";
import type { WorkAttempt, WriteContext } from "../contracts";

const task = entity("attempt.task");
const worker = entity("attempt.worker");
const party = entity("attempt.party");
const attempt = { task, generation: 3 } as const;
const outcome: WorkAttempt = { key: attempt, worker, party, phase: { kind: "outcome", operation: { attempt, sequence: 7 }, activity: { kind: "route", destination: { x: 1, y: 0, z: 0, frame: null } }, result: { kind: "completed" } } };

function fake(rows: readonly WorkAttempt[] = []): Pick<WriteContext, "action" | "workAttempts"> & { actions: unknown[] } {
  const actions: unknown[] = [];
  return { actions, action: value => actions.push(value), workAttempts: () => rows };
}

test("attempt helpers preserve exact identity and sequence", () => {
  const context = fake();
  beginRouteWorkAttempt(context, task, worker, party, { x: 1, y: 0, z: 0, frame: null });
  interruptWorkAttempt(context, attempt, 2, "accessLost");
  assert.deepEqual(context.actions, [
    { kind: "begin-work-attempt", task, worker, party, operation: { kind: "route", destination: { x: 1, y: 0, z: 0, frame: null } } },
    { kind: "interrupt-work-attempt", task, generation: 3, sequence: 2, cause: "accessLost" },
  ]);
});

test("acknowledgement requires the exact terminal projection", () => {
  const context = fake([outcome]);
  assert.equal(workAttempt(context, task), outcome);
  acknowledgeWorkAttempt(context, attempt, 7);
  assert.deepEqual(context.actions, [{ kind: "acknowledge-work-attempt", task, generation: 3, sequence: 7 }]);
  assert.throws(() => acknowledgeWorkAttempt(fake([outcome]), attempt, 6), /stale/);
  assert.throws(() => interruptWorkAttempt(fake(), attempt, 0, "cancelled"), /positive integer/);
  assert.throws(() => beginRouteWorkAttempt(fake(), task, worker, party, { x: Number.NaN, y: 0, z: 0, frame: null }), /Invalid|finite/);
});

test("retarget emits one native exact-key operation", () => {
  const context = fake();
  retargetRouteWorkAttempt(context, attempt, 4, { x: 2, y: 0, z: 1, frame: null });
  assert.deepEqual(context.actions, [{ kind: "retarget-work-attempt", task, generation: 3, sequence: 4, destination: { x: 2, y: 0, z: 1, frame: null } }]);
});

test("attempt batches skip empty native queries and preserve the native bound", () => {
  const calls: string[][] = [];
  const context = { workAttempts: (tasks: readonly typeof task[]) => {
    calls.push([...tasks]);
    return [];
  } };
  assert.deepEqual(workAttemptsFor(context, []), []);
  assert.equal(calls.length, 0);
  const tasks = Array.from({ length: 129 }, (_, index) => entity(`attempt.task.${index}`));
  assert.deepEqual(workAttemptsFor(context, tasks), []);
  assert.deepEqual(calls.map(batch => batch.length), [128, 1]);
});

test("the action boundary accepts every closed work activity and rejects additions", () => {
  const contact = { x: 1, y: 0, z: 2, frame: null };
  const activities = [
    { kind: "route" as const, destination: { x: 1, y: 0, z: 2, frame: null } },
    { kind: "construction" as const, site: task, contact, mode: "work" as const },
    { kind: "excavation" as const, cell: [1, 0, 2] as const, expectedMaterial: 2, replacementMaterial: 0 },
    { kind: "deconstruction" as const, site: task, contact },
    { kind: "process-attendance" as const, process: task },
    { kind: "material-transfer" as const, lot: task, from: worker, to: party, quantity: 1 },
    { kind: "material-drop" as const, lot: task },
    { kind: "resource-establish" as const, site: task, definition: "mugwort", cell: [1, 0, 2] as const },
    { kind: "resource-tend" as const, site: task, vessel: worker },
    { kind: "resource-extract" as const, source: task },
    { kind: "field-water" as const, vessel: worker, cell: [1, 0, 2] as const, direction: "withdraw" as const, portions: 1 },
  ];
  for (const nextActivity of activities) {
    const action = { kind: "continue-work-attempt" as const, task, generation: 3, sequence: 7, nextActivity };
    assert.deepEqual(checkedAction(action), action);
  }
  assert.throws(() => checkedAction({ kind: "continue-work-attempt", task, generation: 3, sequence: 7, nextActivity: { ...activities[2], extra: true } }), /invalid action/);
});
