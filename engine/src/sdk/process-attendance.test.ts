import { strict as assert } from "node:assert";
import { test } from "node:test";
import { component, entity } from "./authoring";
import { Body, Container, Position, Traversal } from "./common";
import { OwnedByParty, PartyMember } from "./party";
import { StagedProcess } from "./process-supply";
import { processAttendanceProvider } from "./process-attendance";
import type { ActionRequest, EntityId, ProcessRequirements, QueryRow, QuerySpec, WorkAttempt, WriteContext } from "../contracts";

const Worker = component<{ guest: boolean }>("test.worker", { version: 1, fields: { guest: "boolean" } });
const req = (mode: "attended" | "elapsed", stages = [{ id: "stage", mode, durationSeconds: 2 }]): ProcessRequirements => ({ definition: "ale", version: 1, stationCatalog: "brew-station", phase: "waiting", inputs: [{ role: "grain", port: "kettle", material: "grain", quantity: 2, policy: "portion", disposition: "consume" }], stages });
type ProcessState = { version: number; definition: string; definitionVersion: number; station: EntityId; stageIndex: number; progressSeconds: number; enteredTick: number; phase: "waiting" | "working" | "complete" | "blocked"; blockedReason: string };
const state = (stageIndex = 0, phase: ProcessState["phase"] = "waiting"): ProcessState => ({ version: 3, definition: "ale", definitionVersion: 1, station: entity("station"), stageIndex, progressSeconds: 0, enteredTick: 0, phase, blockedReason: phase === "blocked" ? "blocked" : "" });
const grain = [{ id: entity("lot"), container: entity("station:kettle"), kind: "grain", quantity: 2 }];

function context(process: ProcessState, requirements: ProcessRequirements, lots: readonly { readonly id: EntityId; readonly kind: string; readonly quantity: number; readonly container: EntityId }[], options: { readonly party?: EntityId; readonly workerParty?: EntityId; readonly attempts?: readonly WorkAttempt[]; readonly processCount?: number; readonly workerCount?: number; readonly tick?: number } = {}) {
  const actions: ActionRequest[] = [];
  const party = options.party ?? entity("party");
  const processIds: EntityId[] = Array.from({ length: options.processCount ?? 1 }, (_, index) => entity(`process-${index}`));
  const workerIds: EntityId[] = Array.from({ length: options.workerCount ?? 1 }, (_, index) => entity(options.workerCount ? `worker-${index}` : "worker"));
  const states = new Map(processIds.map(id => [id, { ...process }]));
  const value = (id: EntityId, definition: { readonly id: string }): object | undefined => {
    if (definition.id === StagedProcess.id) return states.get(id);
    if (definition.id === Worker.id) return { guest: false };
    if (definition.id === Position.id) return { x: 0, y: 0, z: 0, facing: 0 };
    if (definition.id === Body.id) return { speed: 1 };
    if (definition.id === Container.id) return { capacity: 4 };
    if (definition.id === Traversal.id) return { clearanceCells: 1, maxStepCells: 1 };
    if (definition.id === OwnedByParty.id && (id === entity("station") || id === entity("process-0"))) return { party };
    if (definition.id === PartyMember.id && id.startsWith("worker")) return { party: options.workerParty ?? party };
    return undefined;
  };
  const ctx: WriteContext = {
    clock: { now: 0, delta: 1, tick: options.tick ?? 0 }, outcomes: [], random: { next: () => 0 }, impacts: [],
    query<T extends object>(spec: QuerySpec<T>): readonly QueryRow<T>[] {
      const ids = spec.components.some(component => component.id === StagedProcess.id) ? processIds : workerIds;
      return ids.filter(id => spec.components.every(component => value(id, component) !== undefined)).map(id => ({ id, get: <V extends object>(definition: { readonly id: string }) => value(id, definition) as V }));
    },
    workMaterialFacts: () => ({ version: 1, containers: [{ id: entity("station:kettle"), capacity: 8, sealed: false }], lots }),
    workAttempts: taskIds => (options.attempts ?? []).filter(attempt => taskIds.includes(attempt.key.task)),
    workAttemptForWorker: worker => (options.attempts ?? []).find(attempt => attempt.worker === worker) ?? null,
    processRequirements: () => requirements, floorOperations: () => [], worldPoses: () => [], routeCosts: requests => requests.map(request => ({ actor: request.actor, status: "reachable" as const, cost: 0 })), routeToAny: () => ({ actor: entity("worker"), status: "unavailable" as const, reason: "test" }), transferContacts: () => ({ kind: "blocked", reason: "no-contact" }), physicalContacts: () => [], environmentFacts: () => null, atmosphereSamples: () => ({ revision: 0, geometryRevision: 0, samples: [] }), constructionReadiness: () => [], constructionAccess: () => [], deconstructionAccess: () => [], terrainMaterials: () => [], terrainSurfaces: () => [], structureSurfaces: () => [], waterContacts: () => [], assign: candidates => candidates.map(({ worker, task, cost }) => ({ worker, task, cost })), write: () => {}, action: action => actions.push(action), createAuthoredEntity: () => {}, removeAuthoredEntity: () => {},
  };
  return { ctx, actions };
}
const completedRoute = (): WorkAttempt => ({ key: { task: entity("process-0"), generation: 1 }, worker: entity("worker"), party: entity("party"), phase: { kind: "outcome", operation: { attempt: { task: entity("process-0"), generation: 1 }, sequence: 1 }, activity: { kind: "route", destination: { x: 0, y: 0, z: 0, frame: null } }, result: { kind: "completed" } } });
const blockedAttendance = (): WorkAttempt => ({ key: { task: entity("process-0"), generation: 1 }, worker: entity("worker"), party: entity("party"), phase: { kind: "outcome", operation: { attempt: { task: entity("process-0"), generation: 1 }, sequence: 2 }, activity: { kind: "process-attendance", process: entity("process-0") }, result: { kind: "blocked", reason: "workerUnavailable" } } });

test("stage-0 attendance waits for native input admission", () => assert.equal(processAttendanceProvider(context(state(), req("attended"), []).ctx, [entity("worker")], new Set()).candidates.length, 0));
test("elapsed stages wait while blocked attended stages re-enter through the bounded process window", () => { assert.equal(processAttendanceProvider(context(state(), req("elapsed"), grain).ctx, [entity("worker")], new Set()).candidates.length, 0); const first = processAttendanceProvider(context(state(0, "blocked"), req("attended"), grain, { processCount: 8, tick: 0 }).ctx, [entity("worker")], new Set()); const second = processAttendanceProvider(context(state(0, "blocked"), req("attended"), grain, { processCount: 8, tick: 1 }).ctx, [entity("worker")], new Set()); assert.deepEqual(first.candidates.map(candidate => candidate.task), [entity("process-0"), entity("process-1"), entity("process-2"), entity("process-3")]); assert.deepEqual(second.candidates.map(candidate => candidate.task), [entity("process-4"), entity("process-5"), entity("process-6"), entity("process-7")]); });
test("later attended stage does not require consumed original inputs", () => { const later = req("elapsed", [{ id: "elapsed", mode: "elapsed", durationSeconds: 1 }, { id: "attended", mode: "attended", durationSeconds: 1 }]); assert.equal(processAttendanceProvider(context(state(1), later, []).ctx, [entity("worker")], new Set()).candidates.length, 1); });
test("party ownership and active attempts restrict attendance", () => { assert.equal(processAttendanceProvider(context(state(), req("attended"), grain, { party: entity("party-a"), workerParty: entity("party-b") }).ctx, [entity("worker")], new Set()).candidates.length, 0); assert.equal(processAttendanceProvider(context(state(), req("attended"), grain, { attempts: [completedRoute()] }).ctx, [entity("worker")], new Set()).candidates.length, 0); });
test("completed route continues into native attendance", () => { const { ctx, actions } = context(state(), req("attended"), grain, { attempts: [completedRoute()] }); processAttendanceProvider(ctx, [entity("worker")], new Set()).progress(); assert.deepEqual(actions, [{ kind: "continue-work-attempt", task: entity("process-0"), generation: 1, sequence: 1, nextActivity: { kind: "process-attendance", process: entity("process-0") } }]); });
test("terminal process attendance is acknowledged and rediscovered after commit", () => { const { ctx, actions } = context(state(), req("attended"), grain, { attempts: [blockedAttendance()] }); processAttendanceProvider(ctx, [entity("worker")], new Set()).progress(); assert.deepEqual(actions, [{ kind: "acknowledge-work-attempt", task: entity("process-0"), generation: 1, sequence: 2 }]); assert.equal(processAttendanceProvider(context(state(), req("attended"), grain).ctx, [entity("worker")], new Set()).candidates.length, 1); });
test("blocked attendance releases its worker claim while awaiting acknowledgement", () => { const workers = [entity("worker"), entity("worker-1")]; const { ctx } = context(state(), req("attended"), grain, { processCount: 2, workerCount: 2, attempts: [blockedAttendance()] }); const provider = processAttendanceProvider(ctx, workers, new Set()); assert.equal(provider.claims.find(claim => claim.task === entity("process-0"))?.actor, null); assert.equal(provider.candidates.length, 2); });
test("drafted executing attendance is interrupted before any continuation", () => { const fixture = context({ ...state(), phase: "working" }, req("attended"), grain, { attempts: [{ ...completedRoute(), phase: { kind: "executing", operation: { attempt: { task: entity("process-0"), generation: 1 }, sequence: 1 }, activity: { kind: "process-attendance", process: entity("process-0") } } }] }); const provider = processAttendanceProvider(fixture.ctx, [entity("worker")], new Set([entity("worker")])); provider.progress(); assert.deepEqual(fixture.actions, [{ kind: "interrupt-work-attempt", task: entity("process-0"), generation: 1, sequence: 1, cause: "drafted" }]); });
test("bounded windows reject oversized input and keep a finite worker window", () => { assert.throws(() => processAttendanceProvider(context(state(), req("attended"), grain, { processCount: 65 }).ctx, [entity("worker")], new Set()), /process bound/); assert.throws(() => processAttendanceProvider(context(state(), req("attended"), grain).ctx, Array.from({ length: 257 }, (_, index) => entity(`worker-${index}`)), new Set()), /worker bound/); const workers = Array.from({ length: 40 }, (_, index) => entity(`worker-${index}`)); assert.equal(processAttendanceProvider(context(state(), req("attended"), grain, { workerCount: 40 }).ctx, workers, new Set()).candidates.length, 32); });
test("an active attempt remains occupied outside the rotating candidate window", () => { const fixture = context(state(), req("attended"), grain, { processCount: 8, attempts: [completedRoute()], tick: 1 }); const provider = processAttendanceProvider(fixture.ctx, [entity("worker")], new Set()); assert.equal(provider.claims.find(claim => claim.task === entity("process-0"))?.actor, entity("worker")); assert.equal(provider.candidates.length, 0); });
