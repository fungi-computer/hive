import type {
  ItemLot,
  Material,
  MaterialsState,
  LotId,
  ContainerId,
} from "./model.ts";
import { createMaterialOwner } from "./engine/materials/index.ts";
import type {
  MaterialFailure,
  MaterialResult,
  LegalDrop,
} from "./engine/materials/types.ts";
import { MATERIAL_DEFINITIONS } from "./item-containers.ts";
export { vesselContainer } from "./item-containers.ts";
export type {
  MaterialFailure,
  MaterialResult,
  TransferAccess,
  LegalDrop,
} from "./engine/materials/types.ts";
export type ContainerSpec =
  import("./engine/materials/types.ts").ContainerSpec<Material>;
export type ResolvedRecipePlan =
  import("./engine/materials/index.ts").ResolvedRecipePlan<Material>;
export type ResolvedRecipeSettlement =
  import("./engine/materials/index.ts").ResolvedRecipeSettlement<Material>;
export type ResolvedRecipeOutputConsumption =
  import("./engine/materials/index.ts").ResolvedRecipeOutputConsumption<Material>;

/** Goblin supplies definitions and legacy wood-loss accounting, never another lot owner. */
const materialOwner = createMaterialOwner<Material>(MATERIAL_DEFINITIONS);
export function createMaterialsState(): MaterialsState {
  return { ...materialOwner.createState(), consumedWood: 0 };
}
export const {
  validateState: validateMaterialState,
  containerCapacityProblem,
  createGroundLot,
  introduceFiniteSourceLot,
  reserveTransfer,
  pickupTransfer,
  deliverTransfer,
  moveContainerPortion,
  interruptTransfer,
  releaseContainer,
  embedContainer: embedConstruction,
  transferPhaseProblem,
  containerContents,
  containerQuantity,
  availableQuantity,
  remainingContainerQuantity,
} = materialOwner;
export const {
  sourceContainer,
  bindingPromiseQuantity,
  availableMaterialFacts,
  availablePortions,
  transferForActor,
  carriedLot,
  embeddedQuantity,
  containerBulk,
} = materialOwner.queries;
export const historicalTransferPhaseProblem =
  materialOwner.migration.validatePredecessorPhase;
export const {
  acquireVesselForOperation: acquirePailForOperation,
  acquireLotForOperation,
  parkOperationVessel: parkOperationPail,
  rebindOperationVessel: rebindOperationPail,
  retireOperationUse,
  sinkHeldPortion,
  sinkHeldOperationPortion,
  interruptOperation: interruptOperationPail,
} = materialOwner.uses;
export const retireOperationPail = retireOperationUse;
export const cancelMaterialUse = materialOwner.uses.interruptOperation;
export const {
  checkRecipePlan,
  admitRecipePlan,
  completeRecipePrepare,
  settleRecipePlan,
  consumeRecipeOutput,
  releaseUnpreparedRecipeBinding,
} = materialOwner.recipes;
export type AvailablePortion = { lot: LotId; quantity: number };
export type AvailableLotFact = { lot: ItemLot; quantity: number };
type ValueOfResult<T> = T extends MaterialResult<infer V> ? V : never;
export type InterruptResult = ValueOfResult<
  ReturnType<typeof interruptTransfer>
>;
export type ReleasedContainer = ValueOfResult<
  ReturnType<typeof releaseContainer>
>;

export function drawPailWater(
  state: MaterialsState,
  input: Omit<
    Parameters<typeof materialOwner.uses.drawVesselContents>[1],
    "material"
  >,
) {
  return materialOwner.uses.drawVesselContents(state, {
    ...input,
    material: "water",
  });
}
export function pourPailWater(
  state: MaterialsState,
  input: Omit<
    Parameters<typeof materialOwner.uses.pourVesselContents>[1],
    "material"
  >,
) {
  return materialOwner.uses.pourVesselContents(state, {
    ...input,
    material: "water",
  });
}

const failure = <T>(reason: MaterialFailure): MaterialResult<T> => ({
  ok: false,
  reason,
});
function accountedWoodLoss(state: MaterialsState, amount: number): boolean {
  return (
    Number.isSafeInteger(state.consumedWood + amount) &&
    state.consumedWood + amount >= 0
  );
}
/** The old wood loss counter remains save-compatible game accounting. Physical lots
 * are removed only by the shared owner; this adapter cannot create or split them. */
export function consumeContainerPortion(
  state: MaterialsState,
  input: {
    lot: LotId;
    container: ContainerId;
    material: Material;
    quantity: number;
  },
): MaterialResult<void> {
  if (input.material === "wood" && !accountedWoodLoss(state, input.quantity))
    return failure("invalid-positive-integer");
  const result = materialOwner.recovery.consumeContainerPortion(state, input);
  if (result.ok && input.material === "wood")
    state.consumedWood += input.quantity;
  return result;
}
export function salvageConstruction(
  state: MaterialsState,
  container: ContainerSpec,
  salvageQuantity: number,
  drop: LegalDrop,
): MaterialResult<{ salvage: ItemLot | null; consumed: number }> {
  const loss = embeddedQuantity(state, container.id) - salvageQuantity;
  if (!accountedWoodLoss(state, loss))
    return failure("invalid-positive-integer");
  const result = materialOwner.recovery.recoverEmbedded(
    state,
    container,
    "wood",
    salvageQuantity,
    drop,
  );
  if (result.ok) state.consumedWood += result.value.consumed;
  return result;
}
/** Read-only legacy presentation projection; physical conservation uses the same records. */
export function materialQuantity(state: MaterialsState, material: Material) {
  return {
    live: state.lots.reduce(
      (total, lot) => total + (lot.material === material ? lot.quantity : 0),
      0,
    ),
    embedded: state.embedded.reduce(
      (total, entry) =>
        total + (entry.material === material ? entry.quantity : 0),
      0,
    ),
    consumed:
      material === "wood"
        ? state.consumedWood
        : state.sinks.reduce(
            (total, sink) =>
              total + (sink.material === material ? sink.quantity : 0),
            0,
          ),
  };
}
