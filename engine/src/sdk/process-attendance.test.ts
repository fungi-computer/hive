import { strict as assert } from "node:assert";
import { test } from "node:test";
import { processAttendanceProvider } from "./process-attendance";
import { entity } from "./authoring";

test("process attendance provider emits a party-scoped route attempt and no duplicate claim record", () => {
  const actions: unknown[] = [];
  const process = { version: 1, definition: "ale", definitionVersion: 1, station: entity("station"), worker: null, stageIndex: 0, progressSeconds: 0, enteredTick: 0, phase: "waiting" as const, blockedReason: "" };
  const ctx = {
    clock: { now: 0, delta: 1, tick: 0 }, outcomes: [], impacts: [], random: { next: () => 0 },
    query: (spec: any[]) => spec.some((component: any) => component.id === "hive.staged-process") ? [{ id: "process", get: () => process }] : spec.some((component: any) => component.id === "hive.position") ? [{ id: "worker", get: () => ({ x: 0, y: 0, z: 0, facing: 0 }) }, { id: "station", get: () => ({ x: 0, y: 0, z: 0, facing: 0 }) }] : spec.some((component: any) => component.id === "hive.owned-by-party") ? [{ id: "process", get: () => ({ party: "party" }) }, { id: "station", get: () => ({ party: "party" }) }] : spec.some((component: any) => component.id === "hive.party-member") ? [{ id: "worker", get: () => ({ party: "party" }) }] : spec.some((component: any) => component.id === "hive.body") || spec.some((component: any) => component.id === "hive.container") || spec.some((component: any) => component.id === "hive.traversal") ? [{ id: "worker", get: () => ({ speed: 1, capacity: 4, clearanceCells: 1, maxStepCells: 1 }) }] : [],
    processRequirements: () => ({ definition: "ale", version: 1, stationCatalog: "brew-station", phase: "waiting", inputs: [], stages: [{ id: "attend", mode: "attended", durationSeconds: 1 }] }),
    routeCosts: () => [{ actor: "worker", status: "reachable" as const, cost: 0 }],
    workAttempts: () => [], action: (value: unknown) => actions.push(value),
  } as any;
  const provider = processAttendanceProvider(ctx, [entity("worker")], new Set());
  assert.equal(provider.candidates.length, 1);
  provider.apply([{ worker: entity("worker"), task: entity("process"), cost: 0 }]);
  assert.deepEqual(actions, [{ kind: "begin-work-attempt", task: entity("process"), worker: entity("worker"), party: entity("party"), operation: { kind: "route", destination: { x: 0, y: 0, z: 0, frame: null } } }]);
});
