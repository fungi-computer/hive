import {
  openRegion,
  type RegionSqliteOwner,
} from "../../src/engine/region/index.ts";
import { createWetRegionProgram } from "../../src/world-presets/seepage/region.ts";

// Local proof harness only. Credentials are generated per run; no public auth or
// administrative API is established by this consumer.
type Environment = {
  REGIONS: DurableObjectNamespace;
  WRITER_SECRET: string;
  HOST_SECRET: string;
  DEBUG_SECRET: string;
};
function authorized(request: Request, secret: string): boolean {
  return (
    Boolean(secret) &&
    request.headers.get("Authorization") === `Bearer ${secret}`
  );
}
/** Request authority is harness-owned; physical admission stays in RegionProgram. */
function commandAuthority(request: Request, env: Environment) {
  const principal = authorized(request, env.WRITER_SECRET)
    ? "wet-world-player"
    : authorized(request, env.HOST_SECRET)
      ? "wet-world-host"
      : null;
  if (!principal) throw new Error("harness-forbidden");
  const fault = request.headers.get("X-Harness-Fault");
  if (
    fault &&
    (!env.DEBUG_SECRET ||
      request.headers.get("X-Harness-Debug") !== env.DEBUG_SECRET)
  )
    throw new Error("harness-forbidden");
  if (fault && fault !== "before-commit" && fault !== "after-commit")
    throw new Error("invalid-harness-fault");
  return { principal, fault };
}
function commandError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "command-failed";
  const statuses: Record<string, number> = {
    "harness-forbidden": 403,
    "region-forbidden": 403,
    "region-command-conflict": 409,
    "injected-before-commit": 503,
  };
  return Response.json(
    { error: message },
    { status: statuses[message] ?? 400 },
  );
}
export class WetRegion {
  private readonly region;
  private failReceiptCommit = false;
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Environment,
  ) {
    const owner: RegionSqliteOwner = {
      sql: {
        exec: <
          Row extends Record<
            string,
            string | number | null | ArrayBuffer | Uint8Array
          >,
        >(
          statement: string,
          ...bindings: (string | number | null | ArrayBuffer | Uint8Array)[]
        ) => {
          const cursor = ctx.storage.sql.exec(statement, ...bindings);
          if (
            this.failReceiptCommit &&
            statement.startsWith("INSERT INTO hive_region_receipts")
          ) {
            this.failReceiptCommit = false;
            throw new Error("injected-before-commit");
          }
          return { toArray: () => cursor.toArray() as Row[] };
        },
      },
      transactionSync: (operation) => ctx.storage.transactionSync(operation),
    };
    this.region = openRegion({
      owner,
      region: "wet-world-proof-v1",
      program: createWetRegionProgram(),
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
    return this.command(request);
  }
  private async command(request: Request): Promise<Response> {
    try {
      const { principal, fault } = commandAuthority(request, this.env);
      const text = await request.text();
      if (new TextEncoder().encode(text).byteLength > 8192)
        return new Response("Too large", { status: 413 });
      // No await between arming and synchronous dispatch: another request cannot
      // consume this request's one-shot fault. Always clear it on parse/replay.
      this.failReceiptCommit = fault === "before-commit";
      let receipt;
      try {
        receipt = this.region.dispatch(principal, JSON.parse(text));
      } finally {
        this.failReceiptCommit = false;
      }
      await this.ctx.storage.sync();
      if (fault === "after-commit") {
        // Harness-only lost-ack barrier. No receipt is returned. The external
        // read-only SQLite witness observes commit, then kills this owned host.
        for (;;) await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      return Response.json(receipt);
    } catch (error) {
      return commandError(error);
    }
  }
}
export default {
  fetch(request: Request, env: Environment): Promise<Response> | Response {
    if (new URL(request.url).pathname === "/health")
      return Response.json({ service: "hive-wet-region-local-proof" });
    return env.REGIONS.get(env.REGIONS.idFromName("wet-world-proof-v1")).fetch(
      request,
    );
  },
};
