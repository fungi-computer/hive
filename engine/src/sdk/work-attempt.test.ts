import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "./authoring";
import { acknowledgeWorkAttempt, beginRouteWorkAttempt, interruptWorkAttempt, workAttempt } from "./work-attempt";
import type { WorkAttempt, WriteContext } from "../contracts";

const task = entity("attempt.task");
const worker = entity("attempt.worker");
const party = entity("attempt.party");
const attempt = { task, generation: 3 } as const;
const outcome: WorkAttempt = { key: attempt, worker, party, phase: { kind: "outcome", operation: { attempt, sequence: 7 }, result: { kind: "completed" } } };

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
