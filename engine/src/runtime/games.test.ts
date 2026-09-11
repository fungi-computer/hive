import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { wasmKernelPort } from "./wasm-kernel";
import { GameSession } from "./session";
import { WorkerRuntime } from "./worker";
import { readKernelEntities } from "./kernel-records";
import type { WorkerEvent, WorkerTransportEvent } from "./protocol";
import { colonyPack } from "../games/colony";
import { survivalPack, Condition, Fatigue } from "../games/survival";
import { formationsPack, FormationMember } from "../games/formations";
import { MaterialLot, Position, encodeDefinition } from "../sdk/common";
import { command, component, entity, query, system } from "../sdk/authoring";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("display frames identify time and reset discontinuities", () => {
  let runtime!: WorkerRuntime;
  try {
    const events: WorkerTransportEvent[] = [];
    runtime = new WorkerRuntime(
      () => wasmKernelPort(new WasmKernel()),
      { survival: survivalPack },
      (event) => events.push(event),
    );
    runtime.command({ type: "start", game: "survival" });
    runtime.command({ type: "step", delta: 0.1 });
    runtime.command({ type: "pause" });
    runtime.command({ type: "step", delta: 0.1 });
    runtime.command({ type: "reset" });
    assert.deepEqual(
      events.filter((event) => event.type === "error"),
      [],
    );
    const frames = events.filter((event) => event.type === "frame");
    assert.deepEqual(
      frames.map(({ time, epoch, sequence }) => [time, epoch, sequence]),
      [
        [0, 1, 1],
        [0.1, 1, 2],
        [0.1, 1, 3],
        [0, 2, 4],
      ],
    );
  } finally {
    runtime.dispose();
  }
});

test("worker factory failure leaves no disposed handle as live state", () => {
  let allocations = 0;
  let disposals = 0;
  let failFactory = false;
  const runtime = new WorkerRuntime(
    () => {
      allocations++;
      if (failFactory) throw new Error("factory failed");
      const inner = wasmKernelPort(new WasmKernel());
      return { ...inner, dispose: () => { disposals++; inner.dispose(); } };
    },
    { survival: survivalPack },
    () => undefined,
  );
  runtime.command({ type: "start", game: "survival" });
  failFactory = true;
  runtime.command({ type: "step", delta: 2 });
  assert.equal(allocations, 2);
  assert.equal(disposals, 1);
  runtime.dispose();
});

test("native assignment chooses joint pairs without mutating the world", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    const before = session.save();
    const candidates = [
      { worker: entity("worker.1"), task: entity("task.1"), cost: 1 },
      { worker: entity("worker.1"), task: entity("task.2"), cost: 2 },
      { worker: entity("worker.2"), task: entity("task.1"), cost: 2 },
    ];
    assert.deepEqual(session.assign(candidates), [
      { worker: "worker.1", task: "task.2", cost: 2 },
      { worker: "worker.2", task: "task.1", cost: 2 },
    ]);
    assert.deepEqual(
      session.assign([...candidates].reverse()),
      session.assign(candidates),
    );
    assert.deepEqual(session.save(), before);
  } finally {
    port.dispose();
  }
});

test("independently authored fatigue follows movement and survives restore", () => {
  const port = wasmKernelPort(new WasmKernel());
  const restoredPort = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: survivalPack });
    session.start();
    const fatigue = (world: GameSession) =>
      world.query(query(Fatigue))[0].get(Fatigue);
    session.step(0.1);
    assert.equal(fatigue(session).value, 0);
    session.request({
      kind: "move",
      entity: entity("survival.survivor.1"),
      destination: { x: 2, y: 0, z: 0, frame: null },
    });
    session.step(0.1);
    session.step(0.1);
    assert.ok(fatigue(session).value > 0);
    for (let i = 0; i < 10; i++) session.step(0.1);
    const saved = session.save();
    const restored = new GameSession({
      port: restoredPort,
      pack: survivalPack,
    });
    restored.restore(saved);
    assert.deepEqual(fatigue(restored), fatigue(session));
    const before = fatigue(session).value;
    for (let i = 0; i < 5; i++) {
      session.step(0.1);
      restored.step(0.1);
    }
    assert.ok(fatigue(session).value < before);
    assert.deepEqual(restored.save(), session.save());
  } finally {
    port.dispose();
    restoredPort.dispose();
  }
});

test("colony delivery reaches the guest through the actual WASM owner", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    session.command("deliver", { quantity: 1, entities: ["colony.worker.1"] });
    let interrupted = false;
    for (let i = 0; i < 100; i++) {
      session.step(0.1);
      const lot = session
        .query(query(MaterialLot))
        .find((row) => row.get(MaterialLot).container === "colony.worker.1");
      if (lot) interrupted = true;
      if (lot) {
        session.command("pauseDelivery", { entities: ["colony.worker.1"] });
        session.step(0.1);
        const pausedPosition = session
          .query(query(Position))
          .find((row) => row.id === "colony.worker.1")
          ?.get(Position);
        for (let pauseTick = 0; pauseTick < 3; pauseTick++) session.step(0.1);
        assert.deepEqual(
          session
            .query(query(Position))
            .find((row) => row.id === "colony.worker.1")
            ?.get(Position),
          pausedPosition,
        );
        assert.equal(
          session
            .query(query(MaterialLot))
            .find((row) => row.id === lot.id)
            ?.get(MaterialLot).container,
          "colony.worker.1",
        );
        session.command("resumeDelivery", { entities: ["colony.worker.1"] });
        break;
      }
    }
    assert.equal(
      interrupted,
      true,
      "delivery must reach carried custody before pause",
    );
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
    assert.equal(
      colonyPack.presentation
        ?.inspect({ query: (spec) => session.query(spec) })
        .find((fact) => fact.id === "delivery-phase-1")?.value,
      "complete",
    );
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
      destination: { x: 2, y: 0, z: 0, frame: null },
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
      destination: { x: 2, y: 0, z: 2, frame: null },
    });
    // The authored crate requires a detour; allow four seconds at 1.5 cells/s.
    for (let i = 0; i < 40; i++) session.step(0.1);
    assert.deepEqual(
      session
        .query(query(Position, FormationMember))
        .map((row) => row.get(Position).z),
      [2, 2, 2],
    );
    assert.deepEqual(
      session
        .query(query(Position, FormationMember))
        .map((row) => row.get(Position).x),
      [1, 2, 3],
    );
  } finally {
    port.dispose();
  }
});

test("formation settings change actual march and retreat destinations", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: formationsPack });
    session.start();
    session.command("setFacing", { facing: 1 });
    session.command("march", {
      entities: ["formations.unit.1", "formations.unit.2", "formations.unit.3"],
      destination: { x: 4, y: 0, z: 3, frame: null },
    });
    for (let i = 0; i < 60; i++) session.step(0.1);
    const positions = () =>
      session
        .query(query(Position, FormationMember))
        .map((row) => row.get(Position));
    assert.deepEqual(
      positions().map(({ x, z }) => [x, z]),
      [
        [4, 2],
        [4, 3],
        [4, 4],
      ],
    );
    session.command("setRetreatThreshold", { retreatBelow: 90 });
    for (let i = 0; i < 120; i++) session.step(0.1);
    assert.ok(positions().every(({ x, z }) => x === -4 && z === -4));
  } finally {
    port.dispose();
  }
});

test("authored meal recovery changes the physical consumption outcome", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: survivalPack });
    session.start();
    session.command("setMealRule", { recovery: 10 });
    session.request({
      kind: "move",
      entity: entity("survival.survivor.1"),
      destination: { x: 2, y: 0, z: 0, frame: null },
    });
    for (let i = 0; i < 15; i++) session.step(0.1);
    session.command("takeFood", null);
    assert.equal(session.step(0.1)[0].accepted, true);
    session.command("eatFood", null);
    assert.equal(session.step(0.1)[0].accepted, true);
    const before = session.query(query(Condition))[0].get(Condition).hunger;
    session.step(0.1);
    assert.equal(
      session.query(query(Condition))[0].get(Condition).hunger,
      before + 0.05 - 10,
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
      const projection =
        pack.presentation?.inspect({ query: (spec) => session.query(spec) }) ??
        [];
      assert.ok(projection.length > 0);
      assert.ok(
        projection.every(
          (fact) => typeof fact.id === "string" && fact.label.length > 0,
        ),
      );
      assert.ok((pack.presentation?.controls.length ?? 0) > 0);
    } finally {
      port.dispose();
    }
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
    assert.throws(() => restored.save(), /session-poisoned/);
    fail = false;
    restored.restore(beforeFailure);
    restored.step(0.1);
    assert.equal(restored.query(query(Seen))[0].get(Seen).value, 3);
    assert.equal(restored.query(query(Setting))[0].get(Setting).value, 3);
    assert.equal(restored.save().pendingWrites.length, 0);

    const workerEvents: WorkerTransportEvent[] = [];
    const worker = new WorkerRuntime(
      () => wasmKernelPort(new WasmKernel()),
      { intents: pack },
      event => workerEvents.push(event),
    );
    worker.command({ type: "start", game: "intents" });
    worker.command({ type: "pause" });
    worker.command({ type: "command", name: "set", input: { value: 3, link: id } });
    worker.command({ type: "resume" });
    fail = true;
    worker.command({ type: "step", delta: 0.1 });
    fail = false;
    worker.command({ type: "step", delta: 0.1 });
    worker.command({ type: "save" });
    assert.equal(workerEvents.filter(event => event.type === "error").length, 1);
    assert.equal(workerEvents.filter(event => event.type === "results").length, 1);
    const savedWorker = workerEvents.filter(event => event.type === "saved").at(-1);
    assert.ok(savedWorker && savedWorker.type === "saved");
    const workerEntities = readKernelEntities(savedWorker.snapshot.kernel);
    const savedSetting = (workerEntities.scene.initial[0] as { components: Record<string, { value: number }> }).components[Setting.id];
    assert.equal(savedSetting.value, 3);
    worker.dispose();
  } finally {
    a.dispose();
    b.dispose();
  }
});
