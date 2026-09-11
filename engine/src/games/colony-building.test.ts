import { test } from "node:test";
import { strict as assert } from "node:assert";
import { colonyBuildCommand } from "./colony-building";

test("building command uses physical support and preserves four stair directions", () => {
  for (const orientation of ["north", "east", "south", "west"]) {
    const result = colonyBuildCommand.run({
      query: () => [],
      physicalContacts: cells => {
        assert.equal(cells.length, 24);
        return cells.map((_, index) => ({ solid: false, sealedTop: index === 0, outside: false }));
      },
    }, { catalog: "timber-stair", orientation, target: { cell: [0, 17, 0], material: 999 } });
    assert.equal(result.actions.length, 1);
    const action = result.actions[0];
    assert.equal(action.kind, "plan-construction");
    if (action.kind !== "plan-construction") throw new Error("wrong action");
    assert.equal(action.orientation, orientation);
    assert.equal(action.y, 17);
    assert.deepEqual(action.contact, { x: -1, y: 17.5 * 0.54, z: 0, frame: null });
  }
});
test("building without an adjacent working surface rejects without actions", () => {
  assert.throws(() => colonyBuildCommand.run({ query: () => [], physicalContacts: cells => cells.map(() => ({ solid: false, sealedTop: false, outside: false })) },
    { catalog: "timber-wall", orientation: "north", target: { cell: [0, 17, 0] } }), /No clear working surface/);
});
