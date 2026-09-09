import {
  openRegion,
  type RegionSqliteOwner,
} from "../../src/engine/region/index.ts";
import { createQuarryRegionProgram } from "../../src/world-presets/excavation-region.ts";

// Local proof harness only. Credentials are generated per run; no public auth or
// administrative API is established by this consumer.
type Environment = {
  REGIONS: DurableObjectNamespace;
  WRITER_SECRET: string;
  SPECTATOR_SECRET: string;
  DEBUG_SECRET: string;
};
function authorized(request: Request, secret: string): boolean {
  return (
    Boolean(secret) &&
    request.headers.get("Authorization") === `Bearer ${secret}`
  );
}
export class QuarryRegion {
  private readonly region;
  private failBeforeReceipt = false;
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Environment,
  ) {
    const owner: RegionSqliteOwner = {
      sql: {
        exec: (statement, ...bindings) => {
          if (
            this.failBeforeReceipt &&
            statement.startsWith("INSERT INTO hive_region_receipts")
          ) {
            this.failBeforeReceipt = false;
            throw new Error("injected-before-commit");
          }
          return ctx.storage.sql.exec(statement, ...bindings);
        },
      },
      transactionSync: (operation) => ctx.storage.transactionSync(operation),
    };
    this.region = openRegion({
      owner,
      region: "quarry-proof-v1",
      program: createQuarryRegionProgram(),
    });
  }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
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
      ? "quarry-builder"
      : authorized(request, this.env.SPECTATOR_SECRET)
        ? "quarry-spectator"
        : null;
    if (!principal) return new Response("Forbidden", { status: 403 });
    const fault = request.headers.get("X-Harness-Fault");
    if (
      fault &&
      (request.headers.get("X-Harness-Debug") !== this.env.DEBUG_SECRET ||
        !this.env.DEBUG_SECRET)
    ) {
      return new Response("Forbidden", { status: 403 });
    }
    if (fault && fault !== "before-commit" && fault !== "after-commit")
      return new Response("Invalid fault", { status: 400 });
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 8192)
      return new Response("Too large", { status: 413 });
    try {
      // No await between arming and synchronous dispatch: another request cannot
      // consume this request's one-shot fault. Always clear it on parse/replay.
      this.failBeforeReceipt = fault === "before-commit";
      let receipt;
      try {
        receipt = this.region.dispatch(principal, JSON.parse(text));
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
  fetch(request: Request, env: Environment): Promise<Response> | Response {
    if (new URL(request.url).pathname === "/health")
      return Response.json({ service: "hive-region-local-proof" });
    return env.REGIONS.get(env.REGIONS.idFromName("quarry-proof-v1")).fetch(
      request,
    );
  },
};
