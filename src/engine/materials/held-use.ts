import {
  planContainerDebit,
  debitContainer,
  type MaterialPortion,
} from "./portions.ts";
import type * as T from "./types.ts";
import type { createMaterialOwner } from "./owner.ts";

/** A material-side transfer fact; the caller owns any outside counterpart. */
export type ExportedVesselContents<M extends string> = {
  readonly operation: string;
  readonly vessel: T.LotId;
  readonly container: T.ContainerId;
  readonly material: M;
  readonly quantity: T.PositiveInt;
  readonly portions: readonly Readonly<MaterialPortion>[];
};

export function createHeldUses<M extends string>(
  owner: ReturnType<typeof createMaterialOwner<M>>,
) {
  type ItemLot = T.ItemLot<M>;
  type MaterialBinding = T.MaterialBinding<M>;
  type MaterialsState = T.MaterialsState<M>;
  type Transfer = T.Transfer<M>;
  type ActorId = T.ActorId;
  type TransferId = T.TransferId;
  type LotId = T.LotId;
  type RecipeId = T.RecipeId;
  type ContainerId = T.ContainerId;
  type PositiveInt = T.PositiveInt;
  type Cell = T.Cell;
  type LegalDrop = T.LegalDrop;
  type TransferAccess = T.TransferAccess;
  type MaterialFailure = T.MaterialFailure;
  type Material = M;
  type ContainerSpec = T.ContainerSpec<M>;
  type MaterialResult<V> = T.MaterialResult<V>;
  type VesselPortionRequest = {
    operation: string;
    material: Material;
    quantity: number;
    portions: readonly MaterialPortion[];
  };
  const failure = <V>(reason: MaterialFailure): MaterialResult<V> => ({
    ok: false,
    reason,
  });
  const success = <V>(value: V): MaterialResult<V> => ({ ok: true, value });
  function isPositiveInt(value: number): value is PositiveInt {
    return Number.isSafeInteger(value) && value > 0;
  }
  const {
    reserveTransfer,
    moveContainerPortions,
    interruptTransfer,
    portableContainerInterior,
    transferPhaseProblem,
  } = owner;
  const { vesselBinding, operationUseBinding, lotById } = owner.internal;
  function acquireVesselForOperation(
    state: MaterialsState,
    input: {
      id: TransferId;
      operation: string;
      actor: ActorId;
      vessel: LotId;
      access: TransferAccess;
    },
  ): MaterialResult<Transfer> {
    if (state.bindings.some((binding) => binding.id === input.operation))
      return failure("owner-busy");
    state.bindings.push({
      kind: "vessel-use",
      id: input.operation,
      vessel: input.vessel,
    });
    const reserved = reserveTransfer(state, {
      id: input.id,
      actor: input.actor,
      owner: { kind: "operation", operation: input.operation },
      request: {
        source: { kind: "exact-lot", lot: input.vessel },
        quantityPolicy: "whole-lot",
        quantity: 1 as PositiveInt,
      },
      intent: { kind: "use", operation: input.operation },
      sourceLot: input.vessel,
      access: input.access,
    });
    if (!reserved.ok)
      state.bindings = state.bindings.filter(
        (binding) => binding.id !== input.operation,
      );
    return reserved;
  }

  /** Reserves one ordinary lot for an operation without inventing a cargo path. */
  function acquireLotForOperation(
    state: MaterialsState,
    input: {
      id: TransferId;
      operation: string;
      actor: ActorId;
      lot: LotId;
      material: Material;
      quantity: PositiveInt;
      access: TransferAccess;
    },
  ): MaterialResult<Transfer> {
    if (state.bindings.some((binding) => binding.id === input.operation))
      return failure("owner-busy");
    const lot = lotById(state, input.lot);
    if (!lot || lot.material !== input.material)
      return failure("source-ineligible");
    state.bindings.push({
      kind: "operation-use",
      id: input.operation,
      lot: input.lot,
      quantity: input.quantity,
    });
    const reserved = reserveTransfer(state, {
      id: input.id,
      actor: input.actor,
      owner: { kind: "operation", operation: input.operation },
      request: {
        source: { kind: "exact-lot", lot: input.lot },
        quantityPolicy: "portion",
        quantity: input.quantity,
      },
      intent: { kind: "use", operation: input.operation },
      sourceLot: input.lot,
      access: input.access,
    });
    if (!reserved.ok)
      state.bindings = state.bindings.filter(
        (binding) => binding.id !== input.operation,
      );
    return reserved;
  }

  /** Keeps an interrupted pail's operation claim while its physical vessel drops. */
  function parkOperationVessel(
    state: MaterialsState,
    input: { actor: ActorId; operation: string; drop: LegalDrop },
  ): MaterialResult<void> {
    const use = vesselBinding(state, input.operation);
    const transfer = state.transfers.find(
      (candidate) =>
        candidate.actor === input.actor &&
        candidate.owner.kind === "operation" &&
        candidate.owner.operation === input.operation,
    );
    if (
      !use ||
      (transfer &&
        (transfer.intent.kind !== "use" ||
          transfer.intent.operation !== input.operation))
    )
      return failure("use-intent-required");
    if (!transfer) return success(undefined);
    const dropped = interruptTransfer(state, input.actor, input.drop);
    return dropped.ok ? success(undefined) : dropped;
  }

  /** Reassignment creates fresh executor custody for the operation's bound pail. */
  function rebindOperationVessel(
    state: MaterialsState,
    input: {
      id: TransferId;
      operation: string;
      actor: ActorId;
      access: TransferAccess;
    },
  ): MaterialResult<Transfer> {
    const use = vesselBinding(state, input.operation);
    if (
      !use ||
      state.transfers.some(
        (candidate) =>
          candidate.owner.kind === "operation" &&
          candidate.owner.operation === input.operation,
      )
    )
      return failure("use-intent-required");
    return reserveTransfer(state, {
      id: input.id,
      actor: input.actor,
      owner: { kind: "operation", operation: input.operation },
      request: {
        source: { kind: "exact-lot", lot: use.vessel },
        quantityPolicy: "whole-lot",
        quantity: 1 as PositiveInt,
      },
      intent: { kind: "use", operation: input.operation },
      sourceLot: use.vessel,
      access: input.access,
    });
  }

  /** Retires an ordinary claim only after its physical custody was released. */
  function retireOperationUse(
    state: MaterialsState,
    operation: string,
  ): MaterialResult<void> {
    const binding = state.bindings.find((entry) => entry.id === operation);
    if (binding?.kind === "recipe") return failure("wrong-phase");
    if (
      state.transfers.some(
        (entry) =>
          entry.owner.kind === "operation" &&
          entry.owner.operation === operation,
      )
    )
      return failure("owner-busy");
    if (binding) {
      const lot = lotById(
        state,
        binding.kind === "vessel-use" ? binding.vessel : binding.lot,
      );
      if (lot?.location.kind === "hand") return failure("owner-busy");
    }
    state.bindings = state.bindings.filter(
      (binding) => binding.id !== operation,
    );
    return success(undefined);
  }

  /** Moves one exact portion between resolved containers as one mutation. */
  function heldUseVessel(
    state: MaterialsState,
    operation: string,
  ): MaterialResult<{ lot: ItemLot; interior: ContainerSpec }> {
    const use = vesselBinding(state, operation);
    if (!use) return failure("use-intent-required");
    const transfer = state.transfers.find(
      (candidate) =>
        candidate.owner.kind === "operation" &&
        candidate.owner.operation === operation,
    );
    if (transfer) {
      if (
        transfer.intent.kind !== "use" ||
        transfer.intent.operation !== use.id ||
        transfer.phase.kind !== "carrying" ||
        transfer.phase.lot !== use.vessel
      )
        return failure("use-intent-required");
      const phaseProblem = transferPhaseProblem(state, transfer);
      if (phaseProblem) return failure(phaseProblem);
    }
    const lot = lotById(state, use.vessel);
    const interior = lot && portableContainerInterior(lot);
    if (
      !lot ||
      !interior ||
      lot.location.kind !== "hand" ||
      (transfer !== undefined && lot.location.actor !== transfer.actor)
    )
      return failure("vessel-invalid");
    return success({ lot, interior });
  }

  function drawVesselContents(
    state: MaterialsState,
    input: {
      operation: string;
      material: Material;
      source: ContainerSpec;
      portions: readonly MaterialPortion[];
      quantity: number;
      access: TransferAccess;
    },
  ): MaterialResult<MaterialPortion[]> {
    const held = heldUseVessel(state, input.operation);
    if (!held.ok) return held;
    return moveContainerPortions(state, {
      source: input.source,
      destination: held.value.interior,
      portions: input.portions,
      material: input.material,
      quantity: input.quantity,
      access: input.access,
    });
  }

  function pourVesselContents(
    state: MaterialsState,
    input: {
      operation: string;
      material: Material;
      destination: ContainerSpec;
      portions: readonly MaterialPortion[];
      quantity: number;
      access: TransferAccess;
    },
  ): MaterialResult<MaterialPortion[]> {
    const held = heldUseVessel(state, input.operation);
    if (!held.ok) return held;
    return moveContainerPortions(state, {
      source: held.value.interior,
      destination: input.destination,
      portions: input.portions,
      material: input.material,
      quantity: input.quantity,
      access: input.access,
    });
  }

  /** Admit outside material into the actual held vessel, without a fake source. */
  function importVesselContents(
    state: MaterialsState,
    input: { operation: string; material: Material; quantity: number },
  ): MaterialResult<MaterialPortion> {
    const held = heldUseVessel(state, input.operation);
    if (!held.ok) return held;
    const admitted = owner.introduceFiniteSourceLot(state, {
      source: held.value.interior,
      material: input.material,
      quantity: input.quantity,
    });
    if (!admitted.ok) return admitted;
    return success({
      lot: admitted.value.id,
      quantity: admitted.value.quantity,
    });
  }

  /** Consumption and outward transfer share held custody plus complete debit admission. */
  function planHeldDebit(state: MaterialsState, input: VesselPortionRequest) {
    const held = heldUseVessel(state, input.operation);
    if (!held.ok) return held;
    const planned = planContainerDebit(
      state,
      {
        container: held.value.interior.id,
        material: input.material,
        portions: input.portions,
        quantity: input.quantity,
      },
      owner.internal.availableQuantity,
    );
    if (!planned.ok) return planned;
    return success({ held: held.value, debits: planned.value });
  }

  /** Transfer material out of a held vessel; this is not an end-use sink. */
  function exportVesselContents(
    state: MaterialsState,
    input: VesselPortionRequest,
  ): MaterialResult<ExportedVesselContents<Material>> {
    const planned = planHeldDebit(state, input);
    if (!planned.ok) return planned;
    const { held, debits } = planned.value;
    const fact = Object.freeze({
      operation: input.operation,
      vessel: held.lot.id,
      container: held.interior.id,
      material: input.material,
      quantity: input.quantity as PositiveInt,
      portions: Object.freeze(
        debits.map(({ lot, quantity }) =>
          Object.freeze({ lot: lot.id, quantity }),
        ),
      ),
    });
    debitContainer(state, debits);
    return success(fact);
  }

  /** A checked consumer may settle an exact held portion into an immutable receipt. */
  function sinkHeldPortion(
    state: MaterialsState,
    input: VesselPortionRequest & { id: string },
  ): MaterialResult<{ id: string }> {
    if (state.sinks.some((sink) => sink.id === input.id))
      return failure("duplicate-sink");
    const planned = planHeldDebit(state, input);
    if (!planned.ok) return planned;
    debitContainer(state, planned.value.debits);
    state.sinks.push({
      id: input.id,
      material: input.material,
      quantity: input.quantity as PositiveInt,
    });
    return success({ id: input.id });
  }

  /** Settles an exact ordinary held use transfer into one immutable receipt. */
  function sinkHeldOperationPortion(
    state: MaterialsState,
    input: {
      id: string;
      operation: string;
      lot: LotId;
      material: Material;
      quantity: number;
    },
  ): MaterialResult<{ id: string }> {
    if (state.sinks.some((sink) => sink.id === input.id))
      return failure("duplicate-sink");
    const use = operationUseBinding(state, input.operation);
    const transfer = state.transfers.find(
      (entry) =>
        entry.owner.kind === "operation" &&
        entry.owner.operation === input.operation,
    );
    const lot = lotById(state, input.lot);
    if (transfer) {
      const phaseProblem = transferPhaseProblem(state, transfer);
      if (phaseProblem) return failure(phaseProblem);
    }
    if (
      !use ||
      use.lot !== input.lot ||
      use.quantity !== input.quantity ||
      (transfer !== undefined &&
        (transfer.intent.kind !== "use" ||
          transfer.phase.kind !== "carrying" ||
          transfer.phase.lot !== input.lot)) ||
      !lot ||
      lot.material !== input.material ||
      lot.quantity !== input.quantity ||
      lot.location.kind !== "hand" ||
      (transfer !== undefined && lot.location.actor !== transfer.actor) ||
      !isPositiveInt(input.quantity)
    )
      return failure("use-intent-required");
    state.lots = state.lots.filter((entry) => entry !== lot);
    state.transfers = state.transfers.filter((entry) => entry !== transfer);
    state.bindings = state.bindings.filter((entry) => entry !== use);
    state.sinks.push({
      id: input.id,
      material: input.material,
      quantity: input.quantity as PositiveInt,
    });
    return success({ id: input.id });
  }

  /** Cancels ordinary use custody and its claim together; parked uses use park instead. */
  function interruptOperation(
    state: MaterialsState,
    operation: string,
    drop?: LegalDrop,
  ) {
    const binding = state.bindings.find((entry) => entry.id === operation);
    if (binding?.kind === "recipe") return failure("wrong-phase");
    const transfer = state.transfers.find(
      (entry) =>
        entry.owner.kind === "operation" && entry.owner.operation === operation,
    );
    const lot =
      binding &&
      lotById(
        state,
        binding.kind === "vessel-use" ? binding.vessel : binding.lot,
      );
    if (lot?.location.kind === "hand" && !drop?.legal)
      return failure("illegal-drop");
    const interrupted = owner.internal.interruptExactTransfer(
      state,
      transfer,
      drop,
    );
    if (!interrupted.ok) return interrupted;
    if (lot?.location.kind === "hand")
      lot.location = owner.internal.groundLocation(drop!.cell);
    state.bindings = state.bindings.filter((entry) => entry !== binding);
    return interrupted;
  }

  return {
    acquireVesselForOperation,
    acquireLotForOperation,
    parkOperationVessel,
    rebindOperationVessel,
    retireOperationUse,
    drawVesselContents,
    pourVesselContents,
    importVesselContents,
    exportVesselContents,
    sinkHeldPortion,
    sinkHeldOperationPortion,
    interruptOperation,
  };
}
