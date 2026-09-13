import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as sdk from "./index";
import { z } from "zod";

test("public SDK loads headlessly and exposes all authored examples", () => {
  assert.equal(typeof globalThis.Worker, "undefined");
  assert.deepEqual(
    [sdk.colonyPack, sdk.survivalPack, sdk.formationsPack, sdk.piratesPack].map(pack => pack.id),
    ["colony", "survival", "formations", "pirates"],
  );
  assert.equal(typeof sdk.GameSession, "function");
  assert.equal(typeof sdk.component, "function");
  assert.equal(typeof sdk.system, "function");
  for (const pack of [sdk.colonyPack, sdk.survivalPack, sdk.formationsPack, sdk.piratesPack]) {
    for (const [name, definition] of Object.entries(pack.commands ?? {})) {
      assert.doesNotThrow(() => z.toJSONSchema(definition.input, { io: "input" }), `${pack.id}.${name}`);
    }
  }
});
