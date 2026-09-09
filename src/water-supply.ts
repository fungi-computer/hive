import { z } from "zod";
import type { Clearing } from "./model.ts";
import { portableContainerInterior } from "./item-containers.ts";
import { containerQuantity, selectContainerPortions } from "./materials.ts";
import {
  resolveOpenFiniteSourceContainer,
  sourceContainerSpec,
} from "./finite-sources.ts";

export const waterSupplySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("contents") }).strict(),
  z
    .object({ kind: z.literal("container"), container: z.string().min(1) })
    .strict(),
]);
export type WaterSupply = z.infer<typeof waterSupplySchema>;

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
) {
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
  return state.sources
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
              source,
              portions: selected.portions,
            },
          ]
        : [];
    });
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
          option.supply.container === supply.container),
    ) ?? null
  );
}
