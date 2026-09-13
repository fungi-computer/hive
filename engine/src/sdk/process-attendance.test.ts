import { strict as assert } from "node:assert";
import { test } from "node:test";
import { component, query } from "./authoring";
import { Body, Container, Position, Traversal } from "./common";
import { StagedProcess } from "./process-supply";
import { ProcessAttendanceWork, processAttendanceProvider } from "./process-attendance";
import type { EntityId, ProcessRequirements, QueryRow, QuerySpec, WriteContext } from "../contracts";

const Worker = component<{ guest: boolean }>("test.worker", { version: 1, fields: { guest: "boolean" } });
const req = (mode: "attended" | "elapsed"): ProcessRequirements => ({
  definition: "ale", version: 1, stationCatalog: "brew-station", phase: "waiting",
  inputs: [{ role: "grain", port: "kettle", material: "grain", quantity: 2, policy: "portion", disposition: "consume" }],
  stages: [{ id: "stage", mode, durationSeconds: 2 }],
});
function context(process: object, requirements: ProcessRequirements, lots: readonly object[]) {
  const actions: unknown[] = [];
  const attendance: { id: EntityId; value: unknown }[] = [];
  const values = new Map<string, unknown>([
    [StagedProcess.id, process], [Worker.id, { guest: false }],
    [Position.id, { x: 0, y: 0, z: 0, facing: 0 }], [Body.id, { speed: 1 }],
    [Container.id, { capacity: 4 }], [Traversal.id, { clearanceCells: 1, maxStepCells: 1 }],
  ]);
  const row = (id: EntityId): QueryRow<object> => ({ id, get: <T extends object>(definition: { id: string }) => values.get(definition.id) as T });
  const ctx: WriteContext = {
    clock: { now: 0, delta: 1, tick: 0 }, outcomes: [], random: { next: () => 0 }, impacts: [],
    query<T extends object>(spec: QuerySpec<T>) { if (spec.components.some(c => c.id === ProcessAttendanceWork.id)) return attendance.map(item => ({ id: item.id, get: <V extends object>() => item.value as V })) as readonly QueryRow<T>[]; return spec.components.some(c => c.id === StagedProcess.id) ? [row("process")] as readonly QueryRow<T>[] : spec.components.some(c => c.id === Worker.id) ? [row("worker")] as readonly QueryRow<T>[] : spec.components.every(c => values.has(c.id)) ? [row("worker"), row("station")] as readonly QueryRow<T>[] : []; },
    workMaterialFacts: () => ({ version: 1, containers: [{ id: "station:kettle", capacity: 8, sealed: false }], lots: lots as never }),
    processRequirements: () => requirements, worldPoses: () => [], routeCosts: requests => requests.map(request => ({ actor: request.actor, status: "reachable" as const, cost: 0 })), routeToAny: () => ({ actor: "worker", status: "unavailable" as const, reason: "test" }), physicalContacts: () => [], environmentFacts: () => null, atmosphereSamples: () => ({ revision: 0, geometryRevision: 0, samples: [] }), constructionReadiness: () => [], constructionAccess: sites => sites.map(site => ({ site, support: "ready" as const, materialsReady: true, contacts: [{ x: 0, y: 0, z: 0, frame: null, kind: "origin" as const }] })), deconstructionAccess: () => [], terrainMaterials: () => [], terrainSurfaces: () => [], waterContacts: () => [], assign: candidates => candidates.map(({ worker, task, cost }) => ({ worker, task, cost })), write: () => {}, action: action => actions.push(action), createAuthoredEntity: record => attendance.push({ id: record.id, value: record.components[ProcessAttendanceWork.id] }), removeAuthoredEntity: id => { const index = attendance.findIndex(item => item.id === id); if (index >= 0) attendance.splice(index, 1); },
  };
  return { ctx, actions, attendance };
}
const processState = (stageIndex = 0, phase: "waiting" | "working" | "blocked" = "waiting") => ({ version: 2, definition: "ale", definitionVersion: 1, station: "station", worker: phase === "working" ? "worker" : null, stageIndex, progressSeconds: 0, enteredTick: 0, phase, blockedReason: phase === "blocked" ? "blocked" : "" });

test("missing inputs leave process attendance unclaimed", () => {
  const { ctx } = context(processState(), req("attended"), []);
  const provider = processAttendanceProvider(ctx, ["worker"], new Set());
  assert.equal(provider.candidates.length, 0);
  assert.deepEqual(provider.claims, [{ task: "process", actor: null }]);
});

test("elapsed and blocked stages do not create attendance", () => {
  for (const state of [processState(), processState(0, "blocked")]) {
    const { ctx } = context(state, req(state.phase === "blocked" ? "attended" : "elapsed"), [{ container: "station:kettle", kind: "grain", quantity: 2 }]);
    const provider = processAttendanceProvider(ctx, ["worker"], new Set());
    assert.equal(provider.candidates.length, 0);
    assert.equal(provider.claims[0]!.actor, null);
  }
});

test("ready attended stage submits exactly one native attendance action", () => {
  const { ctx, actions } = context(processState(), req("attended"), [{ container: "station:kettle", kind: "grain", quantity: 2 }]);
  const provider = processAttendanceProvider(ctx, ["worker"], new Set());
  assert.equal(provider.candidates.length, 1);
  provider.apply([{ worker: "worker", task: "process", cost: 0 }]);
  assert.deepEqual(actions, [{ kind: "attend-process", worker: "worker", process: "process" }]);
});

test("saved approach is retained as one attendance record", () => {
  const { ctx, actions, attendance } = context(processState(), req("attended"), [{ container: "station:kettle", kind: "grain", quantity: 2 }]);
  const provider = processAttendanceProvider(ctx, ["worker"], new Set());
  provider.apply([{ worker: "worker", task: "process", cost: 0 }]);
  assert.deepEqual(attendance, [{ id: "process-attendance.process", value: {
    process: "process", actor: "worker", contactX: 0, contactY: 0, contactZ: 0,
  } }]);
  assert.equal(actions.filter(action => (action as { kind: string }).kind === "attend-process").length, 1);
});

test("later attended stage does not require consumed original inputs", () => {
  const requirements = req("elapsed");
  const { ctx } = context(processState(1), {
    ...requirements,
    stages: [...requirements.stages, { id: "keg", mode: "attended", durationSeconds: 2 }],
  }, []);
  const provider = processAttendanceProvider(ctx, ["worker"], new Set());
  assert.equal(provider.candidates.length, 1);
});
