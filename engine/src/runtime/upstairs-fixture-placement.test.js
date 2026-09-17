import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

const structure = (id, shape) => ({
  id, shape, workReachBelowCells: 0,
  materials: [{ kind: "wood", quantity: 1 }], workSeconds: 1,
});

function kernel() {
  const value = new WasmKernel();
  value.load(JSON.stringify({
    format: "hive-game", version: 3, game: "upstairs-placement",
    components: [], materialCatalog: [{ kind: "wood", unitVolume: 1 }],
    initial: [{ id: "party", components: { "hive.party": {}, "hive.owned-by": { player: "player" } } }],
  }));
  value.load_environment(JSON.stringify({
    world: {
      seed: "upstairs-placement-v1", identity: "upstairs-placement",
      bounds: { minX: -8, maxX: 8, minY: -8, maxY: 40, minZ: -8, maxZ: 8 },
      slots: { air: 0, soil: 1, stone: 2 }, seaLevel: 12, verticalMetres: 0.54,
    },
    structures: { maxSpanSteps: 6, catalog: [
      structure("floor", { kind: "floor" }),
      structure("wall", { kind: "wall", height: 4 }),
      structure("bed", { kind: "fixture", footprint: [[0, 0], [0, 1]] }),
    ] },
    materials: [
      { slot: 0, solid: false, diggable: false, water: { kind: "open" } },
      { slot: 1, solid: true, diggable: true, water: { kind: "closed" } },
      { slot: 2, solid: true, diggable: true, water: { kind: "closed" } },
    ],
    water: { id: "water", cells: [[0, -7, 0]], fallMPerS: 0.1, spreadMPerS: 0.1 },
  }));
  return value;
}

const rotation = {
  north: { offset: [0, 1], axis: "z" },
  east: { offset: [-1, 0], axis: "x" },
  south: { offset: [0, -1], axis: "z" },
  west: { offset: [1, 0], axis: "x" },
};

function upstairsPlans(value, orientation) {
  const surface = JSON.parse(value.terrain_surfaces(JSON.stringify([[0, 0]])))[0].cell;
  const [dx, dz] = rotation[orientation].offset;
  const first = { x: surface[0], y: surface[1] + 4, z: surface[2] };
  const second = { x: first.x + dx, y: first.y, z: first.z + dz };
  const edge = {
    x: Math.min(first.x, second.x), y: surface[1] + 1, z: Math.min(first.z, second.z),
  };
  return [
    { site: `wall-${orientation}`, catalog: "wall", target: { kind: "edge", edge: { cell: edge, axis: rotation[orientation].axis } } },
    { site: `floor-head-${orientation}`, catalog: "floor", target: { kind: "cell", cell: first, orientation: "north" } },
    { site: `floor-foot-${orientation}`, catalog: "floor", target: { kind: "cell", cell: second, orientation: "north" } },
    { site: `bed-${orientation}`, catalog: "bed", target: { kind: "cell", cell: { ...first, y: first.y + 1 }, orientation } },
  ];
}

const decision = (value, candidates) => JSON.parse(value.placement_decisions(JSON.stringify({ party: "party", candidates })));
const admit = (value, candidates) => JSON.parse(value.advance(JSON.stringify({
  delta: 0, writes: [], actions: [{ scope: { kind: "host" }, request: { kind: "plan-constructions", party: "party", plans: candidates } }],
})));

test("the real WASM requires both upper-floor cells beneath a bed in every rotation", () => {
  for (const orientation of Object.keys(rotation)) {
    const complete = kernel();
    try {
      const plans = upstairsPlans(complete, orientation);
      assert.ok(decision(complete, plans).decisions.every(row => row.status === "ready"), orientation);
      assert.equal(admit(complete, plans).results[0].accepted, true, orientation);
    } finally { complete.free(); }

    for (const missingFloor of [1, 2]) {
      const partial = kernel();
      try {
        const plans = upstairsPlans(partial, orientation).filter((_, index) => index !== missingFloor);
        const preview = decision(partial, plans);
        assert.ok(preview.decisions.every(row => row.status === "rejected"), `${orientation} missing ${missingFloor}`);
        assert.equal(admit(partial, plans).results[0].accepted, false, `${orientation} missing ${missingFloor}`);
      } finally { partial.free(); }
    }
  }
});
