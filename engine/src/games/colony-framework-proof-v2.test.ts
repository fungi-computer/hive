import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "../runtime/session";
import { wasmKernelPort } from "../runtime/wasm-kernel";
import { query } from "../sdk/authoring";
import { FiniteResource, MaterialLot } from "../sdk/common";
import { ColonyTreePolicy } from "./colony-work";
import { createColonyFrameworkProofPack, createColonyFrameworkProofV2Pack } from "./colony-performance";
import { driveColonyFrameworkProofV2 } from "./colony-framework-proof-v2-driver";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("v2 preauthors three finite cohorts across the Region without replacing v1", () => {
  const v1 = createColonyFrameworkProofPack(), pack = createColonyFrameworkProofV2Pack();
  assert.equal(v1.id, "colony-framework-proof-256-100-v1");
  assert.equal(v1.initialActions?.length, 128);
  assert.equal(pack.id, "colony-framework-proof-256-100-v2");
  assert.deepEqual(pack.definition, createColonyFrameworkProofV2Pack().definition);
  const definition = JSON.parse(new TextDecoder().decode(pack.definition));
  const trees = definition.initial.filter((row: any) => row.components["colony.tree"]);
  assert.equal(trees.length, 384);
  assert.equal(trees.filter((row: any) => row.components["colony.tree-policy"].designated).length, 128);
  assert.equal(trees.reduce((sum: number, row: any) => sum + row.components["hive.finite-resource"].quantity, 0), 2304);
  assert.equal(pack.initialActions?.length, 128);
  const environment = JSON.parse(new TextDecoder().decode(pack.environmentDefinition!));
  const placements = environment.initialPlacements;
  assert.equal(new Set(placements.map((row: any) => row.column.join(","))).size, placements.length);
  assert.ok(placements.length <= 512);
  assert.ok(placements.every((row: any) => row.column.every((value: number) => value >= -128 && value < 128)));
  assert.deepEqual(environment.atmosphere.min, { x: -128, y: -32, z: -128 });
  assert.deepEqual(environment.atmosphere.max, { x: 128, y: 40, z: 128 });
});

test("later cohort designation admits existing finite stock once and survives restore", () => {
  const port = wasmKernelPort(new WasmKernel()), restoredPort = wasmKernelPort(new WasmKernel());
  const pack = createColonyFrameworkProofV2Pack();
  const session = new GameSession({ port, pack });
  try {
    session.start();
    const initialAir = session.environmentFacts() as { emissions: unknown[] };
    assert.equal(initialAir.emissions.length, 4, "native admission consumes four finite fuel lots");
    assert.equal(session.query(query(MaterialLot)).filter(row => row.get(MaterialLot).kind === "wood").reduce((sum, row) => sum + row.get(MaterialLot).quantity, 0), 0);
    session.step(.1);
    for (let step = 601; step <= 604; step++) {
      driveColonyFrameworkProofV2(session, step);
      session.step(.1);
      assert.equal(session.save().outcomes.length, 32);
      assert.ok(session.save().outcomes.every(outcome => outcome.result.accepted));
    }
    const snapshot = session.save();
    assert.equal(session.query(query(ColonyTreePolicy)).filter(row => row.get(ColonyTreePolicy).designated).length, 256);
    assert.equal(session.query(query(FiniteResource)).reduce((sum, row) => sum + row.get(FiniteResource).quantity, 0), 2304);
    assert.throws(() => driveColonyFrameworkProofV2(session, 601), /no available tree designations selected/);
    const restored = new GameSession({ port: restoredPort, pack });
    restored.restore(snapshot);
    assert.equal(restored.query(query(ColonyTreePolicy)).filter(row => row.get(ColonyTreePolicy).designated).length, 256);
    assert.deepEqual(restored.environmentFacts(), session.environmentFacts());
  } finally { port.dispose(); restoredPort.dispose(); }
});
