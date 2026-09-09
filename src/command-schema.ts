import { voxelSchema } from "./terrain.ts";
import { z } from "zod";
import type { Command } from "./model.ts";
const id = z.string().min(1).max(160);
const integer = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
const cell = { x: integer, z: integer, level: integer };
const scope = { party: id, actors: z.array(id).max(64).nullable() };
const work = { ...scope, direct: z.boolean().optional() };
const building = z.enum([
  "wall",
  "door",
  "roof",
  "bed",
  "shelf",
  "floor",
  "stair",
  "brew-station",
]);
export const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("chop"), ...work, tree: id }).strict(),
  z.object({ kind: z.literal("dig"), ...work, voxel: voxelSchema }).strict(),
  z
    .object({
      kind: z.literal("build"),
      ...work,
      ...cell,
      type: building,
      direction: z.number().int().min(0).max(1),
    })
    .strict(),
  z.object({ kind: z.literal("deconstruct"), ...work, site: id }).strict(),
  z.object({ kind: z.literal("sow"), ...work, ...cell }).strict(),
  z.object({ kind: z.literal("harvest"), ...work, herb: id }).strict(),
  z.object({ kind: z.literal("water-mugwort"), ...work, herb: id }).strict(),
  z.object({ kind: z.literal("rest"), ...work }).strict(),
  z
    .object({
      kind: z.literal("store"),
      party: id,
      actors: z.null(),
      lot: id,
      shelf: id,
    })
    .strict(),
  z.object({ kind: z.literal("repair-cache"), ...work }).strict(),
  z.object({ kind: z.literal("fill-kettle"), ...work, station: id }).strict(),
  z.object({ kind: z.literal("brew"), ...work, station: id }).strict(),
  z.object({ kind: z.literal("tap"), ...work, station: id }).strict(),
  z
    .object({ kind: z.literal("clear-spent-grain"), ...work, station: id })
    .strict(),
  z.object({ kind: z.literal("cancel"), ...scope, job: id }).strict(),
  z.object({ kind: z.literal("next"), ...scope, job: id }).strict(),
  z
    .object({ kind: z.literal("routine"), ...scope, enabled: z.boolean() })
    .strict(),
  z
    .object({
      kind: z.literal("work"),
      ...scope,
      work: z.enum(["chop", "haul", "build", "garden", "craft"]),
      enabled: z.boolean(),
    })
    .strict(),
  z.object({ kind: z.literal("draft"), party: id, actor: id }).strict(),
  z.object({ kind: z.literal("undraft"), party: id, actor: id }).strict(),
  z
    .object({
      kind: z.literal("go"),
      party: id,
      actor: id,
      target: z.object(cell).strict(),
    })
    .strict(),
  z.object({ kind: z.literal("recruit"), party: id, actor: id }).strict(),
]);
type Checked = z.infer<typeof commandSchema>;
// Both directions fail compilation when the domain or transport union diverges.
type Assert<T extends true> = T;
type DomainCovered = Assert<Command extends Checked ? true : false>;
type OnlyDomain = Assert<Checked extends Command ? true : false>;
export function parseCommand(value: unknown): Command {
  return commandSchema.parse(value);
}
