import test from "node:test";
import assert from "node:assert/strict";
import { COURT, replayActor, validateFixture } from "./fixture.js";

test("fixture validates and IDs are stable", () => { assert.equal(validateFixture(COURT), COURT); assert.equal(new Set([...COURT.objects, ...COURT.actors].map(item => item.id)).size, COURT.objects.length + COURT.actors.length); });
test("replay is deterministic and wraps", () => { const actor = COURT.actors[0]; assert.deepEqual(replayActor(actor, 0), replayActor(actor, actor.route.length)); });
