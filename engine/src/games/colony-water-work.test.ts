// The bundled proof supplies its own typed runtime context; repository tsc
// intentionally lacks the Node test/generated-kernel declarations.
// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import { waterSupplyProvider, WaterSupplyOrder, WaterSupplyWork } from "./colony-water-work";
import { Body, Container, Destination, MaterialLot, Position } from "../sdk/common";
import { Worker } from "./colony-components";
import { OwnedByParty, PartyMember } from "../sdk/party";
import { colonyPack } from "./colony";

test("colony pack loads with shared worker component ownership", () => {
  assert.equal(colonyPack.systems.length, 2);
});

const id = (value: string) => value as import("../contracts").EntityId;
const row = (entity: string, values: Map<object, unknown>) => ({ id: id(entity), get: (definition: object) => values.get(definition) });

test("water provider interleaves two queued demands across held pails", () => {
  const workers = ["worker-a", "worker-b"].map((name, index) => row(name, new Map([
    [Worker, { guest: false }], [Body, { speed: 1 }], [Position, { x: index * 2, y: 0, z: 0, facing: 0 }], [Container, { capacity: 3 }], [PartyMember, { party: id("party") }],
  ])));
  const pails = ["pail-a", "pail-b"].map((name, index) => ({ id: id(name), kind: "pail", quantity: 1, container: id(`worker-${index === 0 ? "a" : "b"}`) }));
  const demands = ["demand-a", "demand-b"].map((name, index) => row(name, new Map([[WaterSupplyOrder, { revision: index + 1, process: null, party: id("party") }], [WaterSupplyWork, { request: index + 1, phase: "queued", x: 0, y: 0, z: 0, reason: "" }], [OwnedByParty, { party: id("party") }]])));
  const writes: unknown[] = [];
  let routeTargetCount = 0;
  const context = {
    query(spec: { components: readonly object[] }) {
      if (spec.components.includes(Worker)) return workers;
      if (spec.components.includes(PartyMember)) return workers;
      if (spec.components.includes(OwnedByParty)) return demands;
      if (spec.components.includes(MaterialLot)) return pails.map(lot => ({ id: lot.id, get: () => lot }));
      if (spec.components.includes(Destination)) return [];
      return demands;
    },
    workMaterialFacts: () => ({ version: 1, containers: pails.map(pail => ({ id: id(pail.id), capacity: 7, sealed: false })), lots: pails }),
    worldPoses: (entities: readonly string[]) => entities.map(entity => ({ id: id(entity), local: { x: 0, y: 0, z: 0, facing: 0 }, world: { x: entity.endsWith("a") ? 0 : 2, y: 0, z: 0, facing: 0 }, support: null, surface: null })),
    waterContacts: () => [
      { at: [0, 1, 0], approaches: [{ x: 0, y: 1, z: 0, frame: null }] },
      { at: [1, 1, 0], approaches: [{ x: 1, y: 1, z: 0, frame: null }] },
    ],
    routeToAny: (request: { targets: readonly unknown[] }) => { routeTargetCount = request.targets.length; return { status: "reachable", targetIndex: 0, cost: 1 }; },
    routeCosts: () => [], action: () => {}, write: (_definition: object, entity: string, value: unknown) => writes.push([entity, value]),
    outcomes: [], clock: { now: 0, delta: 0, tick: 0 }, random: { next: () => 0 }, impacts: [],
  } as any;
  const prepared = waterSupplyProvider(context, new Set());
  for (const candidate of prepared.candidates) assert.equal(prepared.estimate(candidate), 1);
  const selected: typeof prepared.candidates[number][] = [];
  for (const task of [id("demand-a"), id("demand-b")]) {
    const candidate = prepared.candidates.find(item => item.task === task && !selected.some(previous => previous.worker === item.worker));
    if (candidate) selected.push(candidate);
  }
  assert.equal(selected.length, 2);
  assert.equal(new Set(selected.map(candidate => candidate.task)).size, 2);
  assert.equal(new Set(selected.map(candidate => candidate.worker)).size, 2);
  assert.equal(new Set(selected.map(candidate => candidate.vessel)).size, 2);
  assert.equal(new Set(prepared.candidates.map(candidate => `${candidate.worker}:${candidate.task}`)).size, prepared.candidates.length);
  assert.equal(routeTargetCount, 2, "one worker/task route query considers both nearby water contacts");
  prepared.apply([
    { task: id("demand-a"), worker: id("worker-a"), cost: 1 },
    { task: id("demand-b"), worker: id("worker-b"), cost: 1 },
  ]);
  assert.equal(writes.length, 0, "native routing owns worker and pail lifecycle");
});

test("water provider skips contact query with no eligible held pail workers and bounds centers", () => {
  let calls = 0;
  const base: any = {
    query: (spec: any) => spec.components.includes(Worker) ? [] : spec.components.includes(Destination) ? [] : [],
    workMaterialFacts: () => ({ version: 1, containers: [], lots: [] }), worldPoses: () => { throw new Error("should not query poses"); }, waterContacts: () => { calls++; return []; }, routeToAny: () => ({ status: "unavailable", reason: "none" }), routeCosts: () => [], action: () => {}, write: () => {}, outcomes: [], clock: { now: 0, delta: 0, tick: 0 }, random: { next: () => 0 }, impacts: [],
  };
  const prepared = waterSupplyProvider(base, new Set());
  assert.equal(calls, 0);
  assert.equal(prepared.candidates.length, 0);
});

test("water provider sends at most sixteen authoritative centers", () => {
  const workers = Array.from({ length: 16 }, (_, index) => id(`worker-${index}`));
  const lots = workers.map((worker, index) => ({ id: id(`pail-${index}`), kind: "pail", quantity: 1, container: worker }));
  const demand = row("demand", new Map([[WaterSupplyOrder, { revision: 1, process: null, party: id("party") }], [WaterSupplyWork, { request: 1, phase: "queued", x: 0, y: 0, z: 0, reason: "" }], [OwnedByParty, { party: id("party") }]]));
  let poseCount = 0, centerCount = 0;
  const context: any = {
    query: (spec: any) => spec.components.includes(Worker) || spec.components.includes(PartyMember) ? workers.map(worker => row(worker, new Map([[Worker, { guest: false }], [Body, { speed: 1 }], [Position, { x: 0, y: 0, z: 0, facing: 0 }], [Container, { capacity: 3 }], [PartyMember, { party: id("party") }]]))) : spec.components.includes(OwnedByParty) ? [demand] : spec.components.includes(Destination) ? [] : [demand],
    workMaterialFacts: () => ({ version: 1, containers: lots.map(lot => ({ id: lot.id, capacity: 7, sealed: false })), lots }),
    worldPoses: (entities: readonly string[]) => { poseCount = entities.length; return entities.map(entity => ({ id: id(entity), local: { x: 0, y: 0, z: 0, facing: 0 }, world: { x: 0, y: 0, z: 0, facing: 0 }, support: null, surface: null })); },
    waterContacts: (centers: readonly unknown[]) => { centerCount = centers.length; return []; }, routeToAny: () => ({ status: "unavailable", reason: "none" }), routeCosts: () => [], action: () => {}, write: () => {}, outcomes: [], clock: { now: 0, delta: 0, tick: 0 }, random: { next: () => 0 }, impacts: [],
  };
  waterSupplyProvider(context, new Set());
  assert.equal(poseCount, 16);
  assert.equal(centerCount, 16);
});

test("completed demand does not invoke provider-side contact queries", () => {
  const demand = row("done", new Map([[WaterSupplyOrder, { revision: 1, process: null, party: id("party") }], [WaterSupplyWork, { request: 1, phase: "complete", x: 0, y: 0, z: 0, reason: "" }], [OwnedByParty, { party: id("party") }]]));
  let removed = "", facts = 0, contacts = 0;
  const context: any = { query: (spec: any) => spec.components.includes(Worker) || spec.components.includes(PartyMember) ? [] : spec.components.includes(OwnedByParty) ? [demand] : spec.components.includes(Destination) ? [] : [demand], workMaterialFacts: () => { facts++; return { version: 1, containers: [], lots: [] }; }, worldPoses: () => { throw new Error("should not query poses"); }, waterContacts: () => { contacts++; return []; }, routeToAny: () => ({ status: "unavailable", reason: "none" }), routeCosts: () => [], action: () => {}, write: () => {}, removeAuthoredEntity: (id: string) => { removed = id; }, outcomes: [], clock: { now: 0, delta: 0, tick: 0 }, random: { next: () => 0 }, impacts: [], };
  waterSupplyProvider(context, new Set()).progress();
  assert.equal(removed, "");
  assert.equal(facts, 1, "the provider reads canonical material facts before scheduling");
  assert.equal(contacts, 0);
});

test("queued planning stays bounded with many demands and keeps an active bound actor visible", () => {
  const active = row("worker-z", new Map([[Worker, { guest: false }], [Body, { speed: 1 }], [Position, { x: 0, y: 0, z: 0, facing: 0 }], [Container, { capacity: 3 }], [PartyMember, { party: id("party") }]]));
  const worker = row("worker-0", new Map([[Worker, { guest: false }], [Body, { speed: 1 }], [Position, { x: 0, y: 0, z: 0, facing: 0 }], [Container, { capacity: 3 }], [PartyMember, { party: id("party") }]]));
  const pails = Array.from({ length: 4 }, (_, index) => ({ id: id(`pail-${index}`), kind: "pail", quantity: 1, container: id(`worker-${index}`) }));
  const extraWorkers = pails.slice(1).map((pail) => row(pail.container, new Map([[Worker, { guest: false }], [Body, { speed: 1 }], [Position, { x: 0, y: 0, z: 0, facing: 0 }], [Container, { capacity: 3 }], [PartyMember, { party: id("party") }]])));
  const demands = Array.from({ length: 256 }, (_, index) => {
    const components: [object, unknown][] = [[WaterSupplyOrder, { revision: index + 1, process: null, party: index < 32 ? id("party") : null }], [WaterSupplyWork, { request: index + 1, phase: "queued", x: 0, y: 0, z: 0, reason: "" }]];
    if (index < 32) components.push([OwnedByParty, { party: id("party") }]);
    return row(`demand-${index}`, new Map(components));
  });
  demands.push(row("active", new Map([[WaterSupplyOrder, { revision: 257, process: null, party: id("party") }], [WaterSupplyWork, { request: 257, phase: "blocked", x: 0, y: 1, z: 0, reason: "retry" }], [OwnedByParty, { party: id("party") }]])));
  let posed: string[] = [], actions: any[] = [], progressWrites: any[] = [];
  const context: any = {
    query: (spec: any) => spec.components.includes(Worker) || spec.components.includes(PartyMember) ? [worker, active, ...extraWorkers] : spec.components.includes(OwnedByParty) ? demands.filter(row => row.get(OwnedByParty)) : spec.components.includes(Destination) ? [] : demands,
    workMaterialFacts: () => ({ version: 1, containers: pails.map((pail) => ({ id: pail.id, capacity: 7, sealed: false })), lots: pails }),
    worldPoses: (entities: readonly string[]) => { posed = [...entities]; return entities.map(entity => ({ id: id(entity), local: { x: 0, y: 0, z: 0, facing: 0 }, world: { x: 0, y: 0, z: 0, facing: 0 }, support: null, surface: null })); },
    waterContacts: () => [{ at: [0, 1, 0], approaches: [{ x: 0, y: 1, z: 0, frame: null }] }], routeToAny: () => ({ status: "reachable", targetIndex: 0, cost: 1 }), routeCosts: () => [], action: (value: any) => actions.push(value), write: (_definition: any, entity: any, value: any) => progressWrites.push([entity, value]), outcomes: [], clock: { now: 0, delta: 0, tick: 0 }, random: { next: () => 0 }, impacts: [], removeAuthoredEntity: () => {},
  };
  const prepared = waterSupplyProvider(context, new Set());
  assert.ok(prepared.candidates.length <= 128);
  assert.equal(new Set(prepared.candidates.slice(0, 4).map(candidate => candidate.worker)).size, 4);
  assert.ok(posed.includes("worker-z"));
  prepared.progress();
  assert.equal(actions.length, 0, "native outcome owns field-water continuation");
});
