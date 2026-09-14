import assert from "node:assert/strict";
import test from "node:test";
import { query } from "../sdk/authoring";
import { ConstructionSite } from "../sdk/construction";
import { ResourceSite } from "../sdk/common";
import { colonyPack } from "./colony";
import { ColonyResourceOrder } from "./colony-work";

const cell = [0, 13, 0] as const;

function row(id: string, values: ReadonlyMap<string, unknown>) {
  return { id, get(definition: { id: string }) {
    const value = values.get(definition.id);
    if (value === undefined) throw new Error(`missing fixture component ${definition.id}`);
    return value;
  } };
}

function context(options: {
  material?: number;
  orders?: readonly ReturnType<typeof row>[];
  resources?: readonly ReturnType<typeof row>[];
  structures?: readonly ReturnType<typeof row>[];
} = {}) {
  const material = options.material ?? 1;
  return {
    scope: { kind: "host" as const },
    physicalContacts: () => [],
    terrainMaterials: () => [material],
    terrainSurfaces: () => [{ cell: [cell[0], cell[1], cell[2]] as [number, number, number], material, generatedTop: cell[1] }],
    query(spec: { components: readonly { id: string }[] }) {
      const id = spec.components[0]?.id;
      if (id === ColonyResourceOrder.id) return options.orders ?? [];
      if (id === ResourceSite.id) return options.resources ?? [];
      if (id === ConstructionSite.id) return options.structures ?? [];
      return [];
    },
  };
}

function orderRow() {
  return row("colony.resource.mugwort.0.13.0", new Map([[ColonyResourceOrder.id, {
    definition: "mugwort", cellX: 0, cellY: 13, cellZ: 0, site: "colony.resource.mugwort.0.13.0",
    stage: "sow", status: "queued", workSeconds: 0, reason: "",
  }]]));
}

test("sow mugwort accepts the current terrain-cell material and stays workerless", () => {
  const result = colonyPack.commands!.sowMugwort.invoke(context(), { target: { cell, material: 1 } });
  assert.deepEqual(result.actions, []);
  assert.deepEqual(result.writes, []);
  assert.deepEqual(result.creates?.[0]?.components[ColonyResourceOrder.id], {
    definition: "mugwort", cellX: 0, cellY: 13, cellZ: 0, site: "colony.resource.mugwort.0.13.0",
    stage: "sow", status: "queued", workSeconds: 0, reason: "",
  });
});

test("sow mugwort rejects a target whose reported material is not soil", () => {
  assert.throws(
    () => colonyPack.commands!.sowMugwort.invoke(context({ material: 2 }), { target: { cell, material: 2 } }),
    /mugwort requires soil/,
  );
});

test("sow mugwort rejects a stale material report before creating an order", () => {
  assert.throws(
    () => colonyPack.commands!.sowMugwort.invoke(context(), { target: { cell, material: 2 } }),
    /terrain changed/,
  );
});

test("sow mugwort rejects an existing active designation", () => {
  assert.throws(
    () => colonyPack.commands!.sowMugwort.invoke(context({ orders: [orderRow()] }), { target: { cell, material: 1 } }),
    /already has an active designation/,
  );
});

test("sow mugwort rejects an occupied construction cell", () => {
  const structure = row("colony.build.timber-floor.0.13.0.north", new Map([[ConstructionSite.id, {
    catalog: "timber-floor", x: 0, y: 13, z: 0, orientation: "north", worker: null, seconds: 0, phase: "planned",
  }]]));
  assert.throws(
    () => colonyPack.commands!.sowMugwort.invoke(context({ structures: [structure] }), { target: { cell, material: 1 } }),
    /already has an active designation/,
  );
});
