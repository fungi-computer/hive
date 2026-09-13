import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "./authoring";
import { ConstructionSite } from "./construction";
import { Body, Container, MaterialLot, Position, Traversal } from "./common";
import { WorkParticipation } from "./work-control";
import {
  ConstructionApproach,
  constructionWorkProvider,
  constructionWorkSystem,
} from "./construction-work";
import type { QueryRow, QuerySpec, WriteContext } from "../contracts";
import { parseConstructionAccess } from "../runtime/wasm-kernel";

const worker = entity("worker.builder");
const site = entity("site.floor");
const secondSite = entity("site.floor.second");
const lot = entity("lot.stone");

function row(id: ReturnType<typeof entity>, values: Record<string, unknown>): QueryRow<any> {
  return { id, get: (definition: { id: string }) => values[definition.id] } as QueryRow<any>;
}

function context(options: {
  readonly includeMaterial: boolean;
  readonly workerAtSite?: boolean;
  readonly attended?: boolean;
  readonly outcomes?: readonly any[];
  readonly constructionStatus?: "ready" | "waitingForSupport";
  readonly bound?: boolean;
  readonly suspended?: boolean;
}) {
  const records: QueryRow<any>[] = [
    row(site, {
      [ConstructionSite.id]: {
        catalog: "floor", x: 1, y: 0, z: 1, orientation: "north",
        worker: options.attended ? worker : null,
        seconds: 0, phase: options.attended ? "working" : "planned",
      },
      ...(options.bound !== false ? { [Position.id]: { x: 1, y: 0.5, z: 1, facing: 0 } } : {}),
    }),
    row(worker, {
      [Body.id]: { speed: 1 },
      [Container.id]: { capacity: 8 },
      [Traversal.id]: { clearanceCells: 1, maxStepCells: 1 },
      [Position.id]: { x: options.workerAtSite ? 1 : 4, y: 0.5, z: options.workerAtSite ? 1 : 4, facing: 0 },
      ...(options.suspended ? { [WorkParticipation.id]: { automatic: false } } : {}),
    }),
  ];
  if (options.includeMaterial) records.push(row(lot, {
    [MaterialLot.id]: { kind: "stone", quantity: 1, container: site },
  }));
  const actions: unknown[] = [];
  const created: unknown[] = [];
  const removed: unknown[] = [];
  const routes: unknown[] = [];
  const base = {
    clock: { now: 0, delta: 0.1, tick: 1 }, outcomes: options.outcomes ?? [], impacts: [], random: { next: () => 0 },
    query(spec: QuerySpec<any>) {
      return records.filter((candidate) => spec.components.every((definition) =>
        candidate.get(definition) !== undefined,
      ));
    },
    worldPoses(ids: readonly string[]) {
      return ids.flatMap((id) => {
        if (id !== worker && id !== site) return [];
        const atSite = id === site || (id === worker && options.workerAtSite);
        return [{
          id, local: { x: atSite ? 1 : 4, y: atSite ? 0.5 : 4, z: atSite ? 1 : 4, facing: 0 },
          world: { x: atSite ? 1 : 4, y: atSite ? 0.5 : 4, z: atSite ? 1 : 4, facing: 0 },
          support: null, surface: null,
        }];
      });
    },
    routeCosts(requests: readonly unknown[]) {
      routes.push(requests);
      return requests.map(() => ({ status: "reachable", cost: 6 }));
    },
    routeToAny: (request: { actor: typeof worker; targets: readonly unknown[] }) => { routes.push(request); return { actor: request.actor, status: "reachable" as const, targetIndex: 0, cost: 6 }; },
    constructionReadiness: (sites: readonly ReturnType<typeof entity>[]) => sites.map((site) => ({ site, status: options.constructionStatus ?? "ready" })),
    constructionAccess: (sites: readonly ReturnType<typeof entity>[]) => sites.map((site) => ({ site, support: options.constructionStatus ?? "ready", materialsReady: options.includeMaterial, contacts: [{ x: 1, y: 0.5, z: 1, frame: null, kind: "origin" as const }] })),
    deconstructionAccess: () => [],
    physicalContacts: () => { throw new Error("unexpected physical contact query in this fixture"); }, terrainMaterials: () => [], terrainSurfaces: () => [],
    assign: (candidates: readonly { readonly worker: typeof worker; readonly task: typeof site; readonly cost: number }[]) => candidates,
    write: () => {},
    action: (action: unknown) => actions.push(action),
    createAuthoredEntity: (record: unknown) => created.push(record),
    removeAuthoredEntity: (id: unknown) => removed.push(id),
  } as unknown as WriteContext;
  return { base, actions, created, removed, routes };
}

const options = {
  workers: [worker],
};

test("construction eligibility filters missing material before route costs", () => {
  const fake = context({ includeMaterial: false });
  const prepared = constructionWorkProvider(fake.base, options, new Set());
  assert.equal(prepared.candidates.length, 0);
  assert.equal(fake.routes.length, 0);
});

test("construction eligibility excludes sites waiting for native support", () => {
  const fake = context({ includeMaterial: true, constructionStatus: "waitingForSupport" });
  const prepared = constructionWorkProvider(fake.base, options, new Set());
  assert.equal(prepared.candidates.length, 0);
  assert.equal(fake.routes.length, 0);
});

test("construction system joins a fresh site through the shared matcher", () => {
  const fake = context({ includeMaterial: true });
  constructionWorkSystem(options).run(fake.base);
  assert.equal(fake.created.length, 1);
  assert.equal(fake.actions.length, 1);
});

test("unbound site is bound through the allocator without approach or move", () => {
  const fake = context({ includeMaterial: true, bound: false });
  const prepared = constructionWorkProvider(fake.base, options, new Set());
  assert.equal(prepared.candidates[0].mode, "bind");
  prepared.estimate(prepared.candidates[0]);
  prepared.apply([{ worker, task: site, cost: 6 }]);
  assert.deepEqual(fake.actions, [{ kind: "bind-construction-stage", site, contact: { x: 1, y: 0.5, z: 1, frame: null } }]);
  assert.deepEqual(fake.created, []);
});

test("suspended worker cannot bind through the shared construction system", () => {
  const fake = context({ includeMaterial: true, bound: false, suspended: true });
  constructionWorkSystem(options).run(fake.base);
  assert.deepEqual(fake.actions, []);
});

test("one worker receives at most one binding across multiple unbound sites", () => {
  const fake = context({ includeMaterial: true, bound: false });
  const originalQuery = fake.base.query;
  const originalAccess = fake.base.constructionAccess;
  const extra = row(secondSite, { [ConstructionSite.id]: {
    catalog: "floor", x: 2, y: 0, z: 2, orientation: "north", worker: null, seconds: 0, phase: "planned",
  } });
  (fake.base as any).query = ((spec: QuerySpec<any>) =>
    spec.components.some((definition) => definition.id === ConstructionSite.id)
      ? [...originalQuery(spec), extra] : originalQuery(spec)) as WriteContext["query"];
  (fake.base as any).constructionAccess = ((sites: readonly string[]) => [
    ...originalAccess([site]),
    { site: secondSite, support: "ready", materialsReady: true, contacts: [{ x: 2, y: 0.5, z: 2, frame: null, kind: "origin" as const }], removal: "ready" as const, salvageQuantity: 0, workSeconds: 1 },
  ]) as WriteContext["constructionAccess"];
  (fake.base as any).assign = (candidates: readonly any[]) => candidates.slice(0, 1);
  constructionWorkSystem(options).run(fake.base);
  assert.equal(fake.actions.filter((action: any) => action.kind === "bind-construction-stage").length, 1);
  assert.equal(fake.routes.length, 1);
});

test("construction access parser validates materials and preserves order", () => {
  const first = entity("site.first");
  const second = entity("site.second");
  const rows = [
    { site: first, support: "ready", materialsReady: true, contacts: [{ x: 1, y: 0, z: 1, frame: null, kind: "origin" }], removal: "ready", salvageQuantity: 0, workSeconds: 1 },
    { site: second, support: "ready", materialsReady: false, contacts: [{ x: 2, y: 0, z: 2, frame: null, kind: "landing" }], removal: "ready", salvageQuantity: 0, workSeconds: 1 },
  ];
  assert.deepEqual(parseConstructionAccess(rows, [first, second]), rows);
  assert.throws(() => parseConstructionAccess([{ ...rows[0], materialsReady: "yes" }], [first]));
  assert.throws(() => parseConstructionAccess([{ ...rows[0], contacts: [{ ...rows[0].contacts[0], x: Number.NaN }] }], [first]));
  assert.throws(() => parseConstructionAccess(rows, [second, first]), /order mismatch/);
  assert.throws(() => parseConstructionAccess([rows[0], rows[0]], [first, first]), /duplicate construction access site/);
});

test("construction assignment persists an approach claim and native attendance releases it", () => {
  const fake = context({ includeMaterial: true });
  const prepared = constructionWorkProvider(fake.base, options, new Set());
  assert.equal(prepared.candidates.length, 1);
  prepared.estimate(prepared.candidates[0]);
  prepared.apply([{ worker, task: site, cost: 3 }]);
  assert.deepEqual(fake.created, [{
    id: "construction-approach.10:site.floor",
    components: { [ConstructionApproach.id]: { site, worker, contactX: 1, contactY: 0.5, contactZ: 1 } },
  }]);
  assert.deepEqual(fake.actions, [{ kind: "move", entity: worker, destination: { x: 1, y: 0.5, z: 1, frame: null }, facing: 0 }]);

  const arrived = context({ includeMaterial: true, workerAtSite: true });
  const approach = row(entity("construction-approach.10:site.floor"), {
    [ConstructionApproach.id]: { site, worker, contactX: 1, contactY: 0.5, contactZ: 1 },
  });
  const originalQuery = arrived.base.query;
  (arrived.base as any).query = ((spec: QuerySpec<any>) => {
    if (spec.components.some((definition) => definition.id === ConstructionApproach.id)) return [approach];
    return originalQuery(spec);
  }) as WriteContext["query"];
  const next = constructionWorkProvider(arrived.base, options, new Set());
  next.progress();
  assert.deepEqual(arrived.actions, [{ kind: "attend-construction", worker, site, contact: { x: 1, y: 0.5, z: 1, frame: null } }]);

  const attended = context({ includeMaterial: true, workerAtSite: true, attended: true });
  const attendedQuery = attended.base.query;
  (attended.base as any).query = ((spec: QuerySpec<any>) => {
    if (spec.components.some((definition) => definition.id === ConstructionApproach.id)) return [approach];
    return attendedQuery(spec);
  }) as WriteContext["query"];
  constructionWorkProvider(attended.base, options, new Set()).progress();
  assert.deepEqual(attended.removed, [approach.id]);
});

test("disappearing selected contact releases the stale approach", () => {
  const fake = context({ includeMaterial: true });
  const approach = row(entity("construction-approach.10:site.floor"), {
    [ConstructionApproach.id]: { site, worker, contactX: 1, contactY: 0.5, contactZ: 1 },
  });
  const originalQuery = fake.base.query;
  const originalAccess = fake.base.constructionAccess;
  (fake.base as any).query = ((spec: QuerySpec<any>) =>
    spec.components.some((definition) => definition.id === ConstructionApproach.id) ? [approach] : originalQuery(spec)) as WriteContext["query"];
  (fake.base as any).constructionAccess = ((sites: readonly ReturnType<typeof entity>[]) => originalAccess(sites).map((entry) => ({ ...entry, contacts: [] }))) as WriteContext["constructionAccess"];
  constructionWorkProvider(fake.base, options, new Set()).progress();
  assert.deepEqual(fake.removed, [approach.id]);
});

test("approach releases removed workers but ignores rejected moves to another target", () => {
  const approach = row(entity("construction-approach.10:site.floor"), {
    [ConstructionApproach.id]: { site, worker, contactX: 1, contactY: 0.5, contactZ: 1 },
  });
  const foreign = context({
    includeMaterial: true,
    outcomes: [{
      action: { kind: "move", entity: worker, destination: { x: 99, y: 99, z: 99, frame: null } },
      result: { accepted: false, revision: 1 },
    }],
  });
  const originalQuery = foreign.base.query;
  (foreign.base as any).query = ((spec: QuerySpec<any>) => {
    if (spec.components.some((definition) => definition.id === ConstructionApproach.id)) return [approach];
    return originalQuery(spec);
  }) as WriteContext["query"];
  constructionWorkProvider(foreign.base, options, new Set()).progress();
  assert.deepEqual(foreign.removed, []);

  const revoked = context({ includeMaterial: true });
  const revokedQuery = revoked.base.query;
  (revoked.base as any).query = ((spec: QuerySpec<any>) => {
    if (spec.components.some((definition) => definition.id === ConstructionApproach.id)) return [approach];
    return revokedQuery(spec);
  }) as WriteContext["query"];
  constructionWorkProvider(revoked.base, { ...options, workers: [] }, new Set()).progress();
  assert.deepEqual(revoked.removed, [approach.id]);
});
