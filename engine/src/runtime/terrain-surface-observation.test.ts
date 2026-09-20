import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { colonyPack } from "../games/colony";
import { GameSession } from "./session";
import { buildObservation } from "./observation";
import { wasmKernelPort } from "./wasm-kernel";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });
test("excavated surface retains the Rust generated height through observation and restore", () => {
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({ pack: colonyPack, port });
    session.start();
    const surface = () => buildObservation(session, { epoch: 0, sequence: 0 }).terrain?.surfaces.find(s => s.cell[0] === 1 && s.cell[2] === 0);
    const original = surface();
    assert(original);
    assert.equal(original.generatedTop, original.cell[1]);
    session.command("dig", { area: { start: [...original.cell], end: [...original.cell] } });
    let lowered = original;
    for (let tick = 0; tick < 240 && lowered.cell[1] === original.cell[1]; tick++) {
      session.step(0.1);
      lowered = surface()!;
    }
    assert.equal(lowered.cell[1], original.cell[1] - 1);
    assert.equal(lowered.generatedTop, original.generatedTop);
    session.restore(session.save());
    assert.deepEqual(surface(), lowered);
  } finally { port.dispose(); }
});

test("native camera chunks carry generated cover outside a performance world's central observation window", async () => {
  const { createColonyPerformancePack } = await import("../games/colony-performance");
  const { parseTerrainChunkReply } = await import("./terrain-chunks");
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({pack:createColonyPerformancePack(128,4),port});
    session.start();
    const frame=session.terrainView();if (!frame) throw new Error("missing terrain frame");
    assert(frame.surfaces.every(surface=>surface.cell[0]<32));
    const request={requestId:1,epoch:0,terrainRevision:frame.revision,chunks:[[5,0,0],[5,1,0]] as [number, number, number][]};
    const response=parseTerrainChunkReply(session.terrainChunks(request,0),request);
    assert.equal(response.kind,"ready");if(response.kind!=="ready")return;
    const surfaces=response.chunks[0].surfaces;
    assert.equal(surfaces.length,64);
    assert(surfaces.every(surface=>surface.cell[0]>=40&&surface.cell[0]<48));
    assert(surfaces.some(surface=>surface.cover?.kind==="grass"));
    assert.deepEqual(response.chunks[1].surfaces,surfaces);
    const native=port.terrainSurfaces(surfaces.map(surface=>[surface.cell[0],surface.cell[2]]));
    assert.deepEqual(surfaces.map(({cover:_,...surface})=>surface),native);
    assert.equal(session.terrainView()?.revision,frame.revision,"camera reads do not advance physical state");
  } finally {port.dispose();}
});
