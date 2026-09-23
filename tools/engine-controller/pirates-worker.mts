/** Stateless controller registration. The existing public engine DO remains the
 * sole durable world/clock owner, reached through a host service binding. */
import type { DynamicWorkerExecutorOptions } from "@cloudflare/codemode";
import { z } from "zod";
import { piratesController } from "./pirates.mts";
import { codeModeSandbox, executeCapability } from "./runtime.mts";

type Environment = {
  LOADER: DynamicWorkerExecutorOptions["loader"];
  ENGINE: { fetch(request: Request): Promise<Response> };
  GAME_TOKEN: string;
  CONTROLLER_TOKEN: string;
};
const input = z.strictObject({ code: z.string().min(1).max(16_384) });
export default {
  async fetch(request: Request, env: Environment) {
    if (request.method !== "POST" || request.headers.get("Authorization") !== `Bearer ${env.CONTROLLER_TOKEN}`)
      return Response.json({ error: "unauthorized" }, { status: 403 });
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "invalid-execute" }, { status: 400 });
    const module = piratesController({
      endpoint: "https://engine.local/v1/pirates", token: env.GAME_TOKEN, crew: ["pirates.crew.1"],
      fetch: (input, init) => env.ENGINE.fetch(new Request(input, init)),
    });
    try {
      return Response.json(await executeCapability([module], codeModeSandbox(env.LOADER), parsed.data.code, request.signal));
    } catch {
      return Response.json({ error: "execution-failed; retry identical command input" }, { status: 400 });
    }
  },
};
