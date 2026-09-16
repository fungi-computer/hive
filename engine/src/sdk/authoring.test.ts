import { clearRelation, component, relation, setRelation, system } from "./authoring";
import { entity } from "./authoring";

const Own = component<{ value: number }>("test.own", {
  version: 1,
  fields: { value: "number" },
});
const Other = component<{ value: number }>("test.other", {
  version: 1,
  fields: { value: "number" },
});
const id = entity("actor:1");

export function authoringContractProof(): void {
  if (!Own.validate({ value: 2 }) || Own.validate({ value: "2" }))
    throw new Error("component validation failed");
  const guarded = system({
    id: "test.rule",
    version: 1,
    writes: [Own],
    run(ctx) {
      ctx.write(Own, id, { value: 3 });
      let rejected = false;
      try {
        ctx.write(Other, id, { value: 1 });
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error("undeclared component write was accepted");
    },
  });
  const writes: unknown[] = [];
  guarded.run({
    clock: { now: 0, delta: 1, tick: 0 },
    random: { next: () => 0.5 },
    impacts: [],
    outcomes: [],
    query: () => [],
    workMaterialFacts: () => ({ version: 1, containers: [], lots: [] }),
    routeCosts: () => {
      throw new Error("unexpected route query");
    },
    routeToAny: () => {
      throw new Error("unexpected route query");
    },
    environmentFacts: () => {
      throw new Error("unexpected environment query in this fixture");
    },
    constructionReadiness: (sites) => sites.map((site) => ({ site, status: "ready" as const })),
    constructionAccess: () => [],
    deconstructionAccess: () => [],
    atmosphereSamples: () => {
      throw new Error("unexpected atmosphere query in this fixture");
    },
    physicalContacts: () => {
      throw new Error("unexpected physical contact query in this fixture");
    },
    terrainMaterials: () => [],
    terrainSurfaces: () => [],
    worldPoses: () => [],
    write: (...args) => writes.push(args),
    createAuthoredEntity: () => {
      throw new Error("unexpected authored creation");
    },
    removeAuthoredEntity: () => {
      throw new Error("unexpected authored removal");
    },
    action: () => {},
  });
  if (writes.length !== 1) throw new Error("declared write was not recorded");

  const membership = relation<{ target: string }>("test.membership", {
    version: 1,
    fields: { target: "entity" },
    targetField: "target",
    sourceRequires: [Own],
    targetRequires: [Other.id],
  });
  if (
    membership.targetField !== "target" ||
    membership.sourceRequires?.[0] !== Own.id ||
    membership.targetRequires?.[0] !== Other.id ||
    membership.onTargetRemoved !== "detach" ||
    membership.allowSelf !== false
  ) throw new Error("relation metadata was not defaulted or preserved");
  if (setRelation(membership, id, entity("party:1")).kind !== "set-relation")
    throw new Error("set relation action was not authored");
  if (clearRelation(membership, id).kind !== "clear-relation")
    throw new Error("clear relation action was not authored");

  let rejected = false;
  try {
    relation<{ target: string; label: string }>("test.invalid-membership", {
      version: 1,
      fields: { target: "entity", label: "string" },
      targetField: "label",
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("invalid relation target was accepted");

  rejected = false;
  try {
    relation<{ target: string; label: string }>("test.overloaded-membership", {
      version: 1,
      fields: { target: "entity", label: "string" },
      targetField: "target",
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("relation metadata was mixed into the edge component");
}
