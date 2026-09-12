import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { MaterialLot, Position } from "../sdk/common";
import { entity, query } from "../sdk/authoring";
import { EmissionWork } from "../sdk/emission-work";
import { WorkParticipation } from "../sdk/work-control";
import { colonyPack } from "../games/colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });
const hearth = entity("colony.hearth");
const workers = [entity("colony.worker.1"), entity("colony.worker.2")];
const stationInput = { station: hearth };
function work(session: GameSession) {
  return session.query(query(EmissionWork)).find(row => row.id === hearth)!.get(EmissionWork);
}
function wood(session: GameSession) {
  return session.query(query(MaterialLot)).reduce((sum, row) => sum + (row.get(MaterialLot).kind === "wood" ? row.get(MaterialLot).quantity : 0), 0);
}
function until(session: GameSession, predicate: () => boolean, label: string) {
  for (let i = 0; i < 180 && !predicate(); i++) session.step(0.25);
  assert(predicate(), label + ": " + JSON.stringify(work(session)));
}
function fixture(run: (session: GameSession, port: ReturnType<typeof wasmKernelPort>) => void) {
  const port = wasmKernelPort(new WasmKernel());
  try { const session = new GameSession({ port, pack: colonyPack }); session.start(); run(session, port); }
  finally { port.dispose(); }
}

test("station request shares supply and assignment, commits one burn, and restores its pending result", () => fixture((session, port) => {
  const surface = port.terrainSurfaces([[1, -1]])[0]!;
  const airCell: [number, number, number] = [1, surface.cell[1] + 1, -1];
  const before = port.atmosphereSamples([airCell]).samples[0]!;
  const initialWood = wood(session);
  session.command("lightHearth", stationInput);
  session.command("lightHearth", stationInput); // same station intent, no duplicate work
  session.step(0);
  assert.equal(work(session).phase, "queued");
  assert.equal(work(session).actor, null, "missing fuel must not claim a worker");
  until(session, () => work(session).phase === "submitting", "ordinary workers must supply and light requested station");
  const receipt = session.save().outcomes.find(outcome => outcome.action.kind === "begin-emission");
  assert.equal(receipt?.result.accepted, true, JSON.stringify(receipt));
  assert.equal(wood(session), initialWood - 2);
  const pendingResult = session.save();
  session.restore(pendingResult);
  session.step(0.25);
  assert.equal(work(session).phase, "complete");
  assert.equal(work(session).actor, null);
  assert.equal(wood(session), initialWood - 2, "restored submitted ignition cannot charge fuel again");
  const after = port.atmosphereSamples([airCell]).samples[0]!;
  assert(after.smokeKgM3 > before.smokeKgM3);
  const expected = session.save();
  session.step(0.25);
  const nextAir = port.atmosphereSamples([airCell]);
  session.restore(expected);
  session.step(0.25);
  assert.deepEqual(port.atmosphereSamples([airCell]), nextAir);
}));

test("cancelled lighting releases intent and never debits fuel", () => fixture((session) => {
  const before = wood(session);
  session.command("lightHearth", stationInput);
  session.command("cancelIgnition", stationInput);
  session.step(0);
  for (let i = 0; i < 24; i++) session.step(0.25);
  assert.equal(work(session).phase, "idle");
  assert.equal(work(session).actor, null);
  assert.equal(wood(session), before);
}));

test("manual takeover releases ignition attendance without taking back the player's worker", () => fixture((session) => {
  session.command("lightHearth", stationInput);
  until(session, () => work(session).phase === "approaching", "station must receive ordinary worker assignment");
  const actor = work(session).actor!;
  const position = session.query(query(Position)).find(row => row.id === actor)!.get(Position);
  const other = workers.find(worker => worker !== actor)!;
  const otherPosition = session.query(query(Position)).find(row => row.id === other)!.get(Position);
  session.command("go", { entities: [actor], destination: { x: position.x, y: position.y, z: position.z, frame: null } });
  session.command("go", { entities: [other], destination: { x: otherPosition.x, y: otherPosition.y, z: otherPosition.z, frame: null } });
  session.step(0.25);
  assert.equal(work(session).actor, null);
  assert.equal(work(session).phase, "queued");
  assert.equal(session.query(query(WorkParticipation)).find(row => row.id === actor)!.get(WorkParticipation).automatic, false);
  for (let i = 0; i < 4; i++) session.step(0.25);
  assert.equal(work(session).actor, null);
}));

test("refused repeat ignition releases its worker and cannot debit an already burning station", () => fixture((session) => {
  const before = wood(session);
  session.command("lightHearth", stationInput);
  until(session, () => work(session).phase === "complete", "first ignition must finish");
  session.command("lightHearth", stationInput);
  until(session, () => work(session).phase === "blocked", "native active-burn refusal must settle the job");
  assert.match(work(session).reason, /already has a paid emission/);
  assert.equal(work(session).actor, null);
  assert.equal(wood(session), before - 2);
  session.command("cancelIgnition", stationInput);
  session.step(0);
  assert.equal(work(session).phase, "idle");
  assert.equal(wood(session), before - 2, "cancelled intent does not refund burned fuel");
}));
