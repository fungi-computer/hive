import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { colonyPack } from "../games/colony";
import { wasmKernelPort } from "./wasm-kernel";
import { WorkerRuntime } from "./worker";
import type { WorkerTransportEvent } from "./protocol";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("Colony local worker sends baseline then same-revision terrain reference and resets baseline", () => {
  const events: WorkerTransportEvent[] = [];
  const runtime = new WorkerRuntime(() => wasmKernelPort(new WasmKernel()), { colony: colonyPack }, event => events.push(event));
  try {
    runtime.command({ type: "start", game: "colony" });
    runtime.command({ type: "step", delta: 0.1 });
    const frames = events.filter((event): event is Extract<WorkerTransportEvent, { type: "frame" }> => event.type === "frame");
    assert.equal(Boolean(frames[0].terrain && "surfaces" in frames[0].terrain), true);
    assert.equal(Boolean(frames[1].terrain && "surfaces" in frames[1].terrain), false);
    runtime.command({ type: "reset" });
    const afterReset = events.filter((event): event is Extract<WorkerTransportEvent, { type: "frame" }> => event.type === "frame").at(-1);
    assert.equal(Boolean(afterReset?.terrain && "surfaces" in afterReset.terrain), true);
  } finally { runtime.dispose(); }
});

test("runtime metrics are opt-in", () => {
  const normal: WorkerTransportEvent[] = [];
  const measured: WorkerTransportEvent[] = [];
  const a = new WorkerRuntime(() => wasmKernelPort(new WasmKernel()), { colony: colonyPack }, event => normal.push(event));
  const b = new WorkerRuntime(() => wasmKernelPort(new WasmKernel()), { colony: colonyPack }, event => measured.push(event), { metrics: true });
  try {
    a.command({ type: "start", game: "colony" }); a.command({ type: "step", delta: 0.1 });
    b.command({ type: "start", game: "colony" }); b.command({ type: "step", delta: 0.1 });
    assert.equal(normal.find(event => event.type === "results")?.metrics, undefined);
    assert.equal(typeof measured.find(event => event.type === "results")?.metrics?.stepCpuMs, "number");
  } finally { a.dispose(); b.dispose(); }
});

test("actual Worker region stream supports progressive delivery, reset, supersession and disposal", async () => {
  const events: WorkerTransportEvent[]=[];
  let onRegion: ((event: import("./terrain-regions").TerrainRegionEvent)=>void)|undefined;
  const runtime=new WorkerRuntime(()=>wasmKernelPort(new WasmKernel()),{colony:colonyPack},event=>{
    events.push(event);if(event.type==="terrain-regions")onRegion?.(event.event);
  });
  const latestFrame=()=>events.filter((event):event is Extract<WorkerTransportEvent,{type:"frame"}>=>event.type==="frame").at(-1)!;
  const regionEvents=(id:number)=>events.filter((event):event is Extract<WorkerTransportEvent,{type:"terrain-regions"}>=>event.type==="terrain-regions"&&event.event.requestId===id).map(event=>event.event);
  function request(requestId:number) {
    const frame=latestFrame();assert(frame.terrain);
    return {type:"terrain-regions" as const,requestId,epoch:frame.epoch,terrainRevision:frame.terrain.revision,level:39,regions:[[0,0],[1,0]] as [number,number][]};
  }
  function untilTerminal(id:number,afterPatch?:()=>void) {
    return new Promise<import("./terrain-regions").TerrainRegionEvent>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error(`missing terrain terminal ${id}`)),5000);
      onRegion=event=>{
        if(event.requestId!==id)return;
        if(event.kind==="patch")afterPatch?.();
        else {clearTimeout(timeout);onRegion=undefined;resolve(event);}
      };
    });
  }
  try {
    runtime.command({type:"start",game:"colony"});
    const first=latestFrame();assert(first.terrain&&"baseline" in first.terrain);
    assert.equal(first.terrain.baseline.protocolVersion,4);
    const done=untilTerminal(1);runtime.command(request(1));
    assert.equal((await done).kind,"complete");
    assert.deepEqual(regionEvents(1).map(event=>event.kind),["patch","patch","complete"]);
    const patches=regionEvents(1).filter(event=>event.kind==="patch");
    assert.deepEqual(patches.map(event=>event.patch.key),[[0,0],[1,0]]);
    assert(patches.every(event=>event.patch.surfaces.length===100));
    assert.equal(latestFrame(),first,"read stream emits no new physical frame");

    runtime.command(request(2));runtime.command({type:"terrain-cancel",requestId:2});
    const superseded=untilTerminal(4);runtime.command(request(3));runtime.command(request(4));
    await superseded;
    assert.equal(regionEvents(2).length,0);assert.equal(regionEvents(3).length,0);

    const priorEpoch=latestFrame().epoch;
    const reset=untilTerminal(5,()=>runtime.command({type:"reset"}));runtime.command(request(5));
    const stale=await reset;assert.equal(stale.kind,"stale");assert(stale.epoch>priorEpoch);
    assert.deepEqual(regionEvents(5).map(event=>event.kind),["patch","stale"],"reset prevents remaining old-world patches");
    const recovered=untilTerminal(6);runtime.command(request(6));assert.equal((await recovered).kind,"complete");

    await new Promise<void>(resolve=>{
      onRegion=event=>{if(event.requestId===7&&event.kind==="patch") {runtime.dispose();resolve();}};
      runtime.command(request(7));
    });
    await new Promise(resolve=>setTimeout(resolve,5));
    assert.deepEqual(regionEvents(7).map(event=>event.kind),["patch"],"disposal retires delivery between regions");
  } finally {runtime.dispose();}
});
