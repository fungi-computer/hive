import assert from "node:assert/strict";
import test from "node:test";
import { deliveryCustody } from "./delivery";
import { continueDeliveryTransferAttempt } from "./work-attempt";

test("delivery custody is a closed durable obligation", () => {
  assert.deepEqual(deliveryCustody({ kind: "source" }), { kind: "source" });
  assert.deepEqual(deliveryCustody({ kind: "held", lot: "lot.1" }), { kind: "held", lot: "lot.1" });
  assert.deepEqual(deliveryCustody({ kind: "dropped", lot: "lot.1", groundContainer: "ground.1" }), { kind: "dropped", lot: "lot.1", groundContainer: "ground.1" });
  assert.throws(() => deliveryCustody({ kind: "held" }), /invalid/);
  assert.throws(() => deliveryCustody({ kind: "retry" }), /invalid/);
});

test("delivery continuation emits one exact native transfer operation", () => {
  const actions: unknown[] = [];
  const context = {
    action: (value: unknown) => actions.push(value),
    workAttempts: () => [{ key: { task: "delivery.1", generation: 4 }, worker: "worker.1", party: "party.1", phase: { kind: "outcome", operation: { attempt: { task: "delivery.1", generation: 4 }, sequence: 1 }, activity: { kind: "route", destination: { x: 1, y: 0, z: 0, frame: null } }, result: { kind: "completed" } } }],
  } as any;
  continueDeliveryTransferAttempt(context, { task: "delivery.1", generation: 4 }, 1, "lot.1", "worker.1", "station.1", 2);
  assert.deepEqual(actions, [{ kind: "continue-work-attempt", task: "delivery.1", generation: 4, sequence: 1, nextActivity: { kind: "delivery-transfer", lot: "lot.1", from: "worker.1", to: "station.1", quantity: 2 } }]);
});
