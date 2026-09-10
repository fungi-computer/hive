import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { colonyPack } from "../games/colony";
import { DeliveryTask } from "../sdk/delivery";
import { MaterialLot, Position } from "../sdk/common";
import { query, entity } from "../sdk/authoring";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

const makeSession = () => {
  const port = wasmKernelPort(new WasmKernel());
  return { port, session: new GameSession({ port, pack: colonyPack }) };
};

test("selected workers receive distinct finite delivery tasks", () => {
  const { port, session } = makeSession();
  try {
    session.start();
    session.command("deliver", {
      quantity: 2,
      entities: [entity("colony.worker.1"), entity("colony.worker.2")],
    });
    session.step(0.1);
    const actors = session
      .query(query(DeliveryTask))
      .map((row) => row.get(DeliveryTask).actor);
    assert.deepEqual(new Set(actors), new Set(["colony.worker.1", "colony.worker.2"]));
    assert.throws(
      () => session.command("deliver", { quantity: 1, entities: [] }),
      /select at least one worker/,
    );
    for (let tick = 0; tick < 160; tick++) session.step(0.1);
    const lots = session.query(query(MaterialLot)).map((row) => row.get(MaterialLot));
    assert.equal(lots.reduce((sum, lot) => sum + lot.quantity, 0), 6);
    assert.equal(
      lots
        .filter((lot) => lot.container === "colony.guest.1")
        .reduce((sum, lot) => sum + lot.quantity, 0),
      4,
    );
    assert.throws(
      () => session.command("deliver", { quantity: 1, entities: ["colony.guest.1"] }),
      /selection must contain distinct colony workers/,
    );
  } finally {
    port.dispose();
  }
});

test("paused carrying custody survives restore and resumes delivery", () => {
  const first = makeSession();
  const restored = makeSession();
  try {
    first.session.start();
    first.session.command("deliver", {
      quantity: 1,
      entities: [entity("colony.worker.1")],
    });
    let carrying = false;
    for (let tick = 0; tick < 100; tick++) {
      first.session.step(0.1);
      carrying = first.session
        .query(query(MaterialLot))
        .some((row) => row.get(MaterialLot).container === "colony.worker.1");
      if (carrying) break;
    }
    assert.equal(carrying, true);
    first.session.command("pauseDelivery", {
      entities: [entity("colony.worker.1")],
    });
    first.session.step(0.1);
    const paused = first.session
      .query(query(Position))
      .find((row) => row.id === "colony.worker.1")
      ?.get(Position);
    const saved = first.session.save();
    restored.session.restore(saved);
    for (let tick = 0; tick < 3; tick++) restored.session.step(0.1);
    assert.deepEqual(
      restored.session
        .query(query(Position))
        .find((row) => row.id === "colony.worker.1")
        ?.get(Position),
      paused,
    );
    assert.equal(
      restored.session
        .query(query(MaterialLot))
        .some((row) => row.get(MaterialLot).container === "colony.worker.1"),
      true,
    );
    restored.session.command("resumeDelivery", {
      entities: [entity("colony.worker.1")],
    });
    for (let tick = 0; tick < 120; tick++) restored.session.step(0.1);
    const lots = restored.session.query(query(MaterialLot)).map((row) => row.get(MaterialLot));
    assert.equal(lots.reduce((sum, lot) => sum + lot.quantity, 0), 6);
    assert.ok(
      lots
        .filter((lot) => lot.container === "colony.guest.1")
        .reduce((sum, lot) => sum + lot.quantity, 0) >= 1,
    );
  } finally {
    first.port.dispose();
    restored.port.dispose();
  }
});

test("missing delivery quantity rejects without changing accepted intent", () => {
  const { port, session } = makeSession();
  try {
    session.start();
    session.command("deliver", { quantity: 2, entities: ["colony.worker.1"] });
    session.step(0.1);
    const before = session.save();
    assert.throws(
      () => session.command("deliver", { entities: ["colony.worker.1"] }),
      /quantity/,
    );
    assert.deepEqual(session.save(), before);
  } finally {
    port.dispose();
  }
});

test("completed delivery rejects a new command instead of duplicating custody", () => {
  const { port, session } = makeSession();
  try {
    session.start();
    session.command("deliver", {
      quantity: 1,
      entities: [entity("colony.worker.1")],
    });
    for (let tick = 0; tick < 160; tick++) session.step(0.1);
    assert.throws(
      () => session.command("deliver", { quantity: 2, entities: [entity("colony.worker.1")] }),
      /completed delivery cannot be restarted/,
    );
  } finally {
    port.dispose();
  }
});
