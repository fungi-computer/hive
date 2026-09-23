import { z } from "zod";

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const failure = { sequence: integer, attempts: integer.min(1).max(5), code: z.string().regex(/^[a-z][a-z0-9-]{0,95}$/) };
/** Durable host execution status; physical pause and transport connectivity are separate. */
export const hostStatusSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("running") }).strict(),
  z.object({ state: z.literal("retrying"), ...failure, retryAt: integer }).strict(),
  z.object({ state: z.literal("faulted"), ...failure }).strict(),
]);
export type HostStatus = z.infer<typeof hostStatusSchema>;
export const RUNNING_HOST: HostStatus = Object.freeze({ state: "running" });
