import type * as T from "./types.ts";
import type { createMaterialOwner } from "./owner.ts";
/** Physical removal and recovery; game accounting remains a separate supplied policy. */
export function createMaterialRecovery<M extends string>(
  owner: ReturnType<typeof createMaterialOwner<M>>,
) {
  type Material = M;
  type MaterialsState = T.MaterialsState<M>;
  type ItemLot = T.ItemLot<M>;
  type ContainerSpec = T.ContainerSpec<M>;
  type LotId = T.LotId;
  type ContainerId = T.ContainerId;
  type PositiveInt = T.PositiveInt;
  type LegalDrop = T.LegalDrop;
  type MaterialResult<V> = T.MaterialResult<V>;
  const {
    lotById,
    availableQuantity,
    destinationAccepts,
    allocateLotId,
    groundLocation,
  } = owner.internal;
  const failure = <V>(reason: T.MaterialFailure): MaterialResult<V> => ({
    ok: false,
    reason,
  });
  const success = <V>(value: V): MaterialResult<V> => ({ ok: true, value });
  function isPositiveInt(value: number): value is PositiveInt {
    return Number.isSafeInteger(value) && value > 0;
  }
  function consumeGroundPortion(
    state: MaterialsState,
    input: { lot: LotId; material: Material; quantity: number },
  ): MaterialResult<void> {
    if (!isPositiveInt(input.quantity))
      return failure("invalid-positive-integer");
    const lot = lotById(state, input.lot);
    if (
      !lot ||
      lot.material !== input.material ||
      lot.location.kind !== "ground"
    )
      return failure("source-ineligible");
    if (availableQuantity(state, lot.id) < input.quantity)
      return failure("source-insufficient");
    if (lot.quantity === input.quantity)
      state.lots = state.lots.filter((candidate) => candidate !== lot);
    else lot.quantity = (lot.quantity - input.quantity) as PositiveInt;
    return success(undefined);
  }

  /** A checked permanent portion sink for a resolved consumer container. */
  function consumeContainerPortion(
    state: MaterialsState,
    input: {
      lot: LotId;
      container: ContainerId;
      material: Material;
      quantity: number;
    },
  ): MaterialResult<void> {
    if (!isPositiveInt(input.quantity))
      return failure("invalid-positive-integer");
    const lot = lotById(state, input.lot);
    if (
      !lot ||
      lot.material !== input.material ||
      lot.location.kind !== "container" ||
      lot.location.container !== input.container
    )
      return failure("source-ineligible");
    if (availableQuantity(state, lot.id) < input.quantity)
      return failure("source-insufficient");
    if (lot.quantity === input.quantity)
      state.lots = state.lots.filter((candidate) => candidate !== lot);
    else lot.quantity = (lot.quantity - input.quantity) as PositiveInt;
    return success(undefined);
  }

  function recoverEmbedded(
    state: MaterialsState,
    container: ContainerSpec,
    material: Material,
    salvageQuantity: number,
    drop: LegalDrop,
  ): MaterialResult<{ salvage: ItemLot | null; consumed: number }> {
    if (!destinationAccepts(container, material))
      return failure("destination-mismatch");
    const entry = state.embedded.find(
      (candidate) =>
        candidate.container === container.id && candidate.material === material,
    );
    if (!entry) return failure("embedding-not-found");
    if (
      !Number.isSafeInteger(salvageQuantity) ||
      salvageQuantity < 0 ||
      salvageQuantity > entry.quantity
    )
      return failure("invalid-salvage");
    if (salvageQuantity > 0 && !drop.legal) return failure("illegal-drop");
    const consumed = entry.quantity - salvageQuantity;
    let allocation: MaterialResult<{ id: LotId; nextLotId: number }> | null =
      null;
    if (salvageQuantity > 0) {
      allocation = allocateLotId(state);
      if (!allocation.ok) return allocation;
    }

    state.embedded.splice(state.embedded.indexOf(entry), 1);
    if (!allocation) return success({ salvage: null, consumed });
    const salvage: ItemLot = {
      id: allocation.value.id,
      material: material,
      quantity: salvageQuantity as PositiveInt,
      location: groundLocation(drop.cell),
    };
    state.lots.push(salvage);
    state.nextLotId = allocation.value.nextLotId;
    return success({ salvage, consumed });
  }

  return { consumeGroundPortion, consumeContainerPortion, recoverEmbedded };
}
