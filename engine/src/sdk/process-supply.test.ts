import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DeliveryTask } from "./delivery";
import { StagedProcess, admitProcess, processSupplyPhase } from "./process-supply";
import { Container, MaterialLot } from "./common";
import type { EntityId, ProcessRequirements } from "../contracts";

const row = (id: EntityId, values: Record<string, unknown>) => ({ id, get: (definition: { id: string }) => values[definition.id] });
const requirements: ProcessRequirements = { definition: "ale", version: 1, stationCatalog: "brew-station", phase: "waiting", inputs: [{ role: "grain", port: "kettle", material: "grain", quantity: 2, policy: "portion", disposition: "consume" }], stages: [{ id: "work", mode: "attended", durationSeconds: 1 }] };
function fixture(processes: readonly [EntityId, EntityId], lotQuantity = 2) {
  const created: unknown[] = [], actions: unknown[] = [];
  const processRows = processes.map(id => row(id, { [StagedProcess.id]: { version: 2, definition: "ale", definitionVersion: 1, station: `${id}.station`, worker: null, stageIndex: 0, progressSeconds: 0, enteredTick: 0, phase: "waiting", blockedReason: "" } }));
  const containers = [{ id: "source.pail", capacity: 8, sealed: false }, ...processes.map(id => ({ id: `${id}.station:kettle`, capacity: 8, sealed: false }))];
  const facts = { version: 1 as const, containers, lots: [{ id: "lot.grain", container: "source.pail", kind: "grain", quantity: lotQuantity }] };
  const ctx = { outcomes: [], workMaterialFacts: () => facts, processRequirements: () => requirements, query: (spec: { components: readonly { id: string }[] }) => spec.components[0]?.id === StagedProcess.id ? processRows : [], createAuthoredEntity: (record: unknown) => created.push(record), removeAuthoredEntity: () => {}, action: (action: unknown) => actions.push(action) } as any;
  processSupplyPhase(ctx, []);
  return { created, actions };
}

test("competing processes share one source lot without duplicate promises", () => {
  const result = fixture(["process.a", "process.b"]);
  assert.equal(result.created.length, 1);
  assert.equal(result.actions.length, 0);
});

test("ready committed input emits one native admission and helper is exact", () => {
  const ctx = fixture(["process.a"], 2);
  assert.equal(ctx.created.length, 1);
  const action = admitProcess("process.a", "ale", "process.a.station");
  assert.deepEqual(action, { kind: "admit-process", process: "process.a", definition: "ale", station: "process.a.station" });
});
