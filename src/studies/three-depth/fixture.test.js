import test from "node:test";
import assert from "node:assert/strict";
import { COURT, DENSE, replayActor, validateFixture } from "./fixture.js";

test("fixture validates and IDs are stable", () => { assert.equal(validateFixture(COURT), COURT); assert.equal(new Set([...COURT.objects, ...COURT.actors].map(item => item.id)).size, COURT.objects.length + COURT.actors.length); });
test("replay is deterministic and wraps", () => { const actor = COURT.actors[0]; assert.deepEqual(replayActor(actor, 0), replayActor(actor, actor.route.length)); });
test("the dense court has intentional stone and continuous raised-bank support", () => {
  assert(DENSE.cells.filter(item => item.kind === "stone").every(item => item.x > 4 && item.z < -3));
  for (const scene of [COURT, DENSE]) {
    const cells = scene.cells.filter(item => item.x === 4 && item.z === 4);
    assert.deepEqual(cells.map(item => item.y).sort(), [0, 1]);
  }
});
