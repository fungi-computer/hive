import { component, system } from "./authoring";
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
    assign: () => [],
    routeCosts: () => { throw new Error("unexpected route query"); },
    physicalContacts: () => { throw new Error("unexpected physical contact query in this fixture"); }, terrainMaterials: () => [],
    terrainSurfaces: () => [], structureSurfaces: () => [],
    worldPoses: () => [],
    write: (...args) => writes.push(args),
    createAuthoredEntity: () => { throw new Error("unexpected authored creation"); },
    removeAuthoredEntity: () => { throw new Error("unexpected authored removal"); },
    action: () => {},
  });
  if (writes.length !== 1) throw new Error("declared write was not recorded");
}
