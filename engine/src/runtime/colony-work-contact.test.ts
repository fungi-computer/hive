import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { query } from "../sdk/authoring";
import { ConstructionSite } from "../sdk/construction";
import { DeliveryTask } from "../sdk/delivery";

import { colonyPack } from "../games/colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

function finishedBrewStation(session: GameSession) {
  return session.query(query(ConstructionSite)).find((row) => {
    const site = row.get(ConstructionSite);
    return site.catalog === "brew-station" && site.phase === "finished";
  });
}

function stateDump(session: GameSession) {
  return JSON.stringify({
    sites: session.query(query(ConstructionSite)).map((row) => ({ id: row.id, ...row.get(ConstructionSite) })),
    deliveries: session.query(query(DeliveryTask)).map((row) => ({ id: row.id, ...row.get(DeliveryTask) })),
  });
}

function startSession() {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: colonyPack });
  session.start();
  return { port, session };
}

function buildBrewer(session: GameSession) {
  session.command("build", { catalog: "brew-station", orientation: "north", target: { cell: [1, 13, -1] } });
  for (let tick = 0; tick < 500 && !finishedBrewStation(session); tick++) session.step(0.25);
  const brewer = finishedBrewStation(session);
  assert(brewer, stateDump(session));
  return brewer;
}

test("a floor below a finished brewer completes without moving the brewer", () => {
  const { port, session } = startSession();
  try {
    const brewer = buildBrewer(session);
    session.command("build", { catalog: "timber-floor", orientation: "north", target: { cell: [1, 13, -1] } });
    session.step(0);
    const floor = session.query(query(ConstructionSite)).find((row) => row.get(ConstructionSite).catalog === "timber-floor");
    assert(floor, stateDump(session));
    const currentFloor = () => session.query(query(ConstructionSite)).find(row => row.id === floor.id)?.get(ConstructionSite);
    assert.equal(floor.get(ConstructionSite).y + 1, brewer.get(ConstructionSite).y, "floor is the face below the fixture, not a cell inside it");
    for (let tick = 0; tick < 240 && currentFloor()?.phase !== "finished"; tick++) session.step(0.25);
    assert.equal(currentFloor()?.phase, "finished", stateDump(session));
    assert.equal(finishedBrewStation(session)?.id, brewer.id);
  } finally {
    port.dispose();
  }
});
