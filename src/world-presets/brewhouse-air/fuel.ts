import {
  createMaterialOwner,
  type MaterialsState,
} from "../../engine/materials/index.ts";
import { MATERIAL_DEFINITIONS } from "../../item-containers.ts";
import { siteMaterialEndpoint } from "../../construction.js";
import type { Material, PositiveInt } from "../../model.ts";
import { BREWHOUSE_ROOM } from "./room.ts";
import { ROOM_FUEL } from "./fuel-definition.ts";

/** Goblin content, not a combustion/oxygen model. These are the declared warm
 * room-directed yields of one prepared wood dose, not wood's chemical energy.
 * The material owner supplies the ordinary transformation and finite custody.
 */
export const roomMaterials = createMaterialOwner(MATERIAL_DEFINITIONS);
const station = BREWHOUSE_ROOM.sites.find(
  (site) => site.type === "brew-station",
)!;
export const roomHearth = Object.freeze(
  siteMaterialEndpoint(station, "hearth")!.destination,
);
const input = Object.freeze({
  role: "fuel",
  lot: ROOM_FUEL.initialLot,
  material: "wood" as const,
  quantity: 1 as PositiveInt,
});
const settlement = Object.freeze({
  station: roomHearth.id,
  retained: [],
  outputs: [],
});

export function initialRoomMaterials(): MaterialsState<Material> {
  const state = roomMaterials.createState();
  const introduced = roomMaterials.introduceFiniteSourceLot(state, {
    source: roomHearth,
    material: input.material,
    quantity: input.quantity,
    preferredId: input.lot,
  });
  if (!introduced.ok)
    throw new Error(`room fuel introduction: ${introduced.reason}`);
  return state;
}

/** Only the caller's disposable Region candidate is mutated. Each operation
 * uses the same recipe owner as actual brewing; no second fuel inventory exists.
 */
export function prepareRoomFuel(materials: MaterialsState<Material>) {
  const plan = {
    id: ROOM_FUEL.operation,
    definition: ROOM_FUEL.definition,
    station: roomHearth.id,
    consumed: [input],
    retained: [],
    promises: [],
  };
  const admitted = roomMaterials.recipes.admitRecipePlan(materials, plan);
  if (!admitted.ok) throw new Error(`room fuel admission: ${admitted.reason}`);
  const prepared = roomMaterials.recipes.completeRecipePrepare(
    materials,
    plan.id,
  );
  if (!prepared.ok)
    throw new Error(`room fuel preparation: ${prepared.reason}`);
  const settled = roomMaterials.recipes.settleRecipePlan(materials, {
    ...plan,
    outputs: [],
  });
  if (!settled.ok) throw new Error(`room fuel settlement: ${settled.reason}`);
}

/** This scenario starts with exactly one stocked hearth and has no other item
 * introduction, hauling or item outputs. Prove that closed budget on restore.
 */
export function validateRoomFuel(
  materials: MaterialsState<Material>,
  started: boolean,
) {
  roomMaterials.validateState(materials, [roomHearth]);
  if (
    [
      materials.transfers,
      materials.bindings,
      materials.consumptions,
      materials.sinks,
      materials.embedded,
    ].some((entries) => entries.length) ||
    materials.nextLotId !== 1
  )
    throw new Error("unexpected room material custody");
  if (!started) {
    const expected = initialRoomMaterials();
    if (
      JSON.stringify(materials.lots) !== JSON.stringify(expected.lots) ||
      materials.transformations.length
    )
      throw new Error("initial finite room fuel mismatch");
    return;
  }
  const expected = {
    id: ROOM_FUEL.operation,
    definition: ROOM_FUEL.definition,
    inputs: [input],
    settlement,
  };
  if (
    materials.lots.length ||
    materials.transformations.length !== 1 ||
    JSON.stringify(materials.transformations[0]) !== JSON.stringify(expected)
  )
    throw new Error("room dose has no exact finite material transformation");
}
