import {
  fieldWaterReferenceSchema,
  fieldWaterProblem,
  fieldWaterSources,
  type FieldWaterSource,
} from "./field-water-source.ts";
import type { MaterialPortion } from "./engine/materials/index.ts";
import { z } from "zod";
import type { Clearing } from "./model.ts";
import { portableContainerInterior } from "./item-containers.ts";
import { containerQuantity, selectContainerPortions } from "./materials.ts";
import {
  resolveOpenFiniteSourceContainer,
  sourceContainerSpec,
} from "./finite-sources.ts";

export const waterSupplySchema = z.discriminatedUnion("kind", [
  fieldWaterReferenceSchema.extend({ kind: z.literal("field") }),
  z.object({ kind: z.literal("contents") }).strict(),
  z
    .object({ kind: z.literal("container"), container: z.string().min(1) })
    .strict(),
]);
export type WaterSupply = z.infer<typeof waterSupplySchema>;
type WaterSupplyOption = {
  supply: WaterSupply;
  contents: MaterialPortion[];
  deficit: number;
  source:
    | null
    | ({ kind: "field" } & FieldWaterSource)
    | ({ kind: "container" } & NonNullable<
        ReturnType<typeof resolveOpenFiniteSourceContainer>
      >);
  portions: MaterialPortion[];
};

function pailInterior(state: Clearing, pail: string) {
  const lot = state.materials.lots.find((lot) => lot.id === pail);
  return lot && portableContainerInterior(lot);
}

/** Reference validity is independent of current stock and reach. */
export function waterSupplyProblem(
  state: Clearing,
  pail: string,
  quantity: number,
  supply: WaterSupply,
): string | null {
  const interior = pailInterior(state, pail);
  if (!interior) return "invalid pail";
  if (containerQuantity(state.materials, interior.id, "water") >= quantity)
    return null;
  if (supply.kind === "contents") return "contents supply has a shortfall";
  if (supply.kind === "field")
    return fieldWaterProblem(state, {
      binding: supply.binding,
      nodeId: supply.nodeId,
    });
  const source = resolveOpenFiniteSourceContainer(state, supply.container);
  return source?.provider.accepts.includes("water")
    ? null
    : "invalid water supply endpoint";
}

/** Same deficit/stock alternatives for every target. Paths remain caller-owned. */
export function waterSupplyOptions(
  state: Clearing,
  pail: string,
  quantity: number,
): WaterSupplyOption[] {
  const interior = pailInterior(state, pail);
  if (!interior || !Number.isSafeInteger(quantity) || quantity <= 0) return [];
  const contents = selectContainerPortions(
    state.materials,
    interior.id,
    "water",
    quantity,
  );
  const deficit = quantity - contents.quantity;
  if (!deficit)
    return [
      {
        supply: { kind: "contents" } as WaterSupply,
        contents: contents.portions,
        deficit,
        source: null,
        portions: [],
      },
    ];
  const containers: WaterSupplyOption[] = state.sources
    .toSorted((a, b) => a.id.localeCompare(b.id))
    .flatMap((feature) => {
      const id = sourceContainerSpec(feature).id;
      const source = resolveOpenFiniteSourceContainer(state, id);
      if (!source || !source.provider.accepts.includes("water")) return [];
      const selected = selectContainerPortions(
        state.materials,
        id,
        "water",
        deficit,
      );
      return selected.quantity === deficit
        ? [
            {
              supply: { kind: "container", container: id } as WaterSupply,
              contents: contents.portions,
              deficit,
              source: { kind: "container" as const, ...source },
              portions: selected.portions,
            },
          ]
        : [];
    });
  const fields: WaterSupplyOption[] = fieldWaterSources(state)
    .filter((source) => source.availableUnits >= deficit)
    .map((source) => ({
      supply: { kind: "field", binding: source.binding, nodeId: source.nodeId },
      contents: contents.portions,
      deficit,
      source: { kind: "field", ...source },
      portions: [],
    }));
  return [...containers, ...fields];
}

/** Actual draw repeats selection for its admitted endpoint; failed stock parks work
 * so assignment can choose another reachable source through the same alternatives. */
export function resolveWaterSupply(
  state: Clearing,
  pail: string,
  quantity: number,
  supply: WaterSupply,
) {
  return (
    waterSupplyOptions(state, pail, quantity).find(
      (option) =>
        option.supply.kind === "contents" ||
        (option.supply.kind === "container" &&
          supply.kind === "container" &&
          option.supply.container === supply.container) ||
        (option.supply.kind === "field" &&
          supply.kind === "field" &&
          option.supply.binding === supply.binding &&
          option.supply.nodeId === supply.nodeId),
    ) ?? null
  );
}
