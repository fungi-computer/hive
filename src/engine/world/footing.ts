import { z } from "zod";

/** Signed world-voxel coordinate of a supported physical foot or ground item.
 * View pixels and game-authored storeys are never admitted by this grammar. */
export const footingSchema = z.strictObject({
  x: z.number().int().safe(),
  y: z.number().int().safe(),
  z: z.number().int().safe(),
});
export type Footing = z.infer<typeof footingSchema>;
