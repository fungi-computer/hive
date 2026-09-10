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
    (process.argv.length === 6 && process.argv[4] === "--pack") ||
    (process.argv.length === 8 &&
      process.argv[4] === "--pack" &&
      process.argv[6] === "--fixture")),
  "Usage: node proof.mjs --output <directory> [--pack survival|pirates|colony|formations] [--fixture cannon]",
);
const packId = process.argv[5] ?? "survival";
const fixtureId = process.argv[7] ?? "default";
assert(
  ["survival", "pirates", "colony", "formations"].includes(packId),
  "unsupported proof pack",
);
assert(
  fixtureId === "default" || (packId === "formations" && fixtureId === "cannon"),
  "unsupported proof fixture",
);
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
  "../../engine/src/runtime/observation.ts",
  "../../engine/src/presentation.ts",
  "../../engine/src/runtime/session.ts",
  "../../engine/src/runtime/wasm-kernel.ts",
  "../../engine/src/sdk/authoring.ts",
  "../../engine/src/sdk/common.ts",
  "../../engine/src/sdk/delivery.ts",
  "../../engine/src/games/survival.ts",
  "../../engine/src/games/pirates.ts",
  "../../engine/src/games/colony.ts",
  "../../engine/src/games/formations.ts",
  "../../engine/src/sdk/combat.ts",
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
async function checkObservation(committed) {
  const denied = await fetch(`${endpoint}/observe`, {
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(denied.status, 403);
  const read = async () => {
    const response = await fetch(`${endpoint}/observe`, {
      headers: { Authorization: `Bearer ${secrets.WRITER_SECRET}` },
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const [first, second] = await Promise.all([read(), read()]);
  assert.deepEqual(first, second);
  assert.equal(first.revision, committed.snapshot.revision);
  assert.equal(first.observation.sequence, committed.snapshot.revision);
  assert.ok(first.observation.facts.length > 0);
  assert.ok(first.observation.facts.length <= 512);
  assert.deepEqual(Object.keys(first).sort(), ["observation", "revision"]);
  assert.deepEqual(
    await snapshot(),
    committed,
    "observations cannot mutate world",
  );
  return first;
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
function colonyScene(snapshot) {
  return kernelScene(snapshot).initial;
}
function colonyLots(snapshot) {
  return colonyScene(snapshot)
    .filter((entry) => entry.components["hive.lot"])
    .map((entry) => entry.components["hive.lot"]);
}
function colonyTotal(snapshot) {
  return colonyLots(snapshot).reduce((total, lot) => total + lot.quantity, 0);
}
function colonyGuestFood(snapshot) {
  return colonyLots(snapshot)
    .filter((lot) => lot.container === "colony.guest.1")
    .reduce((total, lot) => total + lot.quantity, 0);
}
function colonyTaskPhase(snapshot, id) {
  return colonyScene(snapshot).find((entry) => entry.id === id)?.components[
    "hive.delivery-task"
  ]?.phase;
}
function formationPosition(snapshot, id) {
  return kernelScene(snapshot).initial.find((entry) => entry.id === id)
    ?.components["hive.position"];
}
function formationMorale(snapshot, id) {
  return kernelScene(snapshot).initial.find((entry) => entry.id === id)
    ?.components["formations.morale"]?.value;
}
function formationHealth(snapshot, id) {
  return kernelScene(snapshot).initial.find((entry) => entry.id === id)
    ?.components["formations.health"]?.value;
}
function formationSettings(snapshot) {
  return kernelScene(snapshot).initial.find(
    (entry) => entry.id === "formations.group.1",
  )?.components["formations.settings"];
}
function formationRoutes(snapshot) {
  return JSON.parse(snapshot.snapshot.state.session.kernel.json).routes;
}
async function runCannonProof(initial) {
  let revision = 0;
  const dispatch = async (id, value, role = "WRITER_SECRET", fault) => {
    const result = await command(request(id, revision, value), role, fault);
    if (result.status === 200) revision++;
    return result;
  };
  const fire = { kind: "command", name: "fire", input: {} };
  const fired = await dispatch("cannon-fire", fire);
  assert.equal(fired.status, 200);
  const queued = await snapshot();
  assert.equal(queued.snapshot.revision, 1);
  assert.equal(queued.snapshot.state.session.pendingActions.length, 1);
  assert.equal(
    kernelScene(queued).initial.find((entry) => entry.id === "formations.ammunition")
      .components["hive.lot"].quantity,
    6,
  );

  assert.deepEqual(await command(request("cannon-fire", 0, fire)), fired);
  revision = 1;

  const flightStep = request("cannon-flight-step", revision, {
    kind: "step",
    delta: 0.1,
  });
  assert.equal(
    (await command(flightStep, "HOST_SECRET", "after-commit")).status,
    503,
  );
  const inFlight = await snapshot();
  assert.equal(inFlight.snapshot.revision, 2);
  assert.equal(
    kernelScene(inFlight).initial.find((entry) => entry.id === "formations.ammunition")
      .components["hive.lot"].quantity,
    5,
  );
  assert.ok(
    kernelScene(inFlight).initial.some((entry) => entry.id.startsWith("shot.")),
    "native projectile must survive the lost receipt",
  );

  await stop();
  await start();
  assert.deepEqual(await snapshot(), inFlight);
  assert.equal((await command(flightStep, "HOST_SECRET")).status, 200);
  const flightReplay = await command(flightStep, "HOST_SECRET");
  assert.deepEqual(await command(flightStep, "HOST_SECRET"), flightReplay);
  assert.deepEqual(await snapshot(), inFlight);
  revision = 2;

  const impactStep = request("cannon-impact-step", revision, {
    kind: "step",
    delta: 0.3,
  });
  assert.equal((await command(impactStep, "HOST_SECRET")).status, 200);
  const impactCommitted = await snapshot();
  assert.ok(
    !kernelScene(impactCommitted).initial.some((entry) => entry.id.startsWith("shot.")),
    "projectile must settle before authored consequence",
  );
  assert.equal(formationHealth(impactCommitted, "formations.unit.1"), 100);
  revision = 3;

  const consequenceStep = request("cannon-consequence-step", revision, {
    kind: "step",
    delta: 0.1,
  });
  const beforeRollback = await snapshot();
  assert.equal(
    (await command(consequenceStep, "HOST_SECRET", "before-commit")).status,
    503,
  );
  assert.deepEqual(await snapshot(), beforeRollback);
  const consequence = await command(consequenceStep, "HOST_SECRET");
  assert.equal(consequence.status, 200);
  const damaged = await snapshot();
  assert.equal(formationHealth(damaged, "formations.unit.1"), 80);
  assert.equal(formationMorale(damaged, "formations.unit.1"), 50);
  assert.equal(
    kernelScene(damaged).initial.find((entry) => entry.id === "formations.ammunition")
      .components["hive.lot"].quantity,
    5,
  );
  assert.notEqual(
    formationPosition(damaged, "formations.unit.1").x,
    formationPosition(impactCommitted, "formations.unit.1").x,
    "native displacement must move the impacted formation member",
  );
  assert.deepEqual(await command(consequenceStep, "HOST_SECRET"), consequence);
  assert.deepEqual((await snapshot()).snapshot, damaged.snapshot);
  const observation = await checkObservation(damaged);
  return { initial, queued, inFlight, impactCommitted, beforeRollback, damaged, observation };
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
  const observation = await checkObservation(restarted);
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
    observation,
  };
}
async function runColonyProof(initial) {
  let revision = 0;
  const dispatch = async (id, value, role = "WRITER_SECRET", fault) => {
    const result = await command(request(id, revision, value), role, fault);
    if (result.status === 200) revision++;
    return result;
  };
  const deliver = {
    kind: "command",
    name: "deliver",
    input: {
      entities: ["colony.worker.1", "colony.worker.2"],
      quantity: 2,
    },
  };
  const deliverReceipt = await dispatch("colony-deliver", deliver);
  assert.equal(deliverReceipt.status, 200);
  const queued = await snapshot();
  assert.equal(queued.snapshot.revision, 1);
  assert.equal(queued.snapshot.state.session.pendingWrites.length, 2);

  await stop();
  await start();
  assert.deepEqual(await snapshot(), queued);
  assert.deepEqual(
    await command(request("colony-deliver", 0, deliver)),
    deliverReceipt,
  );
  revision = 1;

  const lostStep = request("colony-first-step", revision, {
    kind: "step",
    delta: 1,
  });
  assert.equal(
    (await command(lostStep, "HOST_SECRET", "after-commit")).status,
    503,
  );
  const committed = await snapshot();
  assert.equal(committed.snapshot.revision, 2);
  assert.equal(colonyTotal(committed), 6);
  assert.ok(
    colonyScene(committed).some((entry) =>
      entry.id.startsWith("colony.worker."),
    ),
  );
  const replay = await command(lostStep, "HOST_SECRET");
  assert.equal(replay.status, 200);
  // The replay response is checked against a second replay; no second
  // physical tick or lot mutation is permitted by the region receipt.
  assert.deepEqual(await command(lostStep, "HOST_SECRET"), replay);
  assert.deepEqual(await snapshot(), committed);
  revision = 2;
  for (let tick = 0; tick < 18; tick++) {
    const result = await dispatch(
      `colony-step-${tick}`,
      {
        kind: "step",
        delta: 1,
      },
      "HOST_SECRET",
    );
    assert.equal(result.status, 200);
  }
  const completed = await snapshot();
  assert.equal(colonyTotal(completed), 6);
  assert.equal(colonyGuestFood(completed), 4);
  assert.equal(colonyTaskPhase(completed, "colony.delivery.1"), "complete");
  assert.equal(colonyTaskPhase(completed, "colony.delivery.2"), "complete");
  const observation = await checkObservation(completed);
  return { initial, queued, committed, completed, observation };
}
async function runFormationProof(initial) {
  let revision = 0;
  const dispatch = async (id, value, role = "WRITER_SECRET", fault) => {
    const result = await command(request(id, revision, value), role, fault);
    if (result.status === 200) revision++;
    return result;
  };
  const threshold = {
    kind: "command",
    name: "setRetreatThreshold",
    input: { retreatBelow: 90 },
  };
  assert.equal((await dispatch("formations-threshold", threshold)).status, 200);
  const march = {
    kind: "command",
    name: "march",
    input: {
      entities: ["formations.unit.1", "formations.unit.2", "formations.unit.3"],
      destination: { x: 8, y: 0, z: 8, frame: null },
      facing: 1,
    },
  };
  assert.equal((await dispatch("formations-march", march)).status, 200);
  const queued = await snapshot();
  assert.equal(queued.snapshot.revision, 2);
  assert.equal(
    queued.snapshot.state.session.pendingWrites.some(
      (write) => write.component === "formations.settings",
    ),
    true,
  );

  await stop();
  await start();
  assert.deepEqual(await snapshot(), queued);
  const thresholdReplay = await command(
    request("formations-threshold", 0, threshold),
  );
  assert.equal(thresholdReplay.status, 200);
  assert.deepEqual(
    await command(request("formations-threshold", 0, threshold)),
    thresholdReplay,
  );
  const marchReplay = await command(request("formations-march", 1, march));
  assert.equal(marchReplay.status, 200);
  assert.deepEqual(
    await command(request("formations-march", 1, march)),
    marchReplay,
  );
  revision = 2;
  const lostStep = request("formations-step", revision, {
    kind: "step",
    delta: 1,
  });
  assert.equal(
    (await command(lostStep, "HOST_SECRET", "after-commit")).status,
    503,
  );
  const committed = await snapshot();
  assert.equal(committed.snapshot.revision, 3);
  assert.equal(formationMorale(committed, "formations.unit.1"), 80);
  assert.equal(formationSettings(committed).retreatBelow, 90);
  assert.ok(
    formationRoutes(committed).length > 0,
    "formation route must be committed",
  );
  const replay = await command(lostStep, "HOST_SECRET");
  assert.equal(replay.status, 200);
  assert.deepEqual(await command(lostStep, "HOST_SECRET"), replay);
  assert.deepEqual(await snapshot(), committed);
  revision = 3;
  const resumed = await dispatch(
    "formations-resumed-step",
    {
      kind: "step",
      delta: 1,
    },
    "HOST_SECRET",
  );
  assert.equal(resumed.status, 200);
  const advanced = await snapshot();
  const beforePosition = formationPosition(committed, "formations.unit.1");
  const afterPosition = formationPosition(advanced, "formations.unit.1");
  const distanceToHome = (position) =>
    Math.hypot(position.x + 4, position.z + 4);
  assert.ok(
    distanceToHome(afterPosition) < distanceToHome(beforePosition),
    "threshold-90 retreat must continue toward home",
  );
  const observation = await checkObservation(advanced);
  return { initial, queued, committed, advanced, observation };
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
  } else if (packId === "colony") {
    const evidence = await runColonyProof(initial);
    await writeFile(
      resolve(output, "colony-proof.json"),
      JSON.stringify(evidence, null, 2),
    );
    await writeFile(
      resolve(output, "colony-proof-receipt.json"),
      JSON.stringify({ status: "succeeded", starts }, null, 2),
    );
  } else if (packId === "formations" && fixtureId === "cannon") {
    const evidence = await runCannonProof(initial);
    await writeFile(
      resolve(output, "formations-cannon-proof.json"),
      JSON.stringify(evidence, null, 2),
    );
    await writeFile(
      resolve(output, "formations-cannon-proof-receipt.json"),
      JSON.stringify({ status: "succeeded", starts }, null, 2),
    );
  } else if (packId === "formations") {
    const evidence = await runFormationProof(initial);
    await writeFile(
      resolve(output, "formations-proof.json"),
      JSON.stringify(evidence, null, 2),
    );
    await writeFile(
      resolve(output, "formations-proof-receipt.json"),
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
