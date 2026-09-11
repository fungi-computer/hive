import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "./authoring";
import { ConstructionSite } from "./construction";
import { Body, Container, MaterialLot, Position, Traversal } from "./common";
import {
  ConstructionApproach,
  constructionWorkProvider,
  constructionWorkSystem,
} from "./construction-work";
import type { QueryRow, QuerySpec, WriteContext } from "../contracts";

const worker = entity("worker.builder");
const site = entity("site.floor");
const lot = entity("lot.stone");

function row(id: ReturnType<typeof entity>, values: Record<string, unknown>): QueryRow<any> {
  return { id, get: (definition: { id: string }) => values[definition.id] } as QueryRow<any>;
}

function context(options: {
  readonly includeMaterial: boolean;
  readonly workerAtSite?: boolean;
  readonly attended?: boolean;
  readonly outcomes?: readonly any[];
}) {
  const records: QueryRow<any>[] = [
    row(site, {
      [ConstructionSite.id]: {
        catalog: "floor", x: 1, y: 0, z: 1, orientation: "north",
        contactX: 1, contactY: 0.5, contactZ: 1, worker: options.attended ? worker : null,
        seconds: 0, phase: options.attended ? "working" : "planned",
      },
      [Position.id]: { x: 1, y: 0.5, z: 1, facing: 0 },
    }),
    row(worker, {
      [Body.id]: { speed: 1 },
      [Container.id]: { capacity: 8 },
      [Traversal.id]: { clearanceCells: 1, maxStepCells: 1 },
      [Position.id]: { x: options.workerAtSite ? 1 : 4, y: 0.5, z: options.workerAtSite ? 1 : 4, facing: 0 },
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
      return requests.map(() => ({ status: "reachable", cost: 3 }));
    },
    physicalContacts: () => { throw new Error("unexpected physical contact query in this fixture"); }, terrainMaterials: () => [], terrainSurfaces: () => [], structureSurfaces: () => [],
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
  catalogMaterials: { floor: [{ material: "stone", quantity: 1 }] },
};

test("construction eligibility filters missing material before route costs", () => {
  const fake = context({ includeMaterial: false });
  const prepared = constructionWorkProvider(fake.base, options);
  assert.equal(prepared.candidates.length, 0);
  assert.equal(fake.routes.length, 0);
});

test("construction system joins a fresh site through the shared matcher", () => {
  const fake = context({ includeMaterial: true });
  constructionWorkSystem(options).run(fake.base);
  assert.equal(fake.created.length, 1);
  assert.equal(fake.actions.length, 1);
});

test("construction assignment persists an approach claim and native attendance releases it", () => {
  const fake = context({ includeMaterial: true });
  const prepared = constructionWorkProvider(fake.base, options);
  assert.equal(prepared.candidates.length, 1);
  prepared.apply([{ worker, task: site, cost: 3 }]);
  assert.deepEqual(fake.created, [{
    id: "construction-approach.10:site.floor",
    components: { [ConstructionApproach.id]: { site, worker } },
  }]);
  assert.deepEqual(fake.actions, [{ kind: "move", entity: worker, destination: { x: 1, y: 0.5, z: 1, frame: null }, facing: 0 }]);

  const arrived = context({ includeMaterial: true, workerAtSite: true });
  const approach = row(entity("construction-approach.10:site.floor"), {
    [ConstructionApproach.id]: { site, worker },
  });
  const originalQuery = arrived.base.query;
  (arrived.base as any).query = ((spec: QuerySpec<any>) => {
    if (spec.components.some((definition) => definition.id === ConstructionApproach.id)) return [approach];
    return originalQuery(spec);
  }) as WriteContext["query"];
  const next = constructionWorkProvider(arrived.base, options);
  next.progress();
  assert.deepEqual(arrived.actions, [{ kind: "attend-construction", worker, site }]);

  const attended = context({ includeMaterial: true, workerAtSite: true, attended: true });
  const attendedQuery = attended.base.query;
  (attended.base as any).query = ((spec: QuerySpec<any>) => {
    if (spec.components.some((definition) => definition.id === ConstructionApproach.id)) return [approach];
    return attendedQuery(spec);
  }) as WriteContext["query"];
  constructionWorkProvider(attended.base, options).progress();
  assert.deepEqual(attended.removed, [approach.id]);
});

test("approach releases removed workers but ignores rejected moves to another target", () => {
  const approach = row(entity("construction-approach.10:site.floor"), {
    [ConstructionApproach.id]: { site, worker },
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
  constructionWorkProvider(foreign.base, options).progress();
  assert.deepEqual(foreign.removed, []);

  const revoked = context({ includeMaterial: true });
  const revokedQuery = revoked.base.query;
  (revoked.base as any).query = ((spec: QuerySpec<any>) => {
    if (spec.components.some((definition) => definition.id === ConstructionApproach.id)) return [approach];
    return revokedQuery(spec);
  }) as WriteContext["query"];
  constructionWorkProvider(revoked.base, { ...options, workers: [] }).progress();
  assert.deepEqual(revoked.removed, [approach.id]);
});
