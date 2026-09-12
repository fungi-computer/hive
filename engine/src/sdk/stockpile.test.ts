import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entity } from "./authoring";
import { Container, MaterialLot, Position } from "./common";
import { DeliveryTask } from "./delivery";
import { GroundStock } from "./ground-stock";
import { StockpileCell, planStockpileDeliveries, stockpileCellRecords } from "./stockpile";
import type { EntityId, WriteContext } from "../contracts";

type Row = { id: EntityId; values: Map<string, unknown> };
const row = (id: EntityId, definition: { id: string }, value: unknown): Row => ({ id, values: new Map([[definition.id, value]]) });
function fake(rows: Row[]) {
  const created: EntityId[] = [];
  return {
    created,
    context: {
      clock: { now: 0, delta: 0, tick: 0 }, outcomes: [], impacts: [], random: { next: () => 0 },
      query: (spec: { components: readonly { id: string }[] }) => rows.filter(r => r.values.has(spec.components[0].id)).map(r => ({ id: r.id, get: (d: { id: string }) => r.values.get(d.id) })),
      worldPoses: () => [], routeCosts: () => [], physicalContacts: () => [], atmosphereSamples: () => ({ samples: [] }), terrainMaterials: () => [], terrainSurfaces: () => [], assign: () => [],
      write: () => {}, action: () => {}, removeAuthoredEntity: () => {},
      createAuthoredEntity: (record: { id: EntityId; components: Record<string, unknown> }) => { created.push(record.id); rows.push(row(record.id, DeliveryTask, record.components[DeliveryTask.id])); },
    } as unknown as WriteContext,
  };
}

test("stockpile records are deterministic, bounded, positioned finite containers", () => {
  const records = stockpileCellRecords([
    { zone: entity("zone"), cell: [1, 3, 2], priority: 4, filterProfile: "wood", capacity: 3 },
    { zone: entity("zone"), cell: [0, 3, 2], priority: 4, filterProfile: "wood", capacity: 3 },
  ]);
  assert.deepEqual(records.map(r => r.id), [entity("stockpile.4:zone.0.3.2"), entity("stockpile.4:zone.1.3.2")]);
  assert.equal(records[0].components[Container.id].capacity, 3);
  assert.deepEqual(records[0].components[Position.id], { x: 0, y: 3, z: 2, facing: 0 });
  assert.throws(() => stockpileCellRecords([{ zone: entity("zone"), cell: [1, 3, 2], priority: 1, filterProfile: "wood", capacity: 1 }, { zone: entity("zone"), cell: [1, 3, 2], priority: 1, filterProfile: "wood", capacity: 1 }]));
});

test("planner claims one lot and cell, respects existing capacity and reloadable task state", () => {
  const zone = entity("zone");
  const destination = entity("stockpile.4:zone.0.3.2");
  const source = entity("ground.wood");
  const lot = entity("lot.wood");
  const records = stockpileCellRecords([{ zone, cell: [0, 3, 2], priority: 2, filterProfile: "wood", capacity: 3 }]);
  const rows = [
    row(destination, StockpileCell, records[0].components[StockpileCell.id]),
    row(destination, Container, { capacity: 3 }), row(destination, Position, { x: 0, y: 3, z: 2, facing: 0 }),
    row(source, GroundStock, {}), row(source, Container, { capacity: 4 }), row(lot, MaterialLot, { kind: "wood", quantity: 2, container: source }),
  ];
  const state = fake(rows);
  assert.equal(planStockpileDeliveries(state.context, { filterProfiles: { wood: { materials: ["wood"] } } }).length, 1);
  assert.equal(planStockpileDeliveries(state.context, { filterProfiles: { wood: { materials: ["wood"] } } }).length, 0);
  assert.equal(state.created.length, 1);
});
