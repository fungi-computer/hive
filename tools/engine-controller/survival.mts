import { z } from "zod";
import { createRegionControllerModule } from "../../src/engine/controllers/mycelium.mts";
import type { RegionReceipt } from "../../src/engine/region/index.ts";

const identity = z.string().min(1).max(160);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const observation = z.strictObject({
  revision,
  replayEpoch: revision,
  time: z.number().nonnegative(),
  hunger: z.number().finite().min(0).max(100),
  wellbeing: z.number().finite().min(0).max(100),
  carriedBread: z.number().int().nonnegative(),
  lockerBread: z.number().int().nonnegative(),
});
const receipt = z.strictObject({
  region: identity,
  principal: identity,
  commandId: identity,
  replayEpoch: revision,
  status: z.enum(["applied", "rejected"]),
  revision,
  result: z.json(),
});
const publicView = z.object({
  revision,
  replayEpoch: revision,
  observation: z.object({
    time: z.number().nonnegative(),
    presentationFacts: z.array(z.object({
      id: z.string(),
      value: z.union([z.number(), z.string(), z.boolean()]),
    })).max(32),
  }),
});
const survivalCommand = z.discriminatedUnion("name", [
  z.strictObject({ kind: z.literal("command"), name: z.literal("takeFood"), input: z.null() }),
  z.strictObject({ kind: z.literal("command"), name: z.literal("eatFood"), input: z.null() }),
]);

/** One survivor's player-scoped food actions over the existing public Region.
 * The host keeps the credential and player identity; the game pack and Region
 * remain the command, material-custody and physiology owners. */
export function survivalController(options: {
  endpoint: string;
  token: string;
  fetch?: typeof globalThis.fetch;
}) {
  const endpoint = new URL(options.endpoint);
  if (!/^https?:$/.test(endpoint.protocol) || endpoint.pathname !== "/v1/survival" || endpoint.search || endpoint.hash || endpoint.username || endpoint.password)
    throw new Error("invalid survival controller endpoint");
  if (!/^[a-f0-9]{64}$/.test(options.token)) throw new Error("invalid survival controller credential");
  const token = options.token;
  const fetch = options.fetch ?? globalThis.fetch;
  async function request(path: "observe" | "command", body?: unknown) {
    const response = await fetch(`${endpoint.href}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`survival-owner-request-failed:${response.status}; retry identical command input`);
    return response.json();
  }
  return createRegionControllerModule({
    id: "survival-food-controller-v1",
    name: "survival",
    principal: "survival-player",
    command: survivalCommand,
    observation,
    result: z.json(),
    async observe() {
      const view = publicView.parse(await request("observe"));
      const facts = new Map(view.observation.presentationFacts.map(fact => [fact.id, fact.value]));
      return observation.parse({
        revision: view.revision,
        replayEpoch: view.replayEpoch,
        time: view.observation.time,
        hunger: facts.get("hunger"),
        wellbeing: facts.get("wellbeing"),
        carriedBread: facts.get("carried"),
        lockerBread: facts.get("locker"),
      });
    },
    async dispatch(_principal, input): Promise<RegionReceipt> {
      return receipt.parse(await request("command", input));
    },
  });
}
