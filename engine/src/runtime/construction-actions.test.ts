import assert from "node:assert/strict";
import test from "node:test";
import { checkedAction } from "./actions";
import { entity } from "../sdk/authoring";
import { encodeDefinition } from "../sdk/common";
import { planConstruction, attendConstruction, setStructureOpen, ConstructionSite, SealedContainer } from "../sdk/construction";
import { isReservedComponent } from "../contracts";

test("construction authoring cannot choose earned effort, cost or embedded custody", () => {
  const site = entity("site.floor.1");
  const request = planConstruction(site, "timber-floor", { x: -4, y: -12, z: 8 }, "west", { x: -3, y: -6.21, z: 8 });
  assert.deepEqual(checkedAction(request), request);
  assert.deepEqual(checkedAction(attendConstruction(entity("worker"), site)), {
    kind: "attend-construction", worker: "worker", site,
  });
  for (const invalid of [
    { ...request, seconds: 100 }, { ...request, materials: [] },
    { ...request, phase: "finished" }, { ...request, x: 0.5 },
    { ...request, x: Number.MAX_SAFE_INTEGER + 1 }, { ...request, y: 2147483648 },
    { ...request, orientation: "diagonal" }, { ...request, contact: { x: 0, y: 0, z: 0, frame: "ship" } },
    { ...request, contact: { x: 0, y: NaN, z: 0, frame: null } },
  ]) assert.throws(() => checkedAction(invalid), /invalid action/);
});

test("construction state and sealing use reserved native components", () => {
  assert.ok(isReservedComponent(ConstructionSite.id));
  assert.ok(isReservedComponent(SealedContainer.id));
  const encoded = JSON.parse(new TextDecoder().decode(encodeDefinition("construction", [ConstructionSite, SealedContainer])));
  assert.deepEqual(encoded.components, []);
});

test("aperture intent selects a state without bypassing physical admission", () => {
  const action = setStructureOpen(entity("worker"), entity("door"), true);
  assert.deepEqual(checkedAction(action), action);
  assert.deepEqual(checkedAction({ ...action, open: false }), { ...action, open: false });
  for (const invalid of [
    { ...action, open: "true" }, { ...action, worker: null },
    { ...action, site: "" }, { ...action, force: true },
    { ...action, openingHeight: 12 },
  ]) assert.throws(() => checkedAction(invalid), /invalid action/);
});
