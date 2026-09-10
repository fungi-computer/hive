import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { wasmKernelPort } from "./wasm-kernel";
import { GameSession } from "./session";
import { colonyPack } from "../games/colony";
import { survivalPack, Condition } from "../games/survival";
import { formationsPack } from "../games/formations";
import { MaterialLot, Position, encodeDefinition } from "../sdk/common";
import { command, component, entity, query, system } from "../sdk/authoring";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("colony delivery reaches the guest through the actual WASM owner", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    session.command("deliver", { quantity: 1 });
    for (let i = 0; i < 100; i++) {
      session.step(0.1);
      const lot = session.query(query(MaterialLot)).find((row) => row.get(MaterialLot).container === "colony.worker.1");
      if (lot) { session.command("pauseDelivery", null); session.step(0.1); assert.equal(session.query(query(MaterialLot)).find((row) => row.id === lot.id)?.get(MaterialLot).container, "colony.worker.1"); session.command("resumeDelivery", null); break; }
    }
    for (let i = 0; i < 100; i++) session.step(0.1);
    const lots = session
      .query(query(MaterialLot))
      .map((row) => row.get(MaterialLot));
    assert.equal(
      lots.reduce((sum, lot) => sum + lot.quantity, 0),
      6,
    );
    assert.equal(
      lots
        .filter((lot) => lot.container === "colony.guest.1")
        .reduce((sum, lot) => sum + lot.quantity, 0),
      1,
    );
    assert.equal(colonyPack.presentation?.inspect({ query: (spec) => session.query(spec) }).find((fact) => fact.id === "delivery-phase")?.value, "complete");
  } finally {
    port.dispose();
  }
});

test("survival can take and eat successive split lots, including after restore", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: survivalPack });
    session.start();
    session.request({
      kind: "move",
      entity: entity("survival.survivor.1"),
      destination: { x: 2, y: 0, z: 0 },
    });
    for (let i = 0; i < 15; i++) session.step(0.1);
    for (let meal = 0; meal < 2; meal++) {
      session.command("takeFood", null);
      assert.equal(session.step(0.1)[0].accepted, true);
      session.command("eatFood", null);
      assert.equal(session.step(0.1)[0].accepted, true);
      session.restore(session.save());
      session.step(0.1);
    }
    assert.equal(
      session
        .query(query(MaterialLot))
        .reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0),
      6,
    );
    assert.ok(session.query(query(Condition))[0].get(Condition).hunger < 1);
  } finally {
    port.dispose();
  }
});

test("formation actors move independently through the same kernel", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: formationsPack });
    session.start();
    session.command("march", {
      entities: ["formations.unit.3", "formations.unit.1", "formations.unit.2"],
      destination: { x: 2, y: 0, z: 2 },
    });
    for (let i = 0; i < 20; i++) session.step(0.1);
    assert.deepEqual(
      session.query(query(Position)).map((row) => row.get(Position).z),
      [2, 2, 2],
    );
    assert.deepEqual(
      session.query(query(Position)).map((row) => row.get(Position).x),
      [1, 2, 3],
    );
  } finally {
    port.dispose();
  }
});

test("each pack exposes bounded facts and controls from its committed query", () => {
  for (const pack of [colonyPack, survivalPack, formationsPack]) {
    const port = wasmKernelPort(new WasmKernel());
    try {
      const session = new GameSession({ port, pack });
      session.start();
      const projection = pack.presentation?.inspect({ query: (spec) => session.query(spec) }) ?? [];
      assert.ok(projection.length > 0);
      assert.ok(projection.every((fact) => typeof fact.id === "string" && fact.label.length > 0));
      assert.ok((pack.presentation?.controls.length ?? 0) > 0);
    } finally { port.dispose(); }
  }
});

test("new TypeScript component and rule persist without rebuilding the kernel", () => {
  const Ripeness = component<{ amount: number; ripe: boolean }>(
    "orchard.ripeness",
    {
      version: 1,
      fields: { amount: "number", ripe: "boolean" },
    },
  );
  const fruit = entity("orchard.fruit");
  const ripen = system({
    id: "orchard.ripen",
    version: 1,
    reads: [Ripeness],
    writes: [Ripeness],
    run(ctx) {
      for (const row of ctx.query(query(Ripeness))) {
        const amount = row.get(Ripeness).amount + ctx.clock.delta;
        ctx.write(Ripeness, row.id, { amount, ripe: amount >= 1 });
      }
    },
  });
  const pack = {
    id: "orchard",
    version: 1,
    components: [Ripeness],
    systems: [ripen],
    definition: encodeDefinition(
      "orchard",
      [Ripeness],
      [
        {
          id: fruit,
          components: { "orchard.ripeness": { amount: 0, ripe: false } },
        },
      ],
    ),
  };
  const first = wasmKernelPort(new WasmKernel());
  const second = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port: first, pack });
    session.start();
    session.step(0.5);
    const restored = new GameSession({ port: second, pack });
    restored.restore(session.save());
    restored.step(0.5);
    assert.deepEqual(restored.query(query(Ripeness))[0].get(Ripeness), {
      amount: 1,
      ripe: true,
    });
    assert.deepEqual(session.query(query(Ripeness))[0].get(Ripeness), {
      amount: 0.5,
      ripe: false,
    });
  } finally {
    first.dispose();
    second.dispose();
  }
});

test("authored intents survive pause restore and rollback with committed-only reads", () => {
  const Setting = component<{ value: number; link: string | null }>(
    "intent.setting",
    { version: 1, fields: { value: "number", link: "nullable-entity" } },
  );
  const Seen = component<{ value: number }>("intent.seen", {
    version: 1,
    fields: { value: "number" },
  });
  const id = entity("intent.actor");
  let fail = false;
  const pack = {
    id: "intents",
    version: 1,
    components: [Setting, Seen],
    definition: encodeDefinition(
      "intents",
      [Setting, Seen],
      [
        {
          id,
          components: {
            "intent.setting": { value: 1, link: null },
            "intent.seen": { value: 0 },
          },
        },
      ],
    ),
    commands: {
      set: command({
        reads: [],
        writes: [Setting],
        run: (_ctx, input) => ({
          actions: [],
          writes: [{ component: Setting.id, entity: id, value: input }],
        }),
      }),
      mutate: command({
        reads: [Setting],
        writes: [],
        run: (ctx) => {
          ctx.query(query(Setting))[0].get(Setting).value = 99;
          throw new Error("stop");
        },
      }),
    },
    systems: [
      system({
        id: "intent.observe",
        version: 1,
        reads: [Setting],
        writes: [Seen],
        run(ctx) {
          if (fail) throw new Error("injected");
          ctx.write(Seen, id, {
            value: ctx.query(query(Setting))[0].get(Setting).value,
          });
        },
      }),
    ],
  };
  const a = wasmKernelPort(new WasmKernel()),
    b = wasmKernelPort(new WasmKernel());
  try {
    const first = new GameSession({ port: a, pack });
    first.start();
    first.pause();
    first.command("set", { value: 2, link: id });
    first.command("set", { value: 3, link: id });
    assert.equal(first.save().pendingWrites.length, 1);
    assert.equal(first.query(query(Setting))[0].get(Setting).value, 1);
    const saved = first.save();
    assert.throws(() => first.command("mutate", null), /stop/);
    assert.deepEqual(first.save(), saved);
    assert.throws(
      () => first.command("set", { value: 4, link: "missing" }),
      /reference/,
    );
    assert.deepEqual(first.save(), saved);
    first.step(0.1);
    assert.deepEqual(first.save(), saved);
    const restored = new GameSession({ port: b, pack });
    restored.restore(saved);
    assert.deepEqual(restored.save(), saved);
    const forged = {
      ...structuredClone(saved),
      pendingWrites: [...saved.pendingWrites],
    };
    forged.pendingWrites[0] = {
      component: Seen.id,
      entity: id,
      value: { value: 9 },
    };
    assert.throws(() => restored.restore(forged), /undeclared/);
    assert.deepEqual(restored.save(), saved);
    restored.resume();
    const beforeFailure = restored.save();
    fail = true;
    assert.throws(() => restored.step(0.1), /injected/);
    assert.deepEqual(restored.save(), beforeFailure);
    fail = false;
    restored.step(0.1);
    assert.equal(restored.query(query(Seen))[0].get(Seen).value, 3);
    assert.equal(restored.query(query(Setting))[0].get(Setting).value, 3);
    assert.equal(restored.save().pendingWrites.length, 0);
  } finally {
    a.dispose();
    b.dispose();
  }
});
