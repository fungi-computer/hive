import type * as T from "./types.ts";
import type { createMaterialOwner } from "./owner.ts";
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
  const failure = <V>(reason: MaterialFailure): MaterialResult<V> => ({
    ok: false,
    reason,
  });
  const success = <V>(value: V): MaterialResult<V> => ({ ok: true, value });
  function isPositiveInt(value: number): value is PositiveInt {
    return Number.isSafeInteger(value) && value > 0;
  }
  function checkedAdd(a: number, b: number): number | null {
    const result = a + b;
    return Number.isSafeInteger(result) && result >= 0 ? result : null;
  }
  const {
    reserveTransfer,
    moveContainerPortion,
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
      sourceLot: LotId;
      quantity: number;
      access: TransferAccess;
    },
  ): MaterialResult<ItemLot> {
    const held = heldUseVessel(state, input.operation);
    if (!held.ok) return held;
    return moveContainerPortion(state, {
      source: input.source,
      destination: held.value.interior,
      sourceLot: input.sourceLot,
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
      sourceLot: LotId;
      quantity: number;
      access: TransferAccess;
    },
  ): MaterialResult<ItemLot> {
    const held = heldUseVessel(state, input.operation);
    if (!held.ok) return held;
    return moveContainerPortion(state, {
      source: held.value.interior,
      destination: input.destination,
      sourceLot: input.sourceLot,
      material: input.material,
      quantity: input.quantity,
      access: input.access,
    });
  }

  /** A checked consumer may settle an exact held portion into an immutable receipt. */
  function sinkHeldPortion(
    state: MaterialsState,
    input: {
      id: string;
      operation: string;
      sourceLot: LotId;
      material: Material;
      quantity: number;
    },
  ): MaterialResult<{ id: string }> {
    if (state.sinks.some((sink) => sink.id === input.id))
      return failure("duplicate-sink");
    const held = heldUseVessel(state, input.operation);
    if (!held.ok) return held;
    const lot = lotById(state, input.sourceLot);
    if (
      !lot ||
      lot.material !== input.material ||
      lot.location.kind !== "container" ||
      lot.location.container !== held.value.interior.id ||
      lot.quantity !== input.quantity ||
      !isPositiveInt(input.quantity)
    )
      return failure("source-insufficient");
    state.lots = state.lots.filter((candidate) => candidate !== lot);
    state.sinks.push({
      id: input.id,
      material: input.material,
      quantity: input.quantity,
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
    sinkHeldPortion,
    sinkHeldOperationPortion,
    interruptOperation,
  };
}
