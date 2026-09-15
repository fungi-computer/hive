import assert from "node:assert/strict";
import test from "node:test";
import { createPerformancePersistence } from "./performance-persistence.js";

test("local performance new world resets the authoritative runtime", () => {
  const commands = [];
  let replaced;
  const persistence = createPerformancePersistence({ send: command => commands.push(command) });

  persistence.newWorld(remote => { replaced = remote; });

  assert.deepEqual(commands, [{ type: "reset" }]);
  assert.equal(replaced, false);
});
