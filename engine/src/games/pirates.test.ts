import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import {
  piratesPack,
  chestId,
  crewOneId,
  crewTwoId,
  holdId,
  shipId,
} from "./pirates";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { MaterialLot, SupplyAllocation } from "../sdk/common";
import { WorkParticipation } from "../sdk/work-control";
import { query } from "../sdk/authoring";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("pirate ship movement carries supported crew without changing local pose", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: piratesPack });
    session.start();
    const before = port.worldPoses([shipId, crewOneId]);
    session.command("move", {
      entities: [shipId],
      destination: { x: 3, y: 0, z: 0, frame: null },
    });
    for (let tick = 0; tick < 30; tick++) session.step(0.1);
    const after = port.worldPoses([shipId, crewOneId]);
    assert.notEqual(
      after.find((pose) => pose.id === shipId)?.world.x,
      before.find((pose) => pose.id === shipId)?.world.x,
    );
    assert.equal(
      after.find((pose) => pose.id === crewOneId)?.local.x,
      before.find((pose) => pose.id === crewOneId)?.local.x,
    );
    assert.equal(after.find((pose) => pose.id === crewOneId)?.support, shipId);
  } finally {
    port.dispose();
  }
});

test("pirate crew route stays on the ship frame and rejects mixed-frame movement", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: piratesPack });
    session.start();
    assert.throws(
      () =>
        session.command("move", {
          entities: [crewOneId],
          destination: { x: 0, y: 1, z: 0, frame: null },
        }),
      /ship frame/,
    );
    session.command("move", {
      entities: [crewOneId],
      destination: { x: 1, y: 1, z: 1, frame: shipId },
    });
    for (let tick = 0; tick < 30; tick++) session.step(0.1);
    const pose = port.worldPoses([crewOneId])[0];
    assert.equal(pose.support, shipId);
    assert.ok(pose.local.x > -1);
    assert.throws(
      () =>
        session.command("move", {
          entities: [chestId],
          destination: { x: 1, y: 1, z: 1, frame: shipId },
        }),
      /matching frame/,
    );
    assert.throws(
      () =>
        session.command("move", {
          entities: [shipId, crewOneId],
          destination: { x: 1, y: 0, z: 0, frame: null },
        }),
      /matching frame/,
    );
  } finally {
    port.dispose();
  }
});

test("pirate cargo uses shared hauling through translated/rotated frames and in-flight recovery", () => {
  for (const facing of [0, 1, 2, 3]) {
    const port = wasmKernelPort(new WasmKernel());
    const restoredPort = wasmKernelPort(new WasmKernel());
    try {
      let session = new GameSession({ port, pack: piratesPack });
      session.start();
      session.command("move", { entities: [shipId], destination: { x: 5, y: 0, z: -2, frame: null } });
      for (let tick = 0; tick < 50; tick++) session.step(0.1);
      session.command("turnShip", { facing }); session.step(0);
      session.command("loadCargo", { entities: [crewOneId, crewTwoId] });
      let recoveredInFlight = false;
      for (let tick = 0; tick < 160; tick++) {
        session.step(0.1);
        const lots = session.query(query(MaterialLot)).map(row => row.get(MaterialLot));
        assert.equal(lots.reduce((sum, lot) => sum + lot.quantity, 0), 7);
        if (!recoveredInFlight && lots.some(lot => lot.container === crewOneId || lot.container === crewTwoId)) {
          const saved = session.save();
          session = new GameSession({ port: restoredPort, pack: piratesPack });
          session.restore(saved);
          assert.deepEqual(session.save(), saved);
          recoveredInFlight = true;
        }
        const heldKinds = new Set(lots.filter(lot => lot.container === holdId && lot.quantity > 0).map(lot => lot.kind));
        if (
          heldKinds.has("bread") &&
          heldKinds.has("wood") &&
          session.query(query(SupplyAllocation)).length === 0
        ) break;
      }
      assert(recoveredInFlight, `heading ${facing} never picked up cargo`);
      const cargo = session.query(query(MaterialLot)).map(row => row.get(MaterialLot));
      assert.equal(cargo.filter(lot => lot.container === holdId).reduce((sum, lot) => sum + lot.quantity, 0), 2);
      assert.equal(cargo.filter(lot => lot.kind === "bread").reduce((sum, lot) => sum + lot.quantity, 0), 4);
      assert.equal(cargo.filter(lot => lot.kind === "wood").reduce((sum, lot) => sum + lot.quantity, 0), 3);
      assert.equal(session.query(query(SupplyAllocation)).length, 0,
        "delivered obligations retire after both declared materials reach the hold");
      assert.deepEqual(
        cargo.filter(lot => lot.container === holdId).map(lot => lot.kind).sort(),
        ["bread", "wood"],
        "the hold receives both authored cargo kinds through shared allocation and transfer owners",
      );
      assert.equal(cargo.reduce((sum, lot) => sum + lot.quantity, 0), 7);
      session.restore(session.save());
      for (let tick = 0; tick < 20; tick++) session.step(0.1);
      assert.equal(session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).container === holdId).reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 2, "terminal completion cannot repeat after recovery");
    } finally { port.dispose(); restoredPort.dispose(); }
  }
});

test("Pirates commands require the owning player party, including authored work participation", () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: piratesPack });
  try {
    session.start();
    for (const [name, input] of [
      ["loadCargo", { entities: [crewOneId] }],
      ["turnShip", { facing: 2 }],
      ["move", { entities: [shipId], destination: { x: 2, y: 0, z: 0, frame: null } }],
    ] as const) assert.throws(() => session.command(name, input, { kind: "player", player: "outsider" }), /party control/);
    assert(session.query(query(WorkParticipation)).every(row => !row.get(WorkParticipation).automatic));
  } finally { port.dispose(); }
});

test("pirate facing controls rotate the supported crew through all four headings", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: piratesPack });
    session.start();
    for (const facing of [1, 2, 3, 0]) {
      session.command("turnShip", { facing });
      session.step(0.1);
      const [ship, crew] = port.worldPoses([shipId, crewOneId]);
      assert.equal(ship.world.facing, facing);
      assert.equal(crew.local.x, -1);
      assert.equal(crew.local.z, 0);
      const angle = facing * Math.PI / 2;
      assert.ok(Math.abs(crew.world.x + Math.cos(angle)) < 1e-6);
      assert.ok(Math.abs(crew.world.z + Math.sin(angle)) < 1e-6);
    }
  } finally { port.dispose(); }
});
