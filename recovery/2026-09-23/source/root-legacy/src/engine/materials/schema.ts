import { z } from "zod";
import type {
  MaterialDefinitions,
  MaterialsState,
  PositiveInt,
} from "./types.ts";

/** Strict physical wire, independent of game actors, jobs, sites and definitions. */
export function materialStateSchema<M extends string>(
  definitions: MaterialDefinitions<M>,
) {
  const material = z
    .string()
    .refine((value) => Object.hasOwn(definitions, value), "unknown material")
    .transform((value) => value as M);
  const id = z.string().min(1);
  const positive = z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .transform((value) => value as PositiveInt);
  const cell = z
    .object({
      x: z.number().finite(),
      z: z.number().finite(),
      level: z.number().int(),
    })
    .strict();
  const lot = z
    .object({
      id,
      material,
      quantity: positive,
      location: z.discriminatedUnion("kind", [
        cell.extend({ kind: z.literal("ground") }).strict(),
        z.object({ kind: z.literal("hand"), actor: id }).strict(),
        z.object({ kind: z.literal("container"), container: id }).strict(),
      ]),
    })
    .strict();
  const portion = z
    .object({ role: id, lot: id, material, quantity: positive })
    .strict();
  const output = z
    .object({ role: id, destination: id, material, quantity: positive })
    .strict();
  const transfer = z
    .object({
      id,
      actor: id,
      resolvedMaterial: material,
      owner: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("job"), job: id, step: id }).strict(),
        z.object({ kind: z.literal("operation"), operation: id }).strict(),
      ]),
      request: z
        .object({
          source: z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("exact-lot"), lot: id }).strict(),
            z.object({ kind: z.literal("eligible-ground"), material }).strict(),
            z
              .object({
                kind: z.literal("eligible-container"),
                material,
                container: id,
              })
              .strict(),
          ]),
          quantityPolicy: z.enum(["whole-lot", "portion"]),
          quantity: positive,
        })
        .strict(),
      intent: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("deliver"), destination: id }).strict(),
        z.object({ kind: z.literal("use"), operation: id }).strict(),
      ]),
      phase: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("carrying"), lot: id }).strict(),
        z
          .object({
            kind: z.literal("reserved"),
            sourceLot: id,
            quantity: positive,
            origin: z.discriminatedUnion("kind", [
              z.object({ kind: z.literal("ground"), cell }).strict(),
              z
                .object({ kind: z.literal("container"), container: id })
                .strict(),
            ]),
          })
          .strict(),
      ]),
    })
    .strict();
  return z
    .object({
      lots: z.array(lot),
      transfers: z.array(transfer),
      bindings: z.array(
        z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("vessel-use"), id, vessel: id }).strict(),
          z
            .object({
              kind: z.literal("operation-use"),
              id,
              lot: id,
              quantity: positive,
            })
            .strict(),
          z
            .object({
              kind: z.literal("recipe"),
              id,
              definition: id,
              station: id,
              consumed: z.array(portion),
              retained: z.array(portion),
              promises: z.array(output),
            })
            .strict(),
        ]),
      ),
      transformations: z.array(
        z
          .object({
            id,
            definition: id,
            inputs: z.array(portion),
            settlement: z
              .object({
                station: id,
                retained: z.array(portion),
                outputs: z.array(output),
              })
              .strict()
              .nullable(),
          })
          .strict(),
      ),
      consumptions: z.array(
        z
          .object({
            id,
            transformation: id,
            role: id,
            material,
            quantity: positive,
          })
          .strict(),
      ),
      sinks: z.array(z.object({ id, material, quantity: positive }).strict()),
      embedded: z.array(
        z.object({ container: id, material, quantity: positive }).strict(),
      ),
      nextLotId: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    })
    .strict()
    .transform((state): MaterialsState<M> => state);
}

export function materialSnapshotSchema<M extends string>(
  definitions: MaterialDefinitions<M>,
) {
  return z
    .object({ schema: z.literal(1), state: materialStateSchema(definitions) })
    .strict();
}
