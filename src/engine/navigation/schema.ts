import { z } from "zod";
import { footingSchema } from "../world/footing.ts";

const positive = z.number().int().positive().max(4096);
const edge = z.strictObject({
  from: footingSchema,
  to: footingSchema,
  kind: z.enum(["flat", "up", "down", "stair"]),
  link: z.string().min(1).max(160).nullable(),
  duration: positive,
  clearanceVoxels: z.number().int().min(1).max(32),
  sweep: z.array(footingSchema).min(2).max(66),
});
/** Structural admission belongs here; current support, link identity, profile
 * and material-custody joins are checked by the composing game on restore. */
export const traversalSchema = z
  .strictObject({
    edge,
    elapsed: z.number().int().nonnegative(),
    remaining: z.array(footingSchema).max(4096),
  })
  .refine(
    (value) => value.elapsed < value.edge.duration,
    "completed edge must publish its destination",
  );
