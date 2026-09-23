import {
  DynamicWorkerExecutor,
  sanitizeToolName,
  type DynamicWorkerExecutorOptions,
} from "@cloudflare/codemode";
import type {
  Sandbox,
  SandboxBinding,
  SandboxRequest,
  SandboxValue,
} from "@fungi.computer/mycelium";
import { Mycelium } from "@fungi.computer/mycelium";
import { RpcTarget } from "cloudflare:workers";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

class BindingConnectorTarget extends RpcTarget {
  readonly #name: string;
  readonly #operations: Readonly<Record<string, SandboxBinding>>;

  constructor(
    name: string,
    operations: Readonly<Record<string, SandboxBinding>>,
  ) {
    super();
    this.#name = name;
    this.#operations = operations;
  }

  async callTool(toolName: string, input: SandboxValue): Promise<SandboxValue> {
    const operation = this.#operations[toolName];
    if (operation === undefined) {
      throw new Error(
        `Tool "${toolName}" not found in connector "${this.#name}"`,
      );
    }
    return operation(input);
  }
}

class CodemodeSandboxAdapter implements Sandbox {
  readonly #loader: DynamicWorkerExecutorOptions["loader"];

  constructor(loader: DynamicWorkerExecutorOptions["loader"]) {
    this.#loader = loader;
  }

  async execute(
    request: SandboxRequest,
    signal: AbortSignal,
  ): Promise<SandboxValue> {
    const connectors = Object.entries(request.bindings).map(
      ([name, operations]) => {
        if (sanitizeToolName(name) !== name) {
          throw new Error(
            `Mycelium namespace "${name}" cannot be bound in Code Mode`,
          );
        }
        return {
          name,
          binding: new BindingConnectorTarget(name, operations),
        };
      },
    );

    let detachAbort = (): void => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      const onAbort = (): void => {
        reject(new DOMException("Execution cancelled by user", "AbortError"));
      };
      if (signal.aborted) onAbort();
      else {
        signal.addEventListener("abort", onAbort, { once: true });
        detachAbort = signal.removeEventListener.bind(signal, "abort", onAbort);
      }
    });

    try {
      const executor = new DynamicWorkerExecutor({
        loader: this.#loader,
        timeout: request.timeoutMs,
        globalOutbound: null,
      });
      const output = await Promise.race([
        executor.execute(request.code, [], { connectors }),
        aborted,
      ]);
      if (output.error !== undefined) throw new Error(output.error);
      return { executionId: request.executionId, value: output.result };
    } finally {
      detachAbort();
    }
  }
}

/** Existing Botanical execute capability on the host's native Code Mode sandbox.
 * Guest code has no outbound network. Only its registered inner operations can
 * reach the owner; the host retains credentials and cancellation responsibility. */
export function codeModeSandbox(loader: DynamicWorkerExecutorOptions["loader"]): Sandbox {
  return new CodemodeSandboxAdapter(loader);
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
