import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as sdk from "./index";

test("public SDK loads headlessly and exposes all authored examples", () => {
  assert.equal(typeof globalThis.Worker, "undefined");
  assert.deepEqual(
    [sdk.colonyPack, sdk.survivalPack, sdk.formationsPack, sdk.piratesPack].map(pack => pack.id),
    ["colony", "survival", "formations", "pirates"],
  );
  assert.equal(typeof sdk.GameSession, "function");
  assert.equal(typeof sdk.component, "function");
  assert.equal(typeof sdk.system, "function");
});
