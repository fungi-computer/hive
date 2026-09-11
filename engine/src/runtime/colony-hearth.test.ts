import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { entity, MaterialLot, query, transfer } from "../sdk/common";
import { colonyLumberId, colonyPack } from "../games/colony";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

const worker = entity("colony.worker.1");
const hearth = entity("colony.hearth");
const lumberLot = entity("colony.lumber.initial");

function quantity(session: GameSession, container: string): number {
  return session.query(query(MaterialLot)).reduce((total, row) => {
    const lot = row.get(MaterialLot);
    return total + (lot.container === container ? lot.quantity : 0);
  }, 0);
}

test("actual Colony hearth consumes wood and emits into sampled air", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ port, pack: colonyPack });
    session.start();
    const surface = port.terrainSurfaces([[1, -1]])[0];
    assert(surface, "hearth placement must have a generated support surface");
    const airCell: [number, number, number] = [1, surface.cell[1] + 1, -1];
    const beforeAir = port.atmosphereSamples([airCell]).samples[0];
    assert(beforeAir, "Colony hearth must begin in a modeled air receiver");

    // Colony's current delivery work is authored for bread/guest service. The
    // existing native transfer owner is therefore used to stage hearth fuel;
    // no lot or position is manufactured by this proof.
    session.request(transfer(lumberLot, colonyLumberId, hearth, 2));
    session.step(0);
    assert.equal(quantity(session, hearth), 2);
    assert.equal(quantity(session, colonyLumberId), 46);

    session.command("lightHearth", { entities: [worker] });
    session.step(0);
    const admission = session.save().outcomes.find(
      outcome => outcome.action.kind === "begin-emission",
    );
    assert.equal(admission?.result.accepted, true, JSON.stringify(admission));
    assert.equal(quantity(session, hearth), 0, "admission debits fuel exactly once");

    session.step(1);
    const afterAir = port.atmosphereSamples([airCell]).samples[0];
    assert(afterAir, "the modeled hearth receiver must remain queryable");
    assert(afterAir.smokeKgM3 > beforeAir.smokeKgM3, "paid smoke must reach sampled air");
    const saved = session.save();
    const expected = port.atmosphereSamples([airCell]);
    session.step(0.25);
    const expectedNext = port.atmosphereSamples([airCell]);

    session.restore(saved);
    assert.deepEqual(port.atmosphereSamples([airCell]), expected);
    session.step(0.25);
    assert.deepEqual(port.atmosphereSamples([airCell]), expectedNext);
  } finally {
    port.dispose();
  }
});
