import { entity } from "../sdk/authoring";
import type { EntityId } from "../contracts";
import type { WriteContext } from "../contracts";
import { planSiteSupplies } from "../sdk/site-supplies";

/** Authored content for the first native staged-process consumer. */
export const HERBAL_ALE_V1 = Object.freeze({
  id: "herbal-ale-v1",
  version: 1,
  station: entity("colony.brew-station"),
  consumed: Object.freeze([
    { role: "malt", material: "malt", quantity: 2, destination: "kettle" },
    { role: "water", material: "water", quantity: 2, destination: "kettle" },
    { role: "mugwort", material: "mugwort", quantity: 1, destination: "kettle" },
    { role: "fuel", material: "wood", quantity: 1, destination: "hearth" },
  ]),
  retained: Object.freeze([
    { role: "catalyst", material: "barm", quantity: 1, destination: "barm" },
    { role: "package", material: "keg", quantity: 1, destination: "keg" },
  ]),
  stages: Object.freeze([
    { mode: "attended", ticks: 40, operation: "prepare" },
    { mode: "unattended", ticks: 240, operation: "ferment" },
    { mode: "attended", ticks: 20, operation: "keg" },
  ]),
  outputs: Object.freeze([
    { kind: "ale", quantity: 4, destination: "keg" },
    { kind: "spent-grain", quantity: 1, destination: "tray" },
  ]),
} as const);

export type BrewingLotFact = Readonly<{
  id: EntityId;
  kind: string;
  quantity: number;
  container: EntityId;
}>;

export type NativeProcessBinding = Readonly<{
  version: 1;
  id: EntityId;
  station: EntityId;
  consumed: readonly Readonly<{ lot: EntityId; container: EntityId; kind: string; quantity: number }>[];
  retained: readonly Readonly<{ lot: EntityId; container: EntityId; kind: string; quantity: number }>[];
  outputs: readonly Readonly<{ container: EntityId; kind: string; quantity: number }>[];
}>;
type NativeLotBinding = NativeProcessBinding["consumed"][number];

/** Resolve the exact native binding after ordinary delivery has staged lots. */
export function herbalAleProcessBinding(
  lots: readonly BrewingLotFact[],
  station: EntityId = HERBAL_ALE_V1.station,
  bindingId: EntityId = entity("colony.brew.binding.1"),
): NativeProcessBinding | undefined {
  const used = new Set<EntityId>();
  const select = (requirements: readonly { readonly material: string; readonly quantity: number }[]): readonly (NativeLotBinding | undefined)[] => requirements.map(requirement => {
    const lot = lots.find(candidate => !used.has(candidate.id) && candidate.kind === requirement.material && candidate.quantity >= requirement.quantity && candidate.container === station);
    if (lot) used.add(lot.id);
    return lot ? { lot: lot.id, container: lot.container, kind: lot.kind, quantity: requirement.quantity } : undefined;
  });
  const selected = select(HERBAL_ALE_V1.consumed), retained = select(HERBAL_ALE_V1.retained);
  if (selected.some(value => value === undefined) || retained.some(value => value === undefined)) return undefined;
  const consumed = selected.filter((value): value is NativeLotBinding => value !== undefined);
  const retainedLots = retained.filter((value): value is NativeLotBinding => value !== undefined);
  return {
    version: 1,
    id: bindingId,
    station,
    consumed,
    retained: retainedLots,
    outputs: HERBAL_ALE_V1.outputs.map(output => ({ container: station, kind: output.kind, quantity: output.quantity })),
  };
}

/** Feed the retained requirements to the established site-supply planner. */
export function planHerbalAleSupplies(context: WriteContext, station: EntityId = HERBAL_ALE_V1.station): readonly EntityId[] {
  return planSiteSupplies(context, {
    requirements: [...HERBAL_ALE_V1.consumed, ...HERBAL_ALE_V1.retained].map(({ material, quantity }) => ({ destination: station, material, quantity })),
    sourceContainers: context.workMaterialFacts().containers.map(container => container.id),
    batchQuantity: 1,
  });
}
