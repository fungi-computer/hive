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
      query: (spec: { components: readonly { id: string }[] }) => rows.filter(r => spec.components.every(component => r.values.has(component.id))).map(r => ({ id: r.id, get: (d: { id: string }) => r.values.get(d.id) })),
      worldPoses: () => [], routeCosts: () => [], physicalContacts: () => [], atmosphereSamples: () => ({ samples: [] }), terrainMaterials: () => [], terrainSurfaces: () => [], assign: () => [],
      write: () => {}, action: () => {}, removeAuthoredEntity: () => {},
      createAuthoredEntity: (record: { id: EntityId; components: Record<string, unknown> }) => { created.push(record.id); rows.push(row(record.id, DeliveryTask, record.components[DeliveryTask.id])); },
    } as unknown as WriteContext,
  };
}

test("stockpile records are deterministic, bounded, positioned finite containers", () => {
  const records = stockpileCellRecords([
    { zone: entity("zone"), cell: [1, 3, 2], priority: 4, filterProfile: "wood", capacity: 3, verticalMetres: 0.54 },
    { zone: entity("zone"), cell: [0, 3, 2], priority: 4, filterProfile: "wood", capacity: 3, verticalMetres: 0.54 },
  ]);
  assert.deepEqual(records.map(r => r.id), [entity("stockpile.4:zone.0.3.2"), entity("stockpile.4:zone.1.3.2")]);
  assert.equal((records[0].components[Container.id] as { capacity: number }).capacity, 3);
  assert.deepEqual(records[0].components[Position.id], { x: 0, y: 1.8900000000000001, z: 2, facing: 0 });
  assert.throws(() => stockpileCellRecords([{ zone: entity("zone"), cell: [1, 3, 2], priority: 1, filterProfile: "wood", capacity: 1, verticalMetres: 0.54 }, { zone: entity("zone"), cell: [1, 3, 2], priority: 1, filterProfile: "wood", capacity: 1, verticalMetres: 0.54 }]));
});

test("planner claims one lot and cell, respects existing capacity and reloadable task state", () => {
  const zone = entity("zone");
  const destination = entity("stockpile.4:zone.0.3.2");
  const source = entity("ground.wood");
  const lot = entity("lot.wood");
  const records = stockpileCellRecords([{ zone, cell: [0, 3, 2], priority: 2, filterProfile: "wood", capacity: 3, verticalMetres: 0.54 }]);
  const rows = [
    row(destination, StockpileCell, records[0].components[StockpileCell.id]),
    row(destination, Container, { capacity: 3 }), row(destination, Position, { x: 0, y: 1.8900000000000001, z: 2, facing: 0 }),
    row(source, GroundStock, {}), row(source, Container, { capacity: 4 }), row(lot, MaterialLot, { kind: "wood", quantity: 2, container: source }),
  ];
  const state = fake(rows);
  const profile = { filterProfiles: { wood: { materialCategories: { wood: "building" }, allowedCategories: ["building"] } } };
  assert.equal(planStockpileDeliveries(state.context, profile).length, 1);
  assert.equal(planStockpileDeliveries(state.context, profile).length, 0);
  assert.equal(state.created.length, 1);
});

test("rehauled stock only moves to a strictly better cell, with capacity and claim bounds", () => {
  const zone = entity("zone");
  const low = stockpileCellRecords([{ zone, cell: [0, 3, 0], priority: 1, filterProfile: "materials", capacity: 3, verticalMetres: 0.54 }])[0];
  const high = stockpileCellRecords([{ zone, cell: [1, 3, 0], priority: 2, filterProfile: "materials", capacity: 3, verticalMetres: 0.54 }])[0];
  const equal = stockpileCellRecords([{ zone, cell: [2, 3, 0], priority: 1, filterProfile: "materials", capacity: 3, verticalMetres: 0.54 }])[0];
  const source = entity("ground.source");
  const lowerLot = entity("lot.lower");
  const looseLot = entity("lot.loose");
  const rows = [
    ...[low, high, equal].flatMap(record => [
      row(record.id, StockpileCell, record.components[StockpileCell.id]), row(record.id, Container, { capacity: 3 }), row(record.id, Position, { x: 0, y: 3, z: 0, facing: 0 }),
    ]),
    row(source, GroundStock, {}), row(source, Container, { capacity: 5 }),
    row(lowerLot, MaterialLot, { kind: "wood", quantity: 2, container: low.id }),
    row(looseLot, MaterialLot, { kind: "wood", quantity: 2, container: source }),
    row(entity("claimed"), DeliveryTask, { actor: null, sourceLot: looseLot, source, destination: equal.id, material: "wood", quantity: 1, phase: "carrying" }),
  ];
  const state = fake(rows);
  const result = planStockpileDeliveries(state.context, { filterProfiles: { materials: { materialCategories: { wood: "building" }, allowedCategories: ["building"] } } });
  assert.equal(result.length, 1);
  assert.match(result[0], /stockpile\.delivery/);
  const created = rows.find(r => r.id === result[0])!.values.get(DeliveryTask.id) as { sourceLot: EntityId; destination: EntityId };
  assert.equal(created.sourceLot, lowerLot);
  assert.equal(created.destination, high.id);
});

test("profile deny and malformed profile leave physical lots untouched", () => {
  const zone = entity("zone");
  const record = stockpileCellRecords([{ zone, cell: [0, 3, 0], priority: 2, filterProfile: "food", capacity: 3, verticalMetres: 0.54 }])[0];
  const source = entity("ground.source.deny");
  const lot = entity("lot.stone.deny");
  const rows = [row(record.id, StockpileCell, record.components[StockpileCell.id]), row(record.id, Container, { capacity: 3 }), row(record.id, Position, { x: 0, y: 3, z: 0, facing: 0 }), row(source, GroundStock, {}), row(source, Container, { capacity: 3 }), row(lot, MaterialLot, { kind: "stone", quantity: 2, container: source })];
  const state = fake(rows);
  assert.deepEqual(planStockpileDeliveries(state.context, { filterProfiles: { food: { materialCategories: { stone: "building" }, allowedCategories: ["food"], deniedMaterials: ["stone"] } } }), []);
  assert.equal((rows.find(r => r.id === lot)!.values.get(MaterialLot.id) as { container: EntityId }).container, source);
  assert.deepEqual(planStockpileDeliveries(state.context, { filterProfiles: { food: { materialCategories: {}, allowedCategories: [] } } }), []);
});

test("capacity limits the planned partial quantity and equal priority is not a rehaul", () => {
  const zone = entity("zone.capacity");
  const destination = stockpileCellRecords([{ zone, cell: [0, 3, 0], priority: 2, filterProfile: "materials", capacity: 3, verticalMetres: 0.54 }])[0];
  const sourceCell = stockpileCellRecords([{ zone, cell: [1, 3, 0], priority: 2, filterProfile: "materials", capacity: 5, verticalMetres: 0.54 }])[0];
  const source = entity("ground.capacity");
  const rows = [
    row(destination.id, StockpileCell, destination.components[StockpileCell.id]), row(destination.id, Container, { capacity: 3 }), row(destination.id, Position, { x: 0, y: 1.89, z: 0, facing: 0 }),
    row(sourceCell.id, StockpileCell, sourceCell.components[StockpileCell.id]), row(sourceCell.id, Container, { capacity: 5 }), row(sourceCell.id, Position, { x: 1, y: 1.89, z: 0, facing: 0 }),
    row(entity("lot.in-cell"), MaterialLot, { kind: "wood", quantity: 2, container: sourceCell.id }),
    row(source, GroundStock, {}), row(source, Container, { capacity: 5 }), row(entity("lot.ground"), MaterialLot, { kind: "wood", quantity: 4, container: source }),
    row(entity("lot.already"), MaterialLot, { kind: "wood", quantity: 2, container: destination.id }),
  ];
  const state = fake(rows);
  const result = planStockpileDeliveries(state.context, { filterProfiles: { materials: { materialCategories: { wood: "building" }, allowedCategories: ["building"] } } });
  assert.equal(result.length, 1);
  const task = rows.find(r => r.id === result[0])!.values.get(DeliveryTask.id) as { quantity: number; sourceLot: EntityId };
  assert.equal(task.quantity, 1);
  assert.equal(task.sourceLot, source === source ? entity("lot.ground") : entity("never"));
});
