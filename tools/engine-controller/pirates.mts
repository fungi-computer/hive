import { z } from "zod";
import { createRegionControllerModule } from "../../src/engine/controllers/mycelium.mts";
import type { RegionReceipt } from "../../src/engine/region/index.ts";

const identity = z.string().min(1).max(160);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const crewId = z.enum(["pirates.crew.1", "pirates.crew.2"]);
const observation = z.strictObject({
  revision, replayEpoch: revision, time: z.number().nonnegative(),
  cargo: z.strictObject({ bread: z.number().int().nonnegative(), wood: z.number().int().nonnegative(),
    delivered: z.number().int().nonnegative(), pending: z.number().int().nonnegative(), result: z.enum(["pending", "complete"]) }),
});
const receipt = z.strictObject({ region: identity, principal: identity, commandId: identity, replayEpoch: revision,
  status: z.enum(["applied", "rejected"]), revision, result: z.json() });
const publicView = z.object({ revision, replayEpoch: revision, observation: z.object({
  time: z.number().nonnegative(), presentationFacts: z.array(z.object({ id: z.string(), value: z.union([z.number(), z.string(), z.boolean()]) })).max(32),
}) });

/** A server-owned grant over the existing public DO. The caller keeps this module
 * beside Shiitake's Mycelium lease; no token, host time, raw snapshot, ship control
 * or arbitrary action is available to guest code. The DO still authorizes every
 * request and owns receipts. Revoke by replacing the host grant/credential. */
export function piratesController(options: {
  endpoint: string;
  token: string;
  crew: readonly ("pirates.crew.1" | "pirates.crew.2")[];
  fetch?: typeof globalThis.fetch;
}) {
  const endpoint = new URL(options.endpoint);
  if (!/^https?:$/.test(endpoint.protocol) || endpoint.pathname !== "/v1/pirates" || endpoint.search || endpoint.hash || endpoint.username || endpoint.password)
    throw new Error("invalid pirate controller endpoint");
  if (!/^[a-f0-9]{64}$/.test(options.token)) throw new Error("invalid pirate controller credential");
  const token = options.token;
  const allowed = new Set(z.array(crewId).min(1).max(2).parse(options.crew));
  if (allowed.size !== options.crew.length) throw new Error("duplicate pirate crew grant");
  const fetch = options.fetch ?? globalThis.fetch;
  async function request(path: "observe" | "command", body?: unknown) {
    const response = await fetch(`${endpoint.href}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`pirate-owner-request-failed:${response.status}; retry identical command input`);
    // The public owner already enforces its response byte bound.
    return response.json();
  }
  return createRegionControllerModule({
    id: "pirates-cargo-controller-v1", name: "pirates", principal: "pirates-player",
    command: z.strictObject({ kind: z.literal("command"), name: z.literal("loadCargo"), input: z.strictObject({
      entities: z.array(crewId).min(1).max(2).refine(ids => new Set(ids).size === ids.length && ids.every(id => allowed.has(id)), "crew outside controller grant"),
    }) }),
    observation,
    result: z.json(),
    async observe() {
      const view = publicView.parse(await request("observe"));
      const facts = new Map(view.observation.presentationFacts.map(fact => [fact.id, fact.value]));
      return observation.parse({ revision: view.revision, replayEpoch: view.replayEpoch, time: view.observation.time,
        cargo: { bread: facts.get("bread-cargo"), wood: facts.get("wood-cargo"), delivered: facts.get("hold-cargo"),
          pending: facts.get("cargo-pending"), result: facts.get("cargo-result") } });
    },
    async dispatch(_principal, input): Promise<RegionReceipt> {
      return receipt.parse(await request("command", input));
    },
  });
}
