import { z } from "zod";
import type { MaterialDefinitions, ItemLot, ContainerSpec } from "./types.ts";
const id = z.string().min(1);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const definitionSchema = z
  .record(
    id,
    z
      .object({
        carry: z.enum(["whole", "portion", "contained"]),
        interior: z
          .object({
            capacity: positive,
            accepts: z.array(id).min(1),
            bulk: z.record(id, positive),
          })
          .strict()
          .optional(),
      })
      .strict(),
  )
  .superRefine((definitions, context) => {
    if (Object.keys(definitions).length === 0)
      context.addIssue({
        code: "custom",
        message: "empty material definitions",
      });
    for (const [material, definition] of Object.entries(definitions)) {
      const interior = definition.interior;
      if (!interior) continue;
      if (
        new Set(interior.accepts).size !== interior.accepts.length ||
        interior.accepts.some(
          (accepted) =>
            !Object.hasOwn(definitions, accepted) ||
            !Object.hasOwn(interior.bulk, accepted),
        )
      )
        context.addIssue({
          code: "custom",
          path: [material, "interior"],
          message: "invalid material references",
        });
    }
  });

/** One content-independent derivation for the physical interior of an intact lot. */
export function resolvePortableInterior<M extends string>(
  definitions: MaterialDefinitions<M>,
  lot: ItemLot<M>,
): ContainerSpec<M> | null {
  const interior = definitions[lot.material]?.interior;
  return lot.quantity === 1 && interior
    ? {
        id: `vessel:${lot.id}`,
        capacity: interior.capacity,
        accepts: interior.accepts,
        bulk: interior.bulk,
      }
    : null;
}

/** Zod owns structural admission; the checked copy cannot be changed by its author. */
export function checkedMaterialDefinitions<M extends string>(
  input: MaterialDefinitions<M>,
): MaterialDefinitions<M> {
  const checked = definitionSchema.parse(input) as MaterialDefinitions<M>;
  const result = Object.create(null) as Record<M, MaterialDefinitions<M>[M]>;
  for (const material of Object.keys(checked) as M[]) {
    const { carry, interior } = checked[material];
    result[material] = Object.freeze(
      interior
        ? {
            carry,
            interior: Object.freeze({
              capacity: interior.capacity,
              accepts: Object.freeze([...interior.accepts]),
              bulk: Object.freeze({ ...interior.bulk }),
            }),
          }
        : { carry },
    );
  }
  return Object.freeze(result);
}
