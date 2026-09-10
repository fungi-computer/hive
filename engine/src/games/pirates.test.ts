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
import { MaterialLot, Position } from "../sdk/common";
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

test("pirate cargo stays finite through delivery and save reload", () => {
  const port = wasmKernelPort(new WasmKernel());
  const restoredPort = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: piratesPack });
    session.start();
    session.command("loadCargo", { entities: [crewOneId, crewTwoId] });
    for (let tick = 0; tick < 100; tick++) session.step(0.1);
    const lots = session
      .query(query(MaterialLot))
      .map((row) => row.get(MaterialLot));
    assert.equal(
      lots.reduce((sum, lot) => sum + lot.quantity, 0),
      7,
    );
    assert.ok(lots.some((lot) => lot.container === holdId));
    const saved = session.save();
    const restored = new GameSession({ port: restoredPort, pack: piratesPack });
    restored.restore(saved);
    assert.deepEqual(restored.save(), saved);
    assert.equal(restored.query(query(Position)).length, 6);
  } finally {
    port.dispose();
    restoredPort.dispose();
  }
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
