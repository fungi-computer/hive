import { DynamicWorkerExecutor, type DynamicWorkerExecutorOptions } from "@cloudflare/codemode";
import { Mycelium, type Sandbox } from "@fungi.computer/mycelium";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

/** Existing Botanical execute capability on the host's native Code Mode sandbox.
 * Guest code has no outbound network. Only its registered inner operations can
 * reach the owner; the host retains credentials and cancellation responsibility. */
export function codeModeSandbox(loader: DynamicWorkerExecutorOptions["loader"]): Sandbox {
  return {
    async execute(request, signal) {
      signal.throwIfAborted();
      const executor = new DynamicWorkerExecutor({ loader, timeout: request.timeoutMs, globalOutbound: null });
      const output = await executor.execute(request.code, Object.entries(request.bindings).map(([name, fns]) => ({ name, fns })));
      signal.throwIfAborted();
      if (output.error !== undefined) throw new Error("guest-execution-failed");
      return { executionId: request.executionId, value: output.result };
    },
  };
}

/** One lease and execute lifetime; neither its transient ID nor cancellation
 * changes the Region command identity retained by the caller for retry. */
export async function executeCapability(
  modules: Parameters<typeof Mycelium.make>[0]["modules"],
  sandbox: Sandbox,
  code: string,
  signal: AbortSignal,
): Promise<unknown> {
  const runtime = await Mycelium.make({ modules, sandbox, execution: { timeoutMs: 10_000, abortGraceMs: 2_000 } });
  try {
    const lease = await runtime.acquire({ signal });
    try {
      const prepared = await Effect.runPromise(lease.executeTool.prepare({
        type: "toolCall", id: crypto.randomUUID(), name: "execute", arguments: { code },
      }), { signal });
      const parts = await Effect.runPromise(Stream.runCollect(prepared.execute()), { signal });
      for (const part of parts) {
        if (part.type !== "result") continue;
        if (part.result.isError) throw new Error("execution-failed; retry identical command input");
        const content = part.result.content.find(entry => entry.type === "text");
        if (content?.type === "text") return JSON.parse(content.text);
      }
      throw new Error("missing-execute-result");
    } finally { await lease.release(); }
  } finally { await runtime.close(); }
}
