import test from "node:test";
import assert from "node:assert/strict";
import { entity } from "../sdk/authoring.js";
import { Body, Destination, Position, Traversal } from "../sdk/common.js";
import { Cat, catInitial, colonyCatSystem } from "./colony-cat.js";

function context(rows: readonly any[], outcomes: readonly any[] = [], now = 0) {
  const actions: any[] = [];
  const writes: any[] = [];
  return {
    actions,
    writes,
    clock: { now, delta: 1, tick: now },
    outcomes,
    random: { next: () => 0.5 },
    query(spec: any) {
      return rows.filter(row => spec.components.every((component: any) => row.components.has(component.id)));
    },
    action(value: any) { actions.push(value); },
    write(component: any, id: string, value: unknown) { writes.push([component, id, value]); },
  } as any;
}

const home = entity("colony.rowan");
const cat = entity("colony.cat");
function row(id: string, values: readonly [any, unknown][]) {
  const map = new Map(values.map(([component, value]) => [component.id, value]));
  return { id, components: map, get(component: any) { return map.get(component.id); } };
}

test("cat submits bounded native movement near its authored home", () => {
  const initial = catInitial(cat, home, { x: 0, y: 0, z: 0 });
  const values = [
    row(cat, [[Cat, initial.components[Cat.id]], [Position, initial.components[Position.id]], [Body, initial.components[Body.id]], [Traversal, initial.components[Traversal.id]]]),
    row(home, [[Position, { x: 2, y: 0, z: -1, facing: 0 }]]),
  ];
  const ctx = context(values);
  colonyCatSystem.run(ctx);
  assert.equal(ctx.actions.length, 1);
  assert.equal(ctx.actions[0].kind, "move");
  assert.equal(ctx.actions[0].entity, cat);
  assert.ok(Math.hypot(ctx.actions[0].destination.x - 2, ctx.actions[0].destination.z + 1) <= 4);
  assert.equal(Number.isInteger(ctx.actions[0].destination.x), true);
  assert.equal(Number.isInteger(ctx.actions[0].destination.z), true);
  assert.equal(ctx.writes.length, 1);
});

test("cat waits for an existing native destination and retries when its home is absent", () => {
  const initial = catInitial(cat, home, { x: 0, y: 0, z: 0 });
  const catRow = row(cat, [[Cat, initial.components[Cat.id]], [Position, initial.components[Position.id]], [Body, initial.components[Body.id]], [Traversal, initial.components[Traversal.id]]]);
  const destination = row(cat, [[Destination, { x: 1, y: 0, z: 1, facing: 0, frame: null }]]);
  const occupied = context([catRow, destination]);
  colonyCatSystem.run(occupied);
  assert.equal(occupied.actions.length, 0);
  const missingHome = context([catRow], [], 2);
  colonyCatSystem.run(missingHome);
  assert.equal(missingHome.actions.length, 0);
  assert.equal(missingHome.writes.length, 1);
});

test("rejected native routes back off without owning pathfinding", () => {
  const initial = catInitial(cat, home, { x: 0, y: 0, z: 0 });
  const values = [row(cat, [[Cat, initial.components[Cat.id]], [Position, initial.components[Position.id]], [Body, initial.components[Body.id]], [Traversal, initial.components[Traversal.id]]]), row(home, [[Position, { x: 0, y: 0, z: 0, facing: 0 }]])];
  const ctx = context(values, [{ action: { kind: "move", entity: cat }, result: { accepted: false } }]);
  colonyCatSystem.run(ctx);
  assert.equal(ctx.actions.length, 0);
  const written = ctx.writes[0][2];
  assert.equal(written.blockedUntil, 1);
  assert.equal(written.nextAt, 1);
});
