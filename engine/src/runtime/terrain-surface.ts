import { z } from "zod";

const coordinate = z.number().int().min(-2147483648).max(2147483647);
/** One current surface fact shared by native-query and network boundaries. */
export const terrainSurfaceSchema = z.object({
  cell: z.tuple([coordinate, coordinate, coordinate]).readonly(),
  material: z.number().int().min(0).max(65535),
  generatedTop: coordinate,
}).readonly();
