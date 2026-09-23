import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { GameSession } from "./session";
import { WorkerRuntime } from "./worker";
import { wasmKernelPort } from "./wasm-kernel";
import { piratesPack, crewOneId } from "../games/pirates";
import { survivalPack } from "../games/survival";
import type { GamePack } from "../contracts";
import type { WorkerTransportEvent } from "./protocol";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });
const port = () => wasmKernelPort(new WasmKernel());
function changedDefinition(pack: GamePack, change: (definition: any) => void): GamePack {
  const definition = JSON.parse(new TextDecoder().decode(pack.definition));
  change(definition);
  return { ...pack, definition: new TextEncoder().encode(JSON.stringify(definition)) };
}

test("native optional schemas do not force Survival to declare unused work systems", () => {
  const first = port(), second = port();
  try {
    const session = new GameSession({ port: first, pack: survivalPack }); session.start(); session.step(0.1);
    const saved = session.save();
    const restored = new GameSession({ port: second, pack: survivalPack }); restored.restore(saved);
    assert.deepEqual(restored.save(), saved);
    for (const invalid of [
      changedDefinition(survivalPack, definition => definition.components.find((item: any) => item.id === "survival.condition").version++),
      changedDefinition(survivalPack, definition => definition.components.push({ id: "hive.work-participation", version: 2, fields: { automatic: "boolean" } })),
      changedDefinition(survivalPack, definition => definition.components.push({ id: "foreign.custom", version: 1, fields: {} })),
    ]) {
      const candidate = port();
      try { assert.throws(() => new GameSession({ port: candidate, pack: invalid }).restore(saved), /component versions/); }
      finally { candidate.dispose(); }
    }
  } finally { first.dispose(); second.dispose(); }
});

test("existing browser runtime restores Pirates with pending shared cargo work", () => {
  const events: WorkerTransportEvent[] = [];
  const runtime = new WorkerRuntime(port, { pirates: piratesPack }, event => events.push(event));
  try {
    runtime.command({ type: "start", game: "pirates" });
    runtime.command({ type: "command", name: "loadCargo", input: { entities: [crewOneId] } });
    runtime.command({ type: "step", delta: 0.1 }); runtime.command({ type: "save" });
    const saved = events.findLast(event => event.type === "saved");
    assert(saved?.type === "saved");
    runtime.command({ type: "restore", snapshot: saved.snapshot });
    assert(events.some(event => event.type === "restored"));
    assert.deepEqual(events.filter(event => event.type === "error"), []);
  } finally { runtime.dispose(); }
});
