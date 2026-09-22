import { exposeTerrainPatch } from "./terrain-region-exposure.js";
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

test("native camera regions carry generated cover outside a performance world's central observation window", async () => {
  const { createColonyPerformancePack } = await import("../games/colony-performance");
  const { parseTerrainRegionEvent } = await import("./terrain-regions");
  const port = wasmKernelPort(new WasmKernel());
  try {
    const session = new GameSession({pack:createColonyPerformancePack(128,4),port});
    session.start();
    const frame=session.terrainView();if (!frame) throw new Error("missing terrain frame");
    assert(frame.surfaces.every(surface=>surface.cell[0]<32));
    assert.equal(frame.baseline.protocolVersion,5);
    const request={requestId:1,epoch:0,terrainRevision:frame.revision,regions:[[5,0,0]] as [number,number,number][]};
    const response=parseTerrainRegionEvent(session.terrainRegion(request,[5,0,0],0),request);
    assert.equal(response.kind,"patch");if(response.kind!=="patch")return;
    const surfaces=response.patch.surfaces;
    assert.equal(surfaces.length,100,"complete core plus one-column halo");
    assert(surfaces.every(surface=>surface.cell[0]>=39&&surface.cell[0]<=48));
    assert(surfaces.some(surface=>surface.cover?.kind==="grass"));
    const columns=surfaces.map(surface=>[surface.cell[0],surface.cell[2]] as [number,number]);
    const native=[...port.terrainSurfaces(columns.slice(0,64)),...port.terrainSurfaces(columns.slice(64))];
    assert.deepEqual(surfaces.map(({cover:_,...surface})=>surface),native);
    assert(exposeTerrainPatch({patch:response.patch,baseline:frame.baseline,level:frame.baseline.bounds.maxY-1}).every(face=>face.cell[0]>=40&&face.cell[0]<48));
    assert.equal(session.terrainView()?.revision,frame.revision,"camera reads do not advance physical state");
  } finally {port.dispose();}
});
