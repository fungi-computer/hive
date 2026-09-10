import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

assert(
  process.argv[2] === "--output" &&
    (process.argv.length === 4 ||
      (process.argv.length === 6 && process.argv[4] === "--pack")),
  "Usage: node proof.mjs --output <directory> [--pack survival|pirates]",
);
const packId = process.argv[5] ?? "survival";
assert(packId === "survival" || packId === "pirates", "unsupported proof pack");
const directory = fileURLToPath(new URL(".", import.meta.url));
const output = resolve(process.argv[3]);
await mkdir(dirname(output), { recursive: true });
await mkdir(output);
const secrets = Object.fromEntries(
  ["WRITER_SECRET", "HOST_SECRET", "DEBUG_SECRET"].map((key) => [
    key,
    randomBytes(32).toString("hex"),
  ]),
);
const files = [
  "../../src/engine/region/codec.ts",
  "../../src/engine/region/index.ts",
  "../../engine/src/contracts.ts",
  "../../engine/src/runtime/actions.ts",
  "../../engine/src/runtime/region-program.ts",
  "../../engine/src/runtime/session.ts",
  "../../engine/src/runtime/wasm-kernel.ts",
  "../../engine/src/sdk/authoring.ts",
  "../../engine/src/sdk/common.ts",
  "../../engine/src/sdk/delivery.ts",
  "../../engine/src/games/survival.ts",
  "../../engine/src/games/pirates.ts",
  "../../engine/generated/hive_kernel.js",
  "../../engine/generated/hive_kernel.d.ts",
  "../../engine/generated/hive_kernel_bg.wasm",
  "./worker.ts",
];
const hash = createHash("sha256");
for (const relative of [...files].sort()) {
  hash.update(relative);
  hash.update("\0");
  hash.update(await readFile(resolve(directory, relative)));
  hash.update("\0");
}
const config = JSON.parse(
  await readFile(resolve(directory, "wrangler.json"), "utf8"),
);
config.main = resolve(directory, "worker.ts");
config.vars = {
  ...secrets,
  IMPLEMENTATION_HASH: hash.digest("hex"),
  PROOF_PACK: packId,
};
const configPath = resolve(output, "wrangler.json");
await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
const port = 8789;
const endpoint = `http://127.0.0.1:${port}`;
let child;
let childExit;
let starts = 0;
function safeLog(log) {
  let text = log.replace(
    /^.*(?:WRITER_SECRET|HOST_SECRET|DEBUG_SECRET).*$/gm,
    "[harness binding redacted]",
  );
  for (const secret of Object.values(secrets))
    text = text.replaceAll(secret, "[harness-secret]");
  return text;
}
async function freePort() {
  const server = createServer();
  await new Promise((yes, no) => {
    server.once("error", no);
    server.listen(port, "127.0.0.1", yes);
  });
  await new Promise((yes, no) =>
    server.close((error) => (error ? no(error) : yes())),
  );
}
async function start() {
  assert(starts < 3, "proof start budget exceeded");
  await freePort();
  starts++;
  child = spawn(
    process.execPath,
    [
      resolve(directory, "../../node_modules/wrangler/bin/wrangler.js"),
      "dev",
      "--config",
      configPath,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--inspector-port",
      "0",
      "--local",
      "--show-interactive-dev-session=false",
      "--persist-to",
      resolve(output, "sqlite"),
    ],
    {
      cwd: directory,
      env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  child.stdout.on("data", (data) => {
    log += data;
  });
  child.stderr.on("data", (data) => {
    log += data;
  });
  let exitInfo;
  childExit = new Promise((resolveExit) =>
    child.once("exit", (code, signal) => {
      exitInfo = { code, signal };
      resolveExit(exitInfo);
    }),
  );
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (exitInfo)
      throw new Error(
        `runtime exited before readiness: ${safeLog(log.slice(-4096))}`,
      );
    const response = await fetch(`${endpoint}/health`, {
      signal: AbortSignal.timeout(2000),
    }).catch(() => null);
    if (response?.ok) return;
    await delay(100);
  }
  throw new Error(`runtime readiness timeout: ${safeLog(log.slice(-4096))}`);
}
async function stop() {
  if (!child) return;
  const owned = child;
  child = undefined;
  if (owned.exitCode === null && owned.signalCode === null) {
    process.kill(-owned.pid, "SIGKILL");
    await childExit;
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await freePort();
      return;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
      await delay(100);
    }
  }
  throw new Error("owned listener did not close");
}
async function command(input, role = "WRITER_SECRET", fault) {
  const response = await fetch(`${endpoint}/command`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secrets[role]}`,
      "Content-Type": "application/json",
      ...(fault
        ? { "X-Harness-Fault": fault, "X-Harness-Debug": secrets.DEBUG_SECRET }
        : {}),
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
}
async function snapshot() {
  const response = await fetch(`${endpoint}/debug`, {
    headers: { Authorization: `Bearer ${secrets.DEBUG_SECRET}` },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
  return response.json();
}
const request = (id, expectedRevision, command) => ({
  id,
  expectedRevision,
  command,
});
function kernelScene(snapshot) {
  return JSON.parse(snapshot.snapshot.state.session.kernel.json).scene;
}
function totalBread(snapshot) {
  return kernelScene(snapshot).initial.reduce(
    (total, row) =>
      total +
      (row.components["hive.lot"]?.kind === "bread"
        ? row.components["hive.lot"].quantity
        : 0),
    0,
  );
}
function hunger(snapshot) {
  const row = kernelScene(snapshot).initial.find(
    (entry) => entry.id === "survival.survivor.1",
  );
  return row.components["survival.condition"]?.hunger;
}
function piratePosition(snapshot, id) {
  return kernelScene(snapshot).initial.find((entry) => entry.id === id)
    ?.components["hive.position"];
}
function pirateCargo(snapshot, container) {
  return kernelScene(snapshot)
    .initial.filter(
      (entry) => entry.components["hive.lot"]?.container === container,
    )
    .reduce((total, entry) => total + entry.components["hive.lot"].quantity, 0);
}
function pirateTotalCargo(snapshot) {
  return kernelScene(snapshot).initial.reduce(
    (total, entry) => total + (entry.components["hive.lot"]?.quantity ?? 0),
    0,
  );
}
function pirateRoutes(snapshot) {
  return JSON.parse(snapshot.snapshot.state.session.kernel.json).routes;
}
async function runPirateProof(initial) {
  let revision = 0;
  const dispatch = async (id, value, role = "WRITER_SECRET", fault) => {
    const result = await command(request(id, revision, value), role, fault);
    if (result.status === 200) revision++;
    return result;
  };
  const shipMove = {
    kind: "command",
    name: "move",
    input: {
      entities: ["pirates.ship"],
      destination: { x: 3, y: 0, z: 0, frame: null },
    },
  };
  assert.equal((await dispatch("pirate-ship-move", shipMove)).status, 200);
  assert.equal(
    (
      await dispatch(
        "pirate-ship-step",
        { kind: "step", delta: 1 },
        "HOST_SECRET",
      )
    ).status,
    200,
  );
  const movedShip = await snapshot();
  assert.ok(piratePosition(movedShip, "pirates.ship").x > 0);
  assert.equal(piratePosition(movedShip, "pirates.crew.1").x, -1);

  const crewMove = {
    kind: "command",
    name: "move",
    input: {
      entities: ["pirates.crew.1"],
      destination: { x: 1, y: 1, z: 1, frame: "pirates.ship" },
    },
  };
  assert.equal((await dispatch("pirate-crew-move", crewMove)).status, 200);
  assert.equal(
    (
      await dispatch(
        "pirate-crew-step",
        { kind: "step", delta: 1 },
        "HOST_SECRET",
      )
    ).status,
    200,
  );
  const crewMoved = await snapshot();
  const crewBeforeCargo = piratePosition(crewMoved, "pirates.crew.1");
  assert.ok(
    crewBeforeCargo.x !== -1 || crewBeforeCargo.z !== 0,
    "crew route must make physical progress",
  );
  assert.equal(
    kernelScene(crewMoved).initial.find(
      (entry) => entry.id === "pirates.crew.1",
    ).components["hive.support"].entity,
    "pirates.ship",
  );

  assert.equal(
    (
      await dispatch("pirate-load", {
        kind: "command",
        name: "loadCargo",
        input: { entities: ["pirates.crew.1", "pirates.crew.2"] },
      })
    ).status,
    200,
  );
  for (let tick = 0; tick < 8; tick++)
    assert.equal(
      (
        await dispatch(
          `pirate-cargo-step-${tick}`,
          { kind: "step", delta: 1 },
          "HOST_SECRET",
        )
      ).status,
      200,
    );
  const cargo = await snapshot();
  assert.equal(pirateTotalCargo(cargo), 7);
  assert.ok(pirateCargo(cargo, "pirates.hold") > 0);

  const rollbackAction = {
    kind: "command",
    name: "move",
    input: {
      entities: ["pirates.ship"],
      destination: { x: -2, y: 0, z: 0, frame: null },
    },
  };
  assert.equal(
    (await dispatch("pirate-rollback-action", rollbackAction)).status,
    200,
  );
  const rollbackCandidate = await snapshot();
  const rollbackStep = request("pirate-rollback-step", revision, {
    kind: "step",
    delta: 1,
  });
  assert.equal(
    (await command(rollbackStep, "HOST_SECRET", "before-commit")).status,
    503,
  );
  assert.deepEqual(await snapshot(), rollbackCandidate);
  revision = rollbackCandidate.snapshot.revision;

  const lostAction = {
    kind: "command",
    name: "move",
    input: {
      entities: ["pirates.ship"],
      destination: { x: -3, y: 0, z: 0, frame: null },
    },
  };
  assert.equal((await dispatch("pirate-lost-action", lostAction)).status, 200);
  const lostStep = request("pirate-lost-step", revision, {
    kind: "step",
    delta: 1,
  });
  assert.equal(
    (await command(lostStep, "HOST_SECRET", "after-commit")).status,
    503,
  );
  const committed = await snapshot();
  assert.ok(committed.snapshot.revision > rollbackCandidate.snapshot.revision);
  assert.ok(pirateRoutes(committed).some((route) => route.path.length > 0));
  const crewBeforeRestart = piratePosition(committed, "pirates.crew.1");
  await stop();
  await start();
  const restarted = await snapshot();
  assert.equal(
    restarted.snapshot.state.session.kernel.json,
    committed.snapshot.state.session.kernel.json,
  );
  const replay = await command(lostStep, "HOST_SECRET");
  assert.equal(replay.status, 200);
  assert.deepEqual(await command(lostStep, "HOST_SECRET"), replay);
  const replayed = await snapshot();
  assert.deepEqual(replayed.snapshot, committed.snapshot);
  revision = committed.snapshot.revision;
  const resumed = await dispatch(
    "pirate-resumed-step",
    { kind: "step", delta: 1 },
    "HOST_SECRET",
  );
  assert.equal(resumed.status, 200);
  const resumedSnapshot = await snapshot();
  assert.notEqual(
    piratePosition(resumedSnapshot, "pirates.ship").x,
    piratePosition(committed, "pirates.ship").x,
  );
  assert.deepEqual(
    piratePosition(resumedSnapshot, "pirates.crew.1"),
    crewBeforeRestart,
  );
  return {
    initial,
    movedShip,
    crewMoved,
    cargo,
    rollbackCandidate,
    committed,
    replayed,
    resumedSnapshot,
  };
}
try {
  await start();
  const initial = await snapshot();
  assert.equal(initial.snapshot.revision, 0);
  if (packId === "pirates") {
    const evidence = await runPirateProof(initial);
    await writeFile(
      resolve(output, "pirate-proof.json"),
      JSON.stringify(evidence, null, 2),
    );
    await writeFile(
      resolve(output, "pirate-proof-receipt.json"),
      JSON.stringify({ status: "succeeded", starts }, null, 2),
    );
  } else {
    const move = {
      kind: "action",
      action: {
        kind: "move",
        entity: "survival.survivor.1",
        destination: { x: 2, y: 0, z: 0, frame: null },
      },
    };
    assert.equal(
      (await command(request("move", 0, move), "HOST_SECRET")).status,
      403,
    );
    assert.equal((await command(request("move", 0, move))).status, 200);
    assert.equal(
      (
        await command(
          request("move-step", 1, { kind: "step", delta: 1 }),
          "HOST_SECRET",
        )
      ).status,
      200,
    );
    assert.equal(
      (await command(request("take", 2, { kind: "command", name: "takeFood" })))
        .status,
      200,
    );
    assert.equal(
      (
        await command(
          request("take-step", 3, { kind: "step", delta: 1 }),
          "HOST_SECRET",
        )
      ).status,
      200,
    );
    const eat = request("eat", 4, { kind: "command", name: "eatFood" });
    assert.equal((await command(eat)).status, 200);
    const beforeConsume = await snapshot();
    const lostStep = request("consume-step", 5, { kind: "step", delta: 1 });
    assert.deepEqual(await command(lostStep, "HOST_SECRET", "after-commit"), {
      status: 503,
      body: { error: "injected-after-commit" },
    });
    const consumed = await snapshot();
    assert.equal(consumed.snapshot.revision, 6);
    assert.equal(consumed.events.length, 0);
    assert.equal(totalBread(consumed), 7);
    await stop();
    await start();
    assert.deepEqual(await snapshot(), consumed);
    const retry = await command(lostStep, "HOST_SECRET");
    assert.equal(retry.status, 200);
    assert.deepEqual(await command(lostStep, "HOST_SECRET"), retry);
    assert.equal(
      (
        await command(
          request("consume-step", 5, { kind: "step", delta: 0.5 }),
          "HOST_SECRET",
        )
      ).status,
      409,
    );
    const afterReplay = await snapshot();
    assert.deepEqual(afterReplay.snapshot, consumed.snapshot);
    const hungerBeforeOutcome = hunger(afterReplay);
    const observed = await command(
      request("observe", 6, { kind: "step", delta: 1 }),
      "HOST_SECRET",
    );
    assert.equal(observed.status, 200);
    const afterOutcome = await snapshot();
    assert.equal(afterOutcome.snapshot.revision, 7);
    assert.equal(
      hunger(afterOutcome),
      Math.max(0, Math.min(100, hungerBeforeOutcome + 0.5 - 25)),
    );
    assert.equal(totalBread(afterOutcome), 7);
    const rollbackBefore = await snapshot();
    assert.equal(
      (
        await command(
          request("rollback-action", 7, {
            kind: "action",
            action: {
              kind: "move",
              entity: "survival.survivor.1",
              destination: { x: 0, y: 0, z: 0, frame: null },
            },
          }),
        )
      ).status,
      200,
    );
    const rollbackCandidate = await snapshot();
    assert.equal(
      (
        await command(
          request("rollback-step", 8, { kind: "step", delta: 1 }),
          "HOST_SECRET",
          "before-commit",
        )
      ).status,
      503,
    );
    assert.deepEqual(await snapshot(), rollbackCandidate);
    // Authored intent must survive process loss before its physical tick runs.
    const ruleRequest = request("meal-rule", 8, {
      kind: "command",
      name: "setMealRule",
      input: { recovery: 10 },
    });
    const ruleReceipt = await command(ruleRequest);
    assert.equal(ruleReceipt.status, 200);
    const queuedRule = await snapshot();
    assert.equal(queuedRule.snapshot.revision, 9);
    assert.equal(queuedRule.snapshot.state.session.pendingWrites.length, 1);
    await stop();
    await start();
    assert.deepEqual(await snapshot(), queuedRule);
    assert.deepEqual(await command(ruleRequest), ruleReceipt);
    assert.deepEqual(await snapshot(), queuedRule);
    assert.equal(
      (
        await command(
          request("apply-rule", 9, { kind: "step", delta: 1 }),
          "HOST_SECRET",
        )
      ).status,
      200,
    );
    const appliedRule = await snapshot();
    assert.equal(appliedRule.snapshot.revision, 10);
    assert.equal(appliedRule.snapshot.state.session.pendingWrites.length, 0);
    assert.equal(
      kernelScene(appliedRule).initial.find(
        (row) => row.id === "survival.survivor.1",
      ).components["survival.meal-rule"].recovery,
      10,
    );
    assert.equal(totalBread(appliedRule), 7);
    await writeFile(
      resolve(output, "survival-proof.json"),
      JSON.stringify(
        {
          initial,
          beforeConsume,
          consumed,
          afterReplay,
          afterOutcome,
          rollbackBefore,
          rollbackCandidate,
          queuedRule,
          appliedRule,
          observed,
        },
        null,
        2,
      ),
    );
    await writeFile(
      resolve(output, "survival-proof-receipt.json"),
      JSON.stringify({ status: "succeeded", starts }, null, 2),
    );
  }
} catch (error) {
  await writeFile(
    resolve(output, `${packId}-proof-receipt.json`),
    JSON.stringify(
      {
        status: "failed",
        error: safeLog(
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
        ),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  try {
    await stop();
  } finally {
    await rm(configPath, { force: true });
  }
}
