import {
  Watchdog,
  type WatchdogRuntime,
  type WatchdogQueuedJob,
  type WatchdogRunningJob,
  type WatchdogSqliteOwner,
} from "@fungi.computer/watchdog";
import { z } from "zod";
import {
  openRegion,
  type RegionSqliteOwner,
} from "../../src/engine/region/index.ts";
import { createQuarryRegionProgram } from "../../src/world-presets/excavation-region.ts";

const REGION = "watchdog-quarry-proof-v1";
const QUEUE = "quarry";
const WAKE_DELAY_MS = 5_000;
const MAX_ADMISSIONS = 32;
const inputSchema = z
  .object({
    id: z.string().min(1).max(80),
    expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    command: z.unknown(),
  })
  .strict();
const payloadSchema = z
  .object({
    principal: z.enum(["quarry-builder", "quarry-spectator"]),
    input: inputSchema,
  })
  .strict();
type Principal = z.infer<typeof payloadSchema>["principal"];
type Env = {
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
function jobIdentity(principal: Principal, id: string): string {
  // JSON escaping can expand an input character to six characters. Check the
  // actual encoded tuple before any wake or durable admission, not only raw ID.
  const encoded = JSON.stringify([REGION, principal, id]);
  if (encoded.length > 256) throw new Error("harness-job-identity-too-long");
  return encoded;
}

/** One local-only DO consumer. The native alarm belongs to this host; Watchdog
 * owns job/claim/terminal rows and the region owns the physical result. */
export class WatchdogQuarry {
  private readonly owner: RegionSqliteOwner & WatchdogSqliteOwner;
  private readonly program = createQuarryRegionProgram();
  private readonly region;
  private readonly ready: Promise<void>;
  private dog!: WatchdogRuntime;
  private activeJob: string | null = null;
  private controlTail: Promise<void> = Promise.resolve();
  private controls = 0;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    this.owner = {
      sql: {
        exec: <Row extends Record<string, SqlStorageValue | Uint8Array>>(
          statement: string, ...bindings: (SqlStorageValue | Uint8Array)[]
        ) => {
          const cursor = ctx.storage.sql.exec(statement, ...bindings);
          // Native SQLite returns blobs as ArrayBuffer; the region capability also
          // permits Uint8Array bindings. SQL row shape belongs to each SQL owner.
          return { toArray: () => cursor.toArray() as Row[] };
        },
      },
      transactionSync: (operation) => ctx.storage.transactionSync(operation),
    };
    this.region = openRegion({
      owner: this.owner,
      region: REGION,
      program: this.program,
    });
    this.owner.transactionSync(() => {
      // Bounded harness admission links and one-shot crash barriers, NOT a job-state copy.
      this.owner.sql.exec(`CREATE TABLE IF NOT EXISTS hive_watchdog_harness (
        job_id TEXT PRIMARY KEY, barrier TEXT CHECK(barrier IN ('armed','reached')));
        CREATE TABLE IF NOT EXISTS hive_watchdog_witness (
        singleton INTEGER PRIMARY KEY CHECK(singleton=1), alarms INTEGER NOT NULL,
        repairs INTEGER NOT NULL);
        INSERT OR IGNORE INTO hive_watchdog_witness VALUES (1,0,0);`);
    });
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.dog = await Watchdog.make({
        owner: this.owner,
        isAlive: async (job) => this.activeJob === job.jobId,
        execute: (job, signal) => this.execute(job, signal),
        wake: { recompute: () => this.control(() => this.armPending()) },
      });
      // Repair is a backstop, not the autonomous-wake mechanism under test.
      await this.control(async () => {
        const head = await this.dog.readQueueHead(QUEUE);
        if (head.state !== "idle" && (await ctx.storage.getAlarm()) === null) {
          await this.prearm();
          this.owner.sql.exec(
            "UPDATE hive_watchdog_witness SET repairs=repairs+1 WHERE singleton=1",
          );
        }
      });
    });
  }

  /** Serializes short admission/wake control, never a running executor or its barrier.
   * This gate is disposable coordination; every acknowledged obligation is in SQL/alarm storage. */
  private async control<T>(operation: () => Promise<T>): Promise<T> {
    if (this.controls >= 16) throw new Error("harness-control-busy");
    this.controls++;
    const previous = this.controlTail;
    let release!: () => void;
    this.controlTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      this.controls--;
      release();
    }
  }

  private async prearm(): Promise<void> {
    const due = Date.now() + WAKE_DELAY_MS;
    const prior = await this.ctx.storage.getAlarm();
    // Never postpone an already earlier alarm. No deleteAlarm/disarm races.
    if (prior === null || prior > due) await this.ctx.storage.setAlarm(due);
  }
  private async armPending(): Promise<void> {
    if ((await this.dog.readQueueHead(QUEUE)).state !== "idle")
      await this.prearm();
    // Leave at most one harmless already-armed wake when the last job settles.
  }

  private async execute(job: WatchdogRunningJob, signal: AbortSignal) {
    this.activeJob = job.jobId;
    try {
      const payload = payloadSchema.parse(job.payload);
      if (job.jobId !== jobIdentity(payload.principal, payload.input.id))
        throw new Error("harness-job-identity");
      if (signal.aborted) return { kind: "cancelled" as const };
      // No await between cancellation check and atomic effect. EXACT input is replayed
      // after a disappeared claim; never refresh expectedRevision on recovery.
      this.region.dispatch(payload.principal, payload.input);
      await this.ctx.storage.sync();
      const barrier = this.owner.transactionSync(() => {
        const row = this.owner.sql
          .exec<{ barrier: string | null }>(
            "SELECT barrier FROM hive_watchdog_harness WHERE job_id=?",
            job.jobId,
          )
          .toArray()[0];
        if (row?.barrier !== "armed") return false;
        this.owner.sql.exec(
          "UPDATE hive_watchdog_harness SET barrier='reached' WHERE job_id=?",
          job.jobId,
        );
        return true;
      });
      if (barrier) {
        await this.ctx.storage.sync();
        // Fault is true process loss, not an exception Watchdog would settle failed.
        // Reached is durable; restart skips this barrier and replays region receipt.
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else
            signal.addEventListener("abort", () => resolve(), { once: true });
        });
      }
      return { kind: "completed" as const };
    } finally {
      this.activeJob = null;
    }
  }

  async alarm(): Promise<void> {
    await this.ready;
    const pending = await this.control(async () => {
      this.owner.sql.exec(
        "UPDATE hive_watchdog_witness SET alarms=alarms+1 WHERE singleton=1",
      );
      if ((await this.dog.readQueueHead(QUEUE)).state === "idle") return false;
      // Alarm being delivered is consumed. Persist its successor BEFORE running work.
      await this.ctx.storage.setAlarm(Date.now() + WAKE_DELAY_MS);
      return true;
    });
    if (!pending) return;
    try {
      await this.dog.tick();
    } finally {
      await this.control(() => this.armPending());
    }
  }

  private async enqueue(
    principal: Principal,
    input: z.infer<typeof inputSchema>,
    barrier: boolean,
  ) {
    const command = this.program.parseCommand(input.command);
    const payload = { principal, input: { ...input, command } };
    const job: WatchdogQueuedJob = {
      jobId: jobIdentity(principal, input.id),
      queue: QUEUE,
      lane: "host-command",
      priority: 0,
      state: "queued",
      payload,
      recovery: { maxRecoveries: 1 },
    };
    return this.control(async () => {
      // Durable alarm precedes admission; crash before SQL leaves only an empty wake.
      await this.prearm();
      this.owner.transactionSync(() => {
        const existing = this.owner.sql
          .exec(
            "SELECT job_id FROM hive_watchdog_harness WHERE job_id=?",
            job.jobId,
          )
          .toArray()[0];
        if (!existing) {
          const count = this.owner.sql
            .exec<{ count: number }>(
              "SELECT COUNT(*) AS count FROM hive_watchdog_harness",
            )
            .toArray()[0].count;
          if (count >= MAX_ADMISSIONS)
            throw new Error("harness-admission-capacity");
        }
        // Public synchronous projection joins the bounded host link and accepted job.
        // Watchdog itself compares the complete immutable payload on duplicate identity.
        this.dog.transactional.enqueueAcceptedJob(job);
        this.owner.sql.exec(
          "INSERT OR IGNORE INTO hive_watchdog_harness VALUES (?,?)",
          job.jobId,
          barrier ? "armed" : null,
        );
      });
      await this.ctx.storage.sync();
      return { accepted: true, jobId: job.jobId };
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    if (url.pathname === "/debug" && request.method === "GET") {
      if (!authorized(request, this.env.DEBUG_SECRET))
        return new Response("Forbidden", { status: 403 });
      await this.ctx.storage.sync();
      return Response.json({
        snapshot: this.region.readCommitted(),
        events: this.region.readEvents(0, 128),
        head: await this.dog.readQueueHead(QUEUE),
        alarm: await this.ctx.storage.getAlarm(),
        witness: this.owner.sql
          .exec("SELECT alarms,repairs FROM hive_watchdog_witness")
          .toArray()[0],
        barriers: this.owner.sql
          .exec(
            "SELECT job_id,barrier FROM hive_watchdog_harness WHERE barrier IS NOT NULL",
          )
          .toArray(),
      });
    }
    const principal: Principal | null = authorized(
      request,
      this.env.WRITER_SECRET,
    )
      ? "quarry-builder"
      : authorized(request, this.env.SPECTATOR_SECRET)
        ? "quarry-spectator"
        : null;
    if (!principal) return new Response("Forbidden", { status: 403 });
    try {
      if (url.pathname === "/work" && request.method === "POST") {
        if (principal !== "quarry-builder")
          return new Response("Forbidden", { status: 403 });
        const fault = request.headers.get("X-Harness-Fault");
        if (
          fault &&
          (!this.env.DEBUG_SECRET ||
            request.headers.get("X-Harness-Debug") !== this.env.DEBUG_SECRET)
        )
          return new Response("Forbidden", { status: 403 });
        if (fault && fault !== "after-region-commit")
          return new Response("Invalid fault", { status: 400 });
        const body = await request.text();
        if (new TextEncoder().encode(body).byteLength > 8192)
          return new Response("Too large", { status: 413 });
        const result = await this.enqueue(
          principal,
          inputSchema.parse(JSON.parse(body)),
          fault !== null,
        );
        return Response.json(result, { status: 202 });
      }
      if (url.pathname === "/work" && request.method === "GET") {
        const id = inputSchema.shape.id.parse(url.searchParams.get("id"));
        const found = await this.dog.read(jobIdentity(principal, id));
        // A completed host run has a durable region receipt, including domain rejection.
        // Safe replay is the existing public result lookup; it cannot rerun that effect.
        const receipt =
          found.status === "found" &&
          found.job.state === "settled" &&
          found.job.outcome === "completed"
            ? (() => {
                const p = payloadSchema.parse(found.job.payload);
                return this.region.dispatch(p.principal, p.input);
              })()
            : null;
        return Response.json({ work: found, receipt });
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "work-unavailable" },
        { status: 409 },
      );
    }
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    if (new URL(request.url).pathname === "/health")
      return Response.json({ service: "hive-watchdog-local-proof" });
    return env.REGIONS.get(env.REGIONS.idFromName(REGION)).fetch(request);
  },
};
