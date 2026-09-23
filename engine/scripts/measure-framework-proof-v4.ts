/** V4 qualification candidate. Local WASM evidence; never a v3 before/after. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cpus, platform, arch } from "node:os";
import { execFileSync } from "node:child_process";
import { initSync, WasmKernel } from "../generated/hive_kernel.js";
import { GameSession } from "../src/runtime/session";
import { wasmKernelPort } from "../src/runtime/wasm-kernel";
import {
  createColonyFrameworkProofV4Pack,
} from "../src/games/colony-framework-proof-v4";
import {
  colonyFrameworkProofV3Relocations,
  colonyFrameworkProofV3WaterCells,
} from "../src/games/colony-framework-proof-v3";
import { colonyFrameworkProofV4Schedule as schedule } from "../src/games/colony-performance-config";
import { driveColonyFrameworkProofV4 } from "../src/games/colony-framework-proof-v4-driver";
import {
  FiniteResource,
  MaterialLot,
  LotWater,
  Position,
} from "../src/sdk/common";
import { FieldWaterWork } from "../src/sdk/process-supply";
import { query } from "../src/sdk/authoring";
import { Worker } from "../src/games/colony-components";
import { ColonyTree, ColonyTreePolicy } from "../src/games/colony-work";
import { entity } from "../src/sdk/authoring";

const steps = Number(
  process.argv.find((arg: string) => arg.startsWith("--steps="))?.slice(8) ??
    schedule.steps,
);
assert(Number.isSafeInteger(steps) && steps >= 0 && steps <= schedule.steps);
const nativeSource =
  process.argv
    .find((arg: string) => arg.startsWith("--native-source="))
    ?.slice(16) ?? "unrecorded";
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const wasm = readFileSync("engine/generated/hive_kernel_bg.wasm");
initSync({ module: wasm });
const pack = createColonyFrameworkProofV4Pack();
const physicalEnvironment = (session: GameSession) => {
  const { placementRevision: _runtimeInvalidation, ...facts } =
    session.environmentFacts() as Record<string, unknown>;
  return facts;
};
const waterAccount = (session: GameSession) => {
  const field = session.environmentFacts() as {
    totalKg: number;
    initialTotalKg: number;
    boundaryKg: number;
    residualKg: number;
  };
  const heldKg = session
    .query(query(LotWater))
    .reduce((sum, row) => sum + row.get(LotWater).waterKg, 0);
  return {
    fieldKg: field.totalKg,
    admittedGeologyKg: field.initialTotalKg,
    boundaryKg: field.boundaryKg,
    heldKg,
    balanceKg: field.totalKg + heldKg - field.initialTotalKg,
    residualKg: field.residualKg,
  };
};
const makeSession = () => {
  const port = wasmKernelPort(new WasmKernel());
  return { port, session: new GameSession({ port, pack }) };
};

// Independent physical-source proof. It does not modify the measured workload.
const probe = makeSession(),
  restoredProbe = makeSession();
let sourceProof: unknown;
try {
  probe.session.start();
  const workers = probe.session.query(query(Worker, Position));
  assert.equal(workers.length, 100);
  assert(
    workers.every((row) => row.get(Position).y / 0.54 - 0.5 >= 14),
    "v3 has a submerged worker start",
  );
  const source = colonyFrameworkProofV3WaterCells[1];
  const contacts = probe.session.waterContacts([[75, 7.83, -91]]);
  assert(
    contacts.some((contact) =>
      contact.at.every((value, index) => value === source[index]),
    ),
  );
  const bank = probe.port.routeCosts([
    {
      actor: entity("colony.worker.51"),
      target: { x: 75, y: 7.83, z: -91, frame: null },
    },
  ]);
  assert.equal(bank[0].status, "reachable");
  probe.session.step(0); // Admit unchanged initial jobs without advancing labor.
  const before = waterAccount(probe.session);
  probe.session.request({
    kind: "exchange-field-water",
    operation: "v3-source-witness",
    worker: entity("colony.worker.51"),
    vessel: entity("colony.worker.51.framework-pail"),
    x: source[0],
    y: source[1],
    z: source[2],
    direction: "withdraw",
    portions: 1,
  });
  probe.session.step(0);
  assert(
    probe.session
      .save()
      .outcomes.some(
        (outcome) =>
          outcome.action.kind === "exchange-field-water" &&
          outcome.result.accepted,
      ),
  );
  const drawn = probe.session
    .query(query(MaterialLot))
    .filter((row) => row.get(MaterialLot).kind === "water")
    .map((row) => row.get(MaterialLot));
  assert.equal(
    drawn.reduce((sum, lot) => sum + lot.quantity, 0),
    1,
  );
  const after = waterAccount(probe.session);
  assert(Math.abs(after.balanceKg - before.balanceKg) < 1e-8);
  restoredProbe.session.restore(probe.session.save());
  assert.deepEqual(
    physicalEnvironment(restoredProbe.session),
    physicalEnvironment(probe.session),
  );
  assert.deepEqual(waterAccount(restoredProbe.session), after);
  sourceProof = {
    dryWorkerStarts: workers.length,
    source,
    bank,
    drawn,
    before,
    after,
    restored: true,
  };
} finally {
  probe.port.dispose();
  restoredProbe.port.dispose();
}

const { port, session } = makeSession(),
  recovered = makeSession();
const recordCosts: { step: number; bytes: number; puts: number; live?: Record<string, {bytes:number; records:number}>; families: Record<string, {bytes: number; puts: number}>; largest: {key: string; bytes: number; fields?: Record<string, number>}[] }[] = [];
const advanceMs: number[] = [], captureMs: number[] = [];
const samples: unknown[] = [],
  commands: unknown[] = [];
let firstWaterStep: number | null = null,
  maxChangedBytes = 0,
  error: string | null = null,
  completedSteps = 0;
let previous = new Map<string, { x: number; y: number; z: number }>();
const started = performance.now();
const percentileSummary = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
  return {
    count: values.length,
    totalMs: values.reduce((sum, value) => sum + value, 0),
    p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), maxMs: sorted.at(-1) ?? null,
  };
};
try {
  session.start();
  session.captureForCommit();
  session.acceptCapture();
  previous = new Map(
    session
      .query(query(Worker, Position))
      .map((row) => [row.id, row.get(Position)]),
  );
  const initialWater = waterAccount(session);
  const initialWood = session
    .query(query(MaterialLot))
    .map((row) => row.get(MaterialLot))
    .filter((lot) => lot.kind === "wood")
    .reduce((sum, lot) => sum + lot.quantity, 0);
  for (let step = 1; step <= steps; step++) {
    try {
      const issued = driveColonyFrameworkProofV4(session, step);
      session.runDisposableCandidate(() => {
        const advanceStarted = performance.now();
        session.step(schedule.stepSeconds);
        advanceMs.push(performance.now() - advanceStarted);
        const captureStarted = performance.now();
        const capture = session.captureForCommit();
        captureMs.push(performance.now() - captureStarted);
        const families: Record<string, {bytes: number; puts: number}> = {};
        let total = 0;
        for (const row of capture.changes.puts) {
          const family = row.key.startsWith("kernel/state/") ? row.key.split("/").slice(0, 3).join("/") : row.key.split("/").slice(0, 2).join("/");
          const group = families[family] ??= { bytes: 0, puts: 0 };
          group.bytes += row.bytes.length; group.puts++; total += row.bytes.length;
        }
        const largest = (step % 600 === 0 ? [...capture.changes.puts].sort((a,b)=>b.bytes.length-a.bytes.length).slice(0, 8) : []).map(row => {
          let fields: Record<string, number> | undefined;
          try { fields = Object.fromEntries(Object.entries(JSON.parse(new TextDecoder().decode(row.bytes))).map(([key,value])=>[key,JSON.stringify(value).length])); } catch {}
          return {key:row.key, bytes:row.bytes.length, fields};
        });
        let live: Record<string, {bytes:number; records:number}> | undefined;
        if (step % 600 === 0 || step === steps) {
          live = {};
          // Resident commits carry only a frontier. Take an explicit detached
          // checkpoint for this occasional diagnostic inventory sample.
          for (const row of session.save().kernel.records) {
            const family = row.key.startsWith("kernel/state/") ? row.key.split("/").slice(0,3).join("/") : row.key.split("/").slice(0,2).join("/");
            const group = live[family] ??= { bytes:0, records:0 };
            group.bytes += row.bytes.length; group.records++;
          }
        }
        recordCosts.push({ step, bytes:total, puts:capture.changes.puts.length, families, largest, live });
        maxChangedBytes = Math.max(
          maxChangedBytes,
          capture.changes.puts.reduce(
            (sum, row) =>
              sum +
              row.bytes.length +
              new TextEncoder().encode(row.key).length +
              16,
            0,
          ),
        );
        if (issued.length)
          commands.push({ step, issued, outcomes: capture.snapshot.outcomes });
      });
      session.acceptCapture();
      completedSteps = step;
      const waterLots = session
        .query(query(MaterialLot))
        .filter((row) => row.get(MaterialLot).kind === "water")
        .map((row) => row.get(MaterialLot));
      if (waterLots.length && firstWaterStep === null) firstWaterStep = step;
      if (step % 10 !== 0 && step !== steps) continue;
      const lots = session
        .query(query(MaterialLot))
        .map((row) => row.get(MaterialLot));
      const wood = lots
        .filter((lot) => lot.kind === "wood")
        .reduce((sum, lot) => sum + lot.quantity, 0);
      const felledWood = lots
        .filter((lot) => lot.kind === "wood-felled")
        .reduce((sum, lot) => sum + lot.quantity, 0);
      const finiteWood = session
        .query(query(FiniteResource))
        .filter((row) => row.get(FiniteResource).kind === "wood")
        .reduce((sum, row) => sum + row.get(FiniteResource).quantity, 0);
      assert.equal(finiteWood + felledWood + wood, 2304);
      const account = waterAccount(session);
      assert(
        Math.abs(account.balanceKg - initialWater.balanceKg) < 1e-7,
        "water conservation failed",
      );
      const positions = new Map(
        session
          .query(query(Worker, Position))
          .map((row) => [row.id, row.get(Position)]),
      );
      let assigned = 0,
        blocked = 0,
        moving = 0,
        working = 0,
        stalledRoute = 0;
      const routeRemainingMetres: number[] = [];
      for (const [worker, position] of positions) {
        const attempt = port.workAttemptForWorker(worker);
        if (!attempt) continue;
        if (attempt.phase.kind === "outcome" && attempt.phase.result.kind === "blocked") {
          blocked++;
          continue;
        }
        if (attempt.phase.kind !== "executing") continue;
        assigned++;
        if (attempt.phase.activity.kind !== "route") {
          working++;
          continue;
        }
        const destination = attempt.phase.activity.destination;
        routeRemainingMetres.push(Math.hypot(
          position.x - destination.x,
          position.y - destination.y,
          position.z - destination.z,
        ));
        const old = previous.get(worker)!;
        if (
          Math.hypot(
            old.x - position.x,
            old.y - position.y,
            old.z - position.z,
          ) > 1e-6
        )
          moving++;
        else stalledRoute++;
      }
      const designatedBacklog = session
        .query(query(ColonyTree, FiniteResource, ColonyTreePolicy))
        .filter((row) => row.get(ColonyTreePolicy).designated && row.get(FiniteResource).quantity > 0);
      const releaseByCohort = schedule.cohortReleaseSteps;
      const backlogAgesSeconds = designatedBacklog.map((row) => {
        const match = /framework-v2\.(\d+)\./.exec(row.id);
        const release = match ? releaseByCohort[Number(match[1])] ?? 1 : 1;
        return Math.max(0, (step - release) * schedule.stepSeconds);
      });
      routeRemainingMetres.sort((a, b) => a - b);
      previous = positions;
      samples.push({
        step,
        assigned,
        blocked,
        unassigned: Math.max(0, positions.size - assigned - blocked),
        moving,
        working,
        stalledRoute,
        usefulWorkers: moving + working,
        routeRemainingMetres: {
          count: routeRemainingMetres.length,
          p95: routeRemainingMetres.length
            ? routeRemainingMetres[Math.ceil(routeRemainingMetres.length * 0.95) - 1]
            : 0,
          max: routeRemainingMetres.at(-1) ?? 0,
        },
        designatedBacklogChains: designatedBacklog.length,
        oldestDesignatedBacklogAgeSeconds: backlogAgesSeconds.length ? Math.max(...backlogAgesSeconds) : 0,
        finiteWood,
        felledWood,
        wood,
        completedChains: wood / 6,
        storedWood: lots
          .filter(
            (lot) =>
              lot.kind === "wood" &&
              lot.container.startsWith("framework-v2.store."),
          )
          .reduce((sum, lot) => sum + lot.quantity, 0),
        waterPortions: waterLots.reduce((sum, lot) => sum + lot.quantity, 0),
        waterDemands: session.query(query(FieldWaterWork)).length,
        account,
      });
    } catch (failure) {
      error = `step${step}: ${failure instanceof Error ? failure.message : String(failure)}`;
      break;
    }
  }
  recovered.session.restore(session.save());
  const recovery = {
    physicalEnvironmentMatches:
      JSON.stringify(physicalEnvironment(recovered.session)) ===
      JSON.stringify(physicalEnvironment(session)),
    waterAccountMatches:
      JSON.stringify(waterAccount(recovered.session)) ===
      JSON.stringify(waterAccount(session)),
  };
  assert(recovery.physicalEnvironmentMatches && recovery.waterAccountMatches);
  // Continue both the original and recovered state for the same short suffix.
  // This suffix is recovery evidence, outside the measured command ledger.
  for (let index = 0; index < 10; index++) {
    session.step(schedule.stepSeconds);
    recovered.session.step(schedule.stepSeconds);
  }
  const continuation = {
    steps: 10,
    environmentMatches:
      JSON.stringify(physicalEnvironment(recovered.session)) ===
      JSON.stringify(physicalEnvironment(session)),
    materialMatches:
      JSON.stringify(
        recovered.session
          .query(query(MaterialLot))
          .map((row) => ({ id: row.id, lot: row.get(MaterialLot) })),
      ) ===
      JSON.stringify(
        session
          .query(query(MaterialLot))
          .map((row) => ({ id: row.id, lot: row.get(MaterialLot) })),
      ),
    workersMatch:
      JSON.stringify(
        recovered.session
          .query(query(Worker, Position))
          .map((row) => ({ id: row.id, position: row.get(Position) })),
      ) ===
      JSON.stringify(
        session
          .query(query(Worker, Position))
          .map((row) => ({ id: row.id, position: row.get(Position) })),
      ),
    waterAccountMatches:
      JSON.stringify(waterAccount(recovered.session)) ===
      JSON.stringify(waterAccount(session)),
  };
  const minuteWindows = Array.from({ length: Math.ceil(completedSteps / 600) }, (_, index) => {
    const minute = index + 1;
    const window = (samples as Array<Record<string, number>>).filter(
      (sample) => sample.step > index * 600 && sample.step <= minute * 600,
    );
    const last = window.at(-1);
    const atMinuteStart = (samples as any[]).filter((sample) => sample.step <= index * 600).at(-1);
    const productive = window.filter((sample) => sample.usefulWorkers >= 90).length;
    return {
      minute,
      samples: window.length,
      productiveSamples: productive,
      productiveFraction: window.length ? productive / window.length : 0,
      producedWoodUnits: last ? last.wood - (atMinuteStart?.wood ?? initialWood) : 0,
      maximumRouteRemainingMetres: Math.max(0, ...window.map((sample) => sample.routeRemainingMetres.max)),
      maximumDesignatedBacklogChains: Math.max(0, ...window.map((sample) => sample.designatedBacklogChains)),
      maximumOldestBacklogAgeSeconds: Math.max(0, ...window.map((sample) => sample.oldestDesignatedBacklogAgeSeconds)),
    };
  });
  const qualification = {
    boundary: "local GameSession + WASM only; no Region/workerd/DO was invoked",
    targets: {
      activeWorkers: "at least 90 moving or working workers in at least 90% of one-second samples",
      output: "positive finite wood output in every completed 60-second window",
      maximumRouteRemainingMetres: 256,
      maximumOldestDesignatedBacklogAgeSeconds: 120,
    },
    minuteWindows,
    localTargetEvaluation: {
      activeSamplesPass: minuteWindows.length > 0 && minuteWindows.every((window) => window.productiveFraction >= 0.9),
      outputEveryMinutePass: minuteWindows.length > 0 && minuteWindows.every((window) => window.producedWoodUnits > 0),
      routeDistancePass: minuteWindows.length > 0 && minuteWindows.every((window) => window.maximumRouteRemainingMetres <= 256),
      backlogAgePass: minuteWindows.length > 0 && minuteWindows.every((window) => window.maximumOldestBacklogAgeSeconds <= 120),
      hostedTenMinuteGate: "unavailable: hosted performance backends are parked",
      routeSearchCounters: "not exposed by current GameSession/WASM public API",
    },
  };
  console.log(
    JSON.stringify(
      {
        recordCosts,
        fixture: pack.id,
        nativeSource,
        source: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        dirtySource: execFileSync("git", ["status", "--porcelain"], {
          encoding: "utf8",
        }).trim(),
        wasmSha256: hash(wasm),
        definitionSha256: hash(pack.definition),
        environmentSha256: hash(pack.environmentDefinition!),
        schedule,
        relocations: colonyFrameworkProofV3Relocations,
        relocatedWorkers: colonyFrameworkProofV3Relocations.length,
        relocatedHearth: {
          entity: "framework-v2.hearth.2",
          from: [81, -94],
          to: [74, -91],
        },
        waterCells: colonyFrameworkProofV3WaterCells,
        sourceProof,
        requestedSteps: steps,
        completedSteps,
        firstWaterStep,
        maxChangedBytes,
        wallMs: performance.now() - started,
        error,
        initialWater,
        recovery,
        continuation,
        qualification,
        costLedger: {
          environment: { platform: platform(), arch: arch(), cpus: cpus().map(({ model }) => model) },
          source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
          nativeSource,
          wasmSha256: hash(wasm),
          advance: percentileSummary(advanceMs),
          changedRecordCapture: percentileSummary(captureMs),
          changedRecordRows: recordCosts.reduce((sum, row) => sum + row.puts, 0),
          changedRecordBytes: recordCosts.reduce((sum, row) => sum + row.bytes, 0),
          maxChangedBytes,
          hostAccounting: "SQL, host invocation CPU, publication and alarm timing are not measured by this local WASM run",
        },
        commands,
        samples,
        gaps: [
          "New v4 data workload; not comparable v3 before/after",
          "Local WASM only; no hosted capacity claim",
          "Physical source witness is separate from automatic scheduled delivery",
          "placementRevision is a disposable invalidation token, excluded from physical recovery comparison",
        ],
      },
      null,
      2,
    ),
  );
  if (
    error ||
    !continuation.environmentMatches ||
    !continuation.materialMatches ||
    !continuation.workersMatch ||
    !continuation.waterAccountMatches
  )
    process.exitCode = 1;
} finally {
  port.dispose();
  recovered.port.dispose();
}
