/** First-20-step feature ablations. These are diagnostic derivatives, never a
 * replacement qualification fixture or a before/after mutation of frozen v2. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { initSync, WasmKernel } from "../generated/hive_kernel.js";
import { GameSession } from "../src/runtime/session";
import { wasmKernelPort } from "../src/runtime/wasm-kernel";
import { createColonyFrameworkProofPack, createColonyFrameworkProofV2Pack } from "../src/games/colony-performance";
import { driveColonyFrameworkProofV2 } from "../src/games/colony-framework-proof-v2-driver";
import type { GamePack } from "../src/contracts";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const wasm = readFileSync("engine/generated/hive_kernel_bg.wasm");
initSync({ module: wasm });
const variants = ["v1-reference", "v2-control", "no-paid-emissions", "small-atmosphere", "small-atmosphere-no-emissions", "no-reserve-trees"] as const;
const selected = process.argv.find(arg => arg.startsWith("--variant="))?.slice(10);
if (selected && !variants.includes(selected as typeof variants[number])) throw new Error("unknown diagnostic variant");
const runs = [];
for (const variant of variants.filter(value => !selected || value === selected)) {
  let pack: GamePack = variant === "v1-reference" ? createColonyFrameworkProofPack() : createColonyFrameworkProofV2Pack();
  if (variant === "no-paid-emissions" || variant === "small-atmosphere-no-emissions") pack = { ...pack, bootstrapActions: undefined };
  if (variant.startsWith("small-atmosphere")) {
    const environment = JSON.parse(new TextDecoder().decode(pack.environmentDefinition));
    environment.atmosphere.min = { x: -32, y: -32, z: -32 };
    environment.atmosphere.max = { x: 32, y: 40, z: 32 };
    pack = { ...pack, environmentDefinition: new TextEncoder().encode(JSON.stringify(environment)) };
  }
  if (variant === "no-reserve-trees") {
    const definition = JSON.parse(new TextDecoder().decode(pack.definition)) as { initial: { id: string; components: Record<string, unknown> }[] };
    const removed = new Set(definition.initial.filter(row => /^colony\.tree\.framework-v2\.[12]\./.test(row.id)).map(row => row.id));
    definition.initial = definition.initial.filter(row => !removed.has(row.id));
    const environment = JSON.parse(new TextDecoder().decode(pack.environmentDefinition)) as { initialPlacements: { entity: string }[] };
    environment.initialPlacements = environment.initialPlacements.filter(row => !removed.has(row.entity));
    pack = { ...pack, definition: new TextEncoder().encode(JSON.stringify(definition)), environmentDefinition: new TextEncoder().encode(JSON.stringify(environment)) };
  }
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack });
  let error: string | null = null, startMs: number | null = null;
  const steps: { step: number; advanceMs: number; captureMs: number; outcomes: { kind: string; accepted: boolean; reason: string | null }[] }[] = [];
  try {
    const startAt = performance.now();
    session.start();
    startMs = performance.now() - startAt;
    session.captureForCommit();
    for (let step = 1; step <= 20; step++) {
      if (variant !== "v1-reference") driveColonyFrameworkProofV2(session, step);
      session.runDisposableCandidate(() => {
        const advanceAt = performance.now();
        session.step(.1);
        const advanceMs = performance.now() - advanceAt;
        const captureAt = performance.now();
        const capture = session.captureForCommit();
        steps.push({ step, advanceMs, captureMs: performance.now() - captureAt,
          outcomes: capture.snapshot.outcomes.map(outcome => ({ kind: outcome.action.kind, accepted: outcome.result.accepted, reason: outcome.result.reason ?? null })) });
      });
    }
  } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
  finally { port.dispose(); }
  const sorted = steps.map(step => step.advanceMs).sort((a, b) => a - b);
  const summary = { count: sorted.length, p50: sorted[Math.ceil(sorted.length * .5) - 1] ?? null, p95: sorted[Math.ceil(sorted.length * .95) - 1] ?? null, total: sorted.reduce((sum, value) => sum + value, 0) };
  runs.push({ variant, fixture: pack.id, definitionSha256: hash(pack.definition), environmentSha256: hash(pack.environmentDefinition!), startMs, advanceMs: summary, error, steps });
}
process.stdout.write(JSON.stringify({ source: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), wasmSha256: hash(wasm), driverSha256: hash(readFileSync("engine/scripts/diagnose-framework-proof-v2.ts")), runtime: process.version, host: "local WASM, shared CPU; no Region/workerd", runs }, null, 2) + "\n");
