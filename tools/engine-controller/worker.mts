import { DurableObject } from "cloudflare:workers";
import {
  DynamicWorkerExecutor,
  type DynamicWorkerExecutorOptions,
} from "@cloudflare/codemode";
import { Mycelium, type Sandbox } from "@fungi.computer/mycelium";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { z } from "zod";
import {
  openRegion,
  type RegionSqliteOwner,
} from "../../src/engine/region/index.ts";
import { createQuarryRegionProgram } from "../../src/world-presets/excavation-region.ts";
import { quarryController } from "./quarry.mts";

type Env = {
  REGION: DurableObjectNamespace<QuarryController>;
  LOADER: DynamicWorkerExecutorOptions["loader"];
  BUILDER_KEY: string;
  UNAUTHORIZED_KEY: string;
};
const executeInput = z.strictObject({ code: z.string().min(1).max(16_384) });

/** The existing native Codemode executor owns JavaScript isolation and lifetime.
 * We never claim cooperative abort has stopped it before execute settles.
 * No outbound network is granted to guest programs.
 */
function sandbox(loader: Env["LOADER"]): Sandbox {
  return {
    async execute(request, signal) {
      signal.throwIfAborted();
      const executor = new DynamicWorkerExecutor({
        loader,
        timeout: request.timeoutMs,
        globalOutbound: null,
      });
      const output = await executor.execute(
        request.code,
        Object.entries(request.bindings).map(([name, fns]) => ({ name, fns })),
      );
      signal.throwIfAborted();
      if (output.error !== undefined) throw new Error("guest-execution-failed");
      return { executionId: request.executionId, value: output.result };
    },
  };
}

export class QuarryController extends DurableObject<Env> {
  private readonly region;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const owner: RegionSqliteOwner = {
      sql: {
        exec<
          Row extends Record<
            string,
            string | number | null | ArrayBuffer | Uint8Array
          >,
        >(
          statement: string,
          ...bindings: (string | number | null | ArrayBuffer | Uint8Array)[]
        ) {
          const cursor = ctx.storage.sql.exec(statement, ...bindings);
          return { toArray: () => cursor.toArray() as Row[] };
        },
      },
      transactionSync: (operation) => ctx.storage.transactionSync(operation),
    };
    this.region = openRegion({
      owner,
      region: "controller-quarry",
      program: createQuarryRegionProgram(),
    });
  }
  async fetch(request: Request): Promise<Response> {
    // Credentials select a principal; neither code nor request JSON can do so.
    const authorization = request.headers.get("authorization");
    const principal =
      authorization === `Bearer ${this.env.BUILDER_KEY}`
        ? "quarry-builder"
        : authorization === `Bearer ${this.env.UNAUTHORIZED_KEY}`
          ? "quarry-outsider"
          : null;
    if (principal === null)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    const parsed = executeInput.safeParse(await request.json());
    if (!parsed.success)
      return Response.json({ error: "invalid-execute" }, { status: 400 });
    const runtime = await Mycelium.make({
      modules: [quarryController(this.region, principal)],
      sandbox: sandbox(this.env.LOADER),
      execution: { timeoutMs: 10_000, abortGraceMs: 2_000 },
    });
    try {
      const lease = await runtime.acquire({ signal: request.signal });
      try {
        const signal = request.signal;
        const prepared = await Effect.runPromise(
          lease.executeTool.prepare({
            type: "toolCall",
            id: crypto.randomUUID(),
            name: "execute",
            arguments: parsed.data,
          }),
          { signal },
        );
        const parts = await Effect.runPromise(
          Stream.runCollect(prepared.execute()),
          { signal },
        );
        for (const part of parts) {
          if (part.type !== "result") continue;
          if (part.result.isError)
            return Response.json(
              { error: "execution-failed" },
              { status: 400 },
            );
          const content = part.result.content.find(
            (entry) => entry.type === "text",
          );
          if (content?.type === "text")
            return new Response(content.text, {
              headers: { "content-type": "application/json" },
            });
        }
        return Response.json({ error: "missing-result" }, { status: 500 });
      } finally {
        await lease.release();
      }
    } catch {
      // A failure here is not evidence that an already committed command failed.
      return Response.json(
        { error: "execution-failed; retry identical command input" },
        { status: 400 },
      );
    } finally {
      await runtime.close();
    }
  }
}

export default {
  fetch(request: Request, env: Env) {
    return env.REGION.get(env.REGION.idFromName("controller-quarry")).fetch(
      request,
    );
  },
};
