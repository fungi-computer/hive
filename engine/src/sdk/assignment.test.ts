import { strict as assert } from "node:assert";
import { test } from "node:test";
import { assign, checkedAssignments } from "./assignment";

test("assignment caller validates bounded candidates before the kernel", () => {
  let called = false;
  const port = { assign(candidates: readonly { worker: string; task: string; cost: number }[]) { called = true; return candidates; } };
  assert.deepEqual(assign(port, [{ worker: "worker:1" as never, task: "task:1" as never, cost: 2 }]), [{ worker: "worker:1", task: "task:1", cost: 2 }]);
  assert.equal(called, true);
  assert.throws(() => checkedAssignments([{ worker: "", task: "task:1" as never, cost: 1 }]), /invalid assignment/);
  assert.throws(() => checkedAssignments([{ worker: "worker:1" as never, task: "task:1" as never, cost: Number.NaN }]), /invalid assignment/);
  assert.throws(() => checkedAssignments(Array.from({ length: 129 }, (_, index) => ({ worker: `w${index}` as never, task: `t${index}` as never, cost: 1 }))), /invalid assignment/);
});
