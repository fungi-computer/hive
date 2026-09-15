import { z } from "zod";
import type { EntityId } from "../contracts";
import type { PlacementDecisionQuery, PlacementDecisionResult } from "./protocol";

const entityId = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).transform(value => value as EntityId);
const integer = z.number().int().min(-2147483648).max(2147483647);
const cell = z.object({ x: integer, y: integer, z: integer }).strict();
const target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cell"), cell, orientation: z.enum(["north", "east", "south", "west"]) }).strict(),
  z.object({ kind: z.literal("edge"), edge: z.object({ cell, axis: z.enum(["x", "z"]) }).strict() }).strict(),
]);
export const placementDecisionQuerySchema: z.ZodType<PlacementDecisionQuery> = z.object({
  party: entityId,
  candidates: z.array(z.object({ site: entityId, catalog: entityId, target }).strict()).min(1).max(256),
}).strict();
const resultSchema: z.ZodType<PlacementDecisionResult> = z.object({
  observationRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  nativeRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  placementRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  decisions: z.array(z.object({ site: entityId, status: z.enum(["ready", "rejected"]), reason: z.string().min(1).optional() }).strict()).min(1).max(256),
}).strict();

export function parsePlacementDecisionResult(value: unknown, query: PlacementDecisionQuery): PlacementDecisionResult {
  const result = resultSchema.parse(value);
  if (result.decisions.length !== query.candidates.length
      || result.decisions.some((decision, index) => decision.site !== query.candidates[index]?.site)
      || result.decisions.some(decision => decision.status === "rejected" ? decision.reason === undefined : decision.reason !== undefined))
    throw new Error("invalid placement decision result");
  return result;
}
