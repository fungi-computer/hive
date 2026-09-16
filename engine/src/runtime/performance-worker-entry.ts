import * as generated from "../../generated/hive_kernel.js";
import { installWorkerRuntime } from "./worker-entry";
import { wasmKernelPort } from "./wasm-kernel";
import { colonyPack } from "../games/colony";
import { createColonyPerformancePack } from "../games/colony-performance";
import { colonyPerformanceGameId, parseColonyPerformanceWorkerName } from "../games/colony-performance-config";
import type { WorkerCommand, WorkerPlacementCommand, WorkerTerrainChunksCommand } from "./protocol";

const early: MessageEvent<WorkerCommand | WorkerPlacementCommand | WorkerTerrainChunksCommand>[] = [];
self.onmessage = event => {
  if (early.length < 64) early.push(event);
  else self.postMessage({ type: "error", message: "performance worker startup queue full" });
};
const preset = parseColonyPerformanceWorkerName(self.name);
if (!preset)
  throw new Error("invalid performance preset");
const { size, workers } = preset;
const performanceId = colonyPerformanceGameId(size, workers);
const packs = { [performanceId]: createColonyPerformancePack(size, workers) };
void generated.default().then(() => installWorkerRuntime(self, () => wasmKernelPort(new generated.WasmKernel()), {
  colony: colonyPack, ...packs,
}, { metrics: true })).then(runtime => {
  for (const event of early) runtime.command(event.data);
  early.length = 0;
}).catch(error => self.postMessage({ type: "error", message: String(error) }));
