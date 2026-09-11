import { DurableObject } from "cloudflare:workers";
import {
  openRegion,
  type RegionSqliteOwner,
} from "../../src/engine/region/index.ts";
import { createSessionRegionRuntime, type SessionResident, type SessionRegionState } from "../../engine/src/runtime/region-program";
import { buildObservation } from "../../engine/src/runtime/observation";
import { wasmKernelPort } from "../../engine/src/runtime/wasm-kernel";
import { survivalPack } from "../../engine/src/games/survival";
import { piratesPack } from "../../engine/src/games/pirates";
import { colonyPack } from "../../engine/src/games/colony";
import { formationsPack } from "../../engine/src/games/formations";
import { WasmKernel, initSync } from "../../engine/generated/hive_kernel.js";
import wasmBytes from "../../engine/generated/hive_kernel_bg.wasm";

type Environment = {
  REGIONS: DurableObjectNamespace;
  WRITER_SECRET: string;
  HOST_SECRET: string;
  DEBUG_SECRET: string;
  IMPLEMENTATION_HASH: string;
  PROOF_PACK: string;
};
function authorized(request: Request, secret: string) {
  return (
    Boolean(secret) &&
    request.headers.get("Authorization") === `Bearer ${secret}`
  );
}
function packFor(id: string) {
  switch (id) {
    case "survival":
      return survivalPack;
    case "pirates":
      return piratesPack;
    case "colony":
      return colonyPack;
    case "formations":
      return formationsPack;
    default:
      throw new Error("unsupported proof pack");
  }
}

export class FreshRegion extends DurableObject<Environment> {
  private region!: ReturnType<typeof openRegion<SessionRegionState, unknown>>;
  private resident!: SessionResident;
  private readonly ready: Promise<void>;
  private residentQueue: Promise<void> = Promise.resolve();
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
      const pack = packFor(this.env.PROOF_PACK);
      const principalPrefix = pack.id;
      const runtime = createSessionRegionRuntime({
        pack,
        createKernel: () => wasmKernelPort(new WasmKernel()),
        implementationHash: env.IMPLEMENTATION_HASH,
        ownerPrincipal: `${principalPrefix}-player`,
        hostPrincipal: `${principalPrefix}-host`,
        seed: 17,
      });
      this.resident = runtime.resident;
      const program = runtime.program;
      this.region = openRegion({
        owner,
        region: `${pack.id}-proof-v1`,
        program,
      });
    });
  }
  async fetch(request: Request): Promise<Response> {
    const run = this.residentQueue.then(() => this.fetchExclusive(request));
    this.residentQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async fetchExclusive(request: Request): Promise<Response> {
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
    if (path === "/observe" && request.method === "GET") {
      if (!authorized(request, this.env.WRITER_SECRET))
        return new Response("Forbidden", { status: 403 });
      await this.ctx.storage.sync();
      const committed = this.region.readCommitted();
      const sessionRecords = this.residentRecords(committed.revision);
      const observation = this.resident.observe(committed.revision, committed.state, sessionRecords, (session) => {
        const observation = buildObservation(session, {
          epoch: 0,
          sequence: committed.revision,
        });
        return Response.json({
          revision: committed.revision,
          observation,
        });
      });
      return observation;
    }
    if (path !== "/command" || request.method !== "POST")
      return new Response("Not found", { status: 404 });
    const packId = this.env.PROOF_PACK;
    packFor(packId);
    const principal = authorized(request, this.env.WRITER_SECRET)
      ? `${packId}-player`
      : authorized(request, this.env.HOST_SECRET)
        ? `${packId}-host`
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
        const committed = this.region.readCommitted();
        this.resident.begin(committed.revision, committed.state, this.residentRecords(committed.revision));
        receipt = this.region.dispatch(principal, input);
      } finally {
        this.failBeforeReceipt = false;
      }
      await this.ctx.storage.sync();
      if (fault === "after-commit")
        this.resident.discard();
      if (fault === "after-commit")
        return Response.json(
          { error: "injected-after-commit" },
          { status: 503 },
        );
      this.resident.accept(this.region.readCommitted().revision);
      return Response.json(receipt);
    } catch (error) {
      this.resident.discard();
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

  private residentRecords(revision: number) {
    let records: Map<string, Uint8Array> | undefined;
    return { read: (key: string) => {
      if (!records) {
        records = new Map();
        let cursor = "";
        for (;;) {
          const page = this.region.readRecords(revision, cursor, 40);
          for (const record of page.records) records.set(record.key, record.bytes);
          if (records.size > 40) throw new Error("proof-kernel-record-limit");
          if (page.nextKey === undefined) break;
          if (page.nextKey <= cursor) throw new Error("proof-kernel-record-cursor");
          cursor = page.nextKey;
        }
      }
      return records.get(key);
    } };
  }
}
export default {
  fetch(request: Request, env: Environment) {
    const packId = env.PROOF_PACK;
    packFor(packId);
    return env.REGIONS.get(env.REGIONS.idFromName(`${packId}-proof-v1`)).fetch(
      request,
    );
  },
};
