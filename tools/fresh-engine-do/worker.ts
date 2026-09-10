import { DurableObject } from "cloudflare:workers";
import {
  openRegion,
  type RegionSqliteOwner,
} from "../../src/engine/region/index.ts";
import { createSessionRegionProgram } from "../../engine/src/runtime/region-program";
import { wasmKernelPort } from "../../engine/src/runtime/wasm-kernel";
import { survivalPack } from "../../engine/src/games/survival";
import { WasmKernel, initSync } from "../../engine/generated/hive_kernel.js";
import wasmBytes from "../../engine/generated/hive_kernel_bg.wasm";

type Environment = {
  REGIONS: DurableObjectNamespace;
  WRITER_SECRET: string;
  HOST_SECRET: string;
  DEBUG_SECRET: string;
  IMPLEMENTATION_HASH: string;
};
function authorized(request: Request, secret: string) {
  return (
    Boolean(secret) &&
    request.headers.get("Authorization") === `Bearer ${secret}`
  );
}

export class FreshRegion extends DurableObject<Environment> {
  private region!: ReturnType<typeof openRegion>;
  private readonly ready: Promise<void>;
  private failBeforeReceipt = false;
  constructor(ctx: DurableObjectState, env: Environment) {
    super(ctx, env);
    const owner: RegionSqliteOwner = {
      sql: {
        exec: <Row extends Record<string, SqlStorageValue | Uint8Array>>(
          statement: string,
          ...bindings: (SqlStorageValue | Uint8Array)[]
        ) => {
          if (
            this.failBeforeReceipt &&
            statement.startsWith("INSERT INTO hive_region_receipts")
          ) {
            this.failBeforeReceipt = false;
            throw new Error("injected-before-commit");
          }
          const cursor = ctx.storage.sql.exec(statement, ...bindings);
          return { toArray: () => cursor.toArray() as Row[] };
        },
      },
      transactionSync: (operation) => ctx.storage.transactionSync(operation),
    };
    this.ready = ctx.blockConcurrencyWhile(async () => {
      if (!/^[a-f0-9]{64}$/.test(env.IMPLEMENTATION_HASH))
        throw new Error("missing immutable implementation hash");
      initSync({ module: wasmBytes });
      const program = createSessionRegionProgram({
        pack: survivalPack,
        createKernel: () => wasmKernelPort(new WasmKernel()),
        implementationHash: env.IMPLEMENTATION_HASH,
        ownerPrincipal: "survival-player",
        hostPrincipal: "survival-host",
        seed: 17,
      });
      this.region = openRegion({ owner, region: `survival-proof-v1`, program });
    });
  }
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const path = new URL(request.url).pathname;
    if (path === "/health")
      return Response.json({ service: "hive-fresh-engine-do-proof" });
    if (path === "/debug" && request.method === "GET") {
      if (!authorized(request, this.env.DEBUG_SECRET))
        return new Response("Forbidden", { status: 403 });
      await this.ctx.storage.sync();
      return Response.json({
        snapshot: this.region.readCommitted(),
        events: this.region.readEvents(0, 128),
      });
    }
    if (path !== "/command" || request.method !== "POST")
      return new Response("Not found", { status: 404 });
    const principal = authorized(request, this.env.WRITER_SECRET)
      ? "survival-player"
      : authorized(request, this.env.HOST_SECRET)
        ? "survival-host"
        : null;
    if (!principal) return new Response("Forbidden", { status: 403 });
    const fault = request.headers.get("X-Harness-Fault");
    if (
      fault &&
      (request.headers.get("X-Harness-Debug") !== this.env.DEBUG_SECRET ||
        !this.env.DEBUG_SECRET)
    )
      return new Response("Forbidden", { status: 403 });
    if (fault && fault !== "before-commit" && fault !== "after-commit")
      return new Response("Invalid fault", { status: 400 });
    try {
      const text = await request.text();
      if (new TextEncoder().encode(text).byteLength > 8192)
        return new Response("Too large", { status: 413 });
      const input = JSON.parse(text);
      this.failBeforeReceipt = fault === "before-commit";
      let receipt;
      try {
        receipt = this.region.dispatch(principal, input);
      } finally {
        this.failBeforeReceipt = false;
      }
      await this.ctx.storage.sync();
      if (fault === "after-commit")
        return Response.json(
          { error: "injected-after-commit" },
          { status: 503 },
        );
      return Response.json(receipt);
    } catch (error) {
      const message = error instanceof Error ? error.message : "command-failed";
      const status =
        message === "region-forbidden"
          ? 403
          : message === "region-command-conflict"
            ? 409
            : message === "injected-before-commit"
              ? 503
              : 400;
      return Response.json({ error: message }, { status });
    } finally {
      this.failBeforeReceipt = false;
    }
  }
}
export default {
  fetch(request: Request, env: Environment) {
    return env.REGIONS.get(env.REGIONS.idFromName("survival-proof-v1")).fetch(
      request,
    );
  },
};
