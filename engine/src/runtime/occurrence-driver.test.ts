import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { createSessionRegionRuntime } from "./region-program";
import { hydrateSession } from "./session-record-store";
import { readKernelEntities } from "./kernel-records";
import { openRegion } from "../../../src/engine/region/index.ts";
import { sqliteTestOwner } from "../../../src/engine/region/sqlite-test-owner.mjs";
import { publicPackRegistration } from "../../../tools/public-engine-host/pack-registration";
import { advanceDrivenOccurrence } from "./occurrence-driver";
import { driveColonyFrameworkProofV2 } from "../games/colony-framework-proof-v2-driver";
import { colonyFrameworkProofV2GameId, colonyFrameworkProofV3GameId, colonyFrameworkProofV2Schedule } from "../games/colony-performance-config";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

for (const game of [colonyFrameworkProofV2GameId, colonyFrameworkProofV3GameId]) {
  test(`${game}: every scheduled command and delta matches the local driver`, () => {
    const registration = publicPackRegistration(game);
    assert.equal(registration.seed, 1);
    const scope = registration.pack.localScope;
    const make = () => {
      const commands: unknown[] = [];
      const session = { isPaused: false, terrainSurfaces: (columns: readonly [number, number][]) => columns.map(([x,z]) => ({cell:[x,4,z]})),
        command: (name: string, input: unknown, suppliedScope: unknown = scope) => { assert.deepEqual(suppliedScope, scope); commands.push({name,input}); },
        step: (delta: number) => { assert.equal(delta, colonyFrameworkProofV2Schedule.stepSeconds); return []; },
      };
      return { commands, session };
    };
    let totalCommands = 0;
    for (let step = 1; step <= colonyFrameworkProofV2Schedule.steps; step++) {
      const local = make(), hosted = make();
      const notes = driveColonyFrameworkProofV2(local.session as any, step);
      const result = advanceDrivenOccurrence(hosted.session as any, registration.occurrenceDriver!, step - 1, .1);
      assert.deepEqual(hosted.commands, local.commands);
      assert.deepEqual(result.commands, local.commands);
      assert.deepEqual(result.notes, notes);
      assert.equal(result.step, step);
      totalCommands += result.commands.length;
    }
    assert.equal(totalCommands, 17); // four stores + eight cohort releases + dig + four water
  });
}

test("real scheduled commands, physical step, capture and clock receipt roll back and replay together", () => {
  const registration = publicPackRegistration(colonyFrameworkProofV3GameId);
  const db = new DatabaseSync(":memory:");
  let failCommit = false;
  const owner = sqliteTestOwner(db, statement => {
    if (failCommit && statement.startsWith("UPDATE hive_region_clock SET")) throw new Error("injected clock commit failure");
  });
  let runtime: ReturnType<typeof createSessionRegionRuntime> | undefined;
  const open = () => {
    runtime?.resident.dispose();
    runtime = createSessionRegionRuntime({ pack: registration.pack, occurrenceDriver: registration.occurrenceDriver,
      seed: registration.seed, createKernel: () => wasmKernelPort(new WasmKernel()), implementationHash: "d".repeat(64),
      ownerPrincipal: "player", hostPrincipal: "host", scopeForPrincipal: principal => principal === "host" ? {kind:"host"} : registration.pack.localScope!,
    });
    return openRegion({owner, region:"scheduled-driver-law", program:runtime.program, clock:{principal:"host"}});
  };
  let region = open();
  const records = { read: (key: string) => db.prepare("SELECT record_bytes FROM hive_region_records WHERE record_key=?").get(key)?.record_bytes as Uint8Array | undefined };
  const occurrence = (sequence: number) => ({sequence,request:{id:`clock-${sequence}`,command:{kind:"step",delta:.1}}});
  const apply = (sequence: number) => {
    const committed = region.readCommitted(); runtime!.resident.begin(committed.revision, committed.state, records);
    try { const receipt = region.dispatchOccurrence("host", occurrence(sequence)); runtime!.resident.accept(receipt.revision); return receipt; }
    catch(error) { runtime!.resident.discard(); throw error; }
  };
  const localPort = wasmKernelPort(new WasmKernel());
  const local = new GameSession({port:localPort,pack:registration.pack,seed:registration.seed});
  try {
    local.start();
    const first = apply(0);
    driveColonyFrameworkProofV2(local, 1); local.step(.1);
    const before = region.readCommitted();
    const beforeRecords = db.prepare("SELECT * FROM hive_region_records ORDER BY record_key").all();
    failCommit = true;
    assert.throws(() => apply(1), /injected clock commit failure/);
    assert.deepEqual(region.readCommitted(), before);
    assert.deepEqual(db.prepare("SELECT * FROM hive_region_records ORDER BY record_key").all(), beforeRecords);
    failCommit = false;
    region = open();
    assert.deepEqual(apply(0), first);
    const second = apply(1);
    const driven = (second.result as any).results;
    assert.equal(driven.step, 2); assert.equal(driven.commands.length, 4);
    assert.equal(driven.actions.rejected, 0);
    driveColonyFrameworkProofV2(local, 2); local.step(.1);
    const hosted = hydrateSession(region.readCommitted().state.session, records);
    const expected = local.save();
    assert.equal(hosted.now, expected.now);
    assert.equal(hosted.random, expected.random);
    assert.deepEqual(readKernelEntities(hosted.kernel).scene, readKernelEntities(expected.kernel).scene);
    assert.deepEqual(hosted.pendingActions, expected.pendingActions);
    assert.deepEqual(hosted.outcomes, expected.outcomes);
    region = open();
    assert.deepEqual(apply(1), second);
    assert.equal(region.readCommitted().state.session.now, .2);
    assert.throws(() => {
      const committed = region.readCommitted(); runtime!.resident.begin(committed.revision, committed.state, records);
      region.dispatch("host", {id:"ordinary-cannot-drive",replayEpoch:0,command:{kind:"step",delta:.1}});
    }, /requires a Region clock occurrence/);
    assert.equal(region.readCommitted().state.session.now, .2);
  } finally { runtime?.resident.dispose(); localPort.dispose(); db.close(); }
});

test("scheduled command budget failure after an admitted command cannot escape the candidate", () => {
  const registration = publicPackRegistration(colonyFrameworkProofV3GameId);
  const calls: unknown[] = [];
  const fake: any = { isPaused:false, command: (...args: unknown[]) => calls.push(args), terrainSurfaces: () => [], step: () => { throw new Error("physical step must not run"); } };
  assert.throws(() => advanceDrivenOccurrence(fake, {...registration.occurrenceDriver!, beforeStep(context) {
    context.command("first", {});
    context.command("oversized", {value:"x".repeat(5000)});
    return [];
  }}, 0, .1), /scheduled command budget/);
  assert.equal(calls.length, 1); // enclosing disposable Region owns rollback, tested above
  assert.throws(() => advanceDrivenOccurrence(fake, registration.occurrenceDriver!, undefined, .1), /requires a Region clock/);
  assert.throws(() => advanceDrivenOccurrence(fake, registration.occurrenceDriver!, 0, .2), /invalid clock state/);
});
