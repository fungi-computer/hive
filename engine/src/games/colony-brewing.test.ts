import assert from "node:assert/strict";
import test from "node:test";
import { HERBAL_ALE_V1, herbalAleProcessBinding } from "./colony-brewing";
import { entity } from "../sdk/authoring";

test("Colony binds only exact lots already delivered to the station", () => {
  const binding = herbalAleProcessBinding([
    ...["malt", "water", "mugwort", "wood", "barm", "keg"].map((kind, i) => ({ id: entity(`lot.${i}`), kind, quantity: 4, container: HERBAL_ALE_V1.station })),
  ]);
  assert.equal(binding?.version, 1);
  assert.equal(binding?.consumed.length, 4);
  assert.equal(binding?.retained.length, 2);
  assert.equal(herbalAleProcessBinding([{ id: entity("lot.malt"), kind: "malt", quantity: 2, container: HERBAL_ALE_V1.station }]), undefined);
});
