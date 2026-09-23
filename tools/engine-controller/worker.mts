import { DurableObject } from "cloudflare:workers";
import { type DynamicWorkerExecutorOptions } from "@cloudflare/codemode";
import { codeModeSandbox, executeCapability } from "./runtime.mts";
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
    try {
      const value = await executeCapability(
        [quarryController(this.region, principal)],
        codeModeSandbox(this.env.LOADER), parsed.data.code, request.signal,
      );
      return Response.json(value);
    } catch {
      return Response.json({ error: "execution-failed; retry identical command input" }, { status: 400 });
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
