import * as generated from "../../generated/hive_kernel.js";
import { installWorkerRuntime } from "./worker-entry";
import { colonyPack } from "../games/colony";
import { createColonyPerformancePack } from "../games/colony-performance";
import type { WorkerCommand } from "./protocol";

const early: MessageEvent<WorkerCommand>[] = [];
self.onmessage = event => {
  if (early.length < 64) early.push(event);
  else self.postMessage({ type: "error", message: "performance worker startup queue full" });
};
const query = new URLSearchParams(self.location.search);
const size = Number(query.get("size")), workers = Number(query.get("workers"));
if (![64, 128, 256].includes(size) || ![4, 8, 16, 32, 50].includes(workers))
  throw new Error("invalid performance preset");
const performanceId = `colony-performance-${size}-${workers}`;
const packs = { [performanceId]: createColonyPerformancePack(size as 64 | 128 | 256, workers as 4 | 8 | 16 | 32 | 50) };
void generated.default().then(() => installWorkerRuntime(self, () => new generated.WasmKernel(), {
  colony: colonyPack, ...packs,
}, { metrics: true })).then(runtime => {
  for (const event of early) runtime.command(event.data);
  early.length = 0;
}).catch(error => self.postMessage({ type: "error", message: String(error) }));
