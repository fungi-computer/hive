import { planContainerDebit, type MaterialPortion } from "./portions.ts";
import { createMaterialQueries } from "./queries.ts";
import {
  resolvePortableInterior,
  checkedMaterialDefinitions,
} from "./definitions.ts";
import type * as T from "./types.ts";
export type {
  ContainerSpec,
  MaterialFailure,
  MaterialResult,
  TransferAccess,
  LegalDrop,
} from "./types.ts";

/** One physical owner, configured once by each consumer's checked content definitions. */
export function createMaterialOwner<M extends string>(
  inputDefinitions: T.MaterialDefinitions<M>,
) {
  const definitions = checkedMaterialDefinitions(inputDefinitions);
  type Material = M;
  type ItemLot = T.ItemLot<M>;
  type SourcePolicy = T.SourcePolicy<M>;
  type TransferRequest = T.TransferRequest<M>;
  type MaterialBinding = T.MaterialBinding<M>;
  type Transfer = T.Transfer<M>;
  type EmbeddedMaterial = T.EmbeddedMaterial<M>;
  type RecipeTransformation = T.RecipeTransformation<M>;
  type RecipeConsumption = T.RecipeConsumption<M>;
  type MaterialSinkReceipt = T.MaterialSinkReceipt<M>;
  type MaterialsState = T.MaterialsState<M>;
  type ActorId = T.ActorId;
  type JobId = T.JobId;
  type LotId = T.LotId;
  type TransferId = T.TransferId;
  type ContainerId = T.ContainerId;
  type RecipeId = T.RecipeId;
  type PositiveInt = T.PositiveInt;
  type Cell = T.Cell;
  type CarryIntent = T.CarryIntent;
  type TransferOrigin = T.TransferOrigin;
  type MaterialFailure = T.MaterialFailure;
  type TransferAccess = T.TransferAccess;
  type LegalDrop = T.LegalDrop;
  type ContainerSpec = T.ContainerSpec<M>;
  type MaterialResult<V> = T.MaterialResult<V>;
  const failure = <T>(reason: MaterialFailure): MaterialResult<T> => ({
    ok: false,
    reason,
  });
  const success = <T>(value: T): MaterialResult<T> => ({ ok: true, value });

  function isPositiveInt(value: number): value is PositiveInt {
    return Number.isSafeInteger(value) && value > 0;
  }

  function checkedAdd(a: number, b: number): number | null {
    const total = a + b;
    return Number.isSafeInteger(total) && total >= 0 ? total : null;
  }

  const portableContainerInterior = (lot: ItemLot) =>
    resolvePortableInterior(definitions, lot);
  const queries = createMaterialQueries(definitions);
  const {
    groundLocation,
    sourceContainer,
    vesselBinding,
    operationUseBinding,
    useBindingLot,
    useBindingQuantity,
    bindingOwnsLot,
    boundQuantity,
    originForLot,
    originMatches,
    lotById,
    transferById,
    sameOwner,
    containerContents,
    containerQuantity,
    incomingQuantity,
    bindingPromiseQuantity,
    reservedQuantity,
    availableQuantity,
    availableMaterialFacts,
    availableLotFacts,
    availablePortions,
    transferForActor,
    carriedLot,
    embeddedQuantity,
    allocateLotId,
    sourceMatches,
    validateContainer,
    destinationAccepts,
    bulkFor,
    containerBulk,
    transferPayloadLot,
    incomingBulk,
    remainingContainerQuantity,
    admitContainerCapacity,
    requestAllowsLot,
  } = queries;

  function lotProblem(lot: ItemLot): MaterialFailure | null {
    const definition = definitions[lot.material];
    if (!definition) return "source-ineligible";
    if (!isPositiveInt(lot.quantity)) return "invalid-positive-integer";
    if (definition.carry === "whole" && lot.quantity !== 1)
      return "vessel-invalid";
    if (definition.carry === "contained" && lot.location.kind !== "container")
      return "source-ineligible";
    return null;
  }

  /** Validate existing occupancy and admitted incoming payload with no added demand. */
  function containerCapacityProblem(
    state: MaterialsState,
    container: ContainerSpec,
  ): MaterialFailure | null {
    if (!container.accepts.length) return "destination-mismatch";
    return admitContainerCapacity(state, {
      destination: container,
      material: container.accepts[0],
      quantity: 0,
    });
  }

  function createGroundLot(
    state: MaterialsState,
    material: Material,
    quantity: number,
    at: Cell,
    preferredId?: LotId,
  ): MaterialResult<ItemLot> {
    if (!isPositiveInt(quantity)) return failure("invalid-positive-integer");
    if (!definitions[material]) return failure("source-ineligible");
    if (definitions[material].carry === "contained")
      return failure("source-ineligible");
    if (definitions[material].carry === "whole" && quantity !== 1)
      return failure("vessel-invalid");
    let id: LotId;
    let nextLotId = state.nextLotId;
    if (preferredId !== undefined) {
      if (state.lots.some((lot) => lot.id === preferredId))
        return failure("duplicate-lot");
      id = preferredId;
    } else {
      const allocation = allocateLotId(state);
      if (!allocation.ok) return allocation;
      ({ id, nextLotId } = allocation.value);
    }
    const lot: ItemLot = {
      id,
      material,
      quantity,
      location: groundLocation(at),
    };
    state.lots.push(lot);
    state.nextLotId = nextLotId;
    return success(lot);
  }

  function introduceFiniteSourceLot(
    state: MaterialsState,
    input: {
      source: ContainerSpec;
      material: Material;
      quantity: number;
      preferredId?: LotId;
    },
  ): MaterialResult<ItemLot> {
    if (!isPositiveInt(input.quantity))
      return failure("invalid-positive-integer");
    const problem = validateContainer(input.source);
    if (problem) return failure(problem);
    if (!destinationAccepts(input.source, input.material))
      return failure("destination-mismatch");
    const capacityProblem = admitContainerCapacity(state, {
      destination: input.source,
      material: input.material,
      quantity: input.quantity as PositiveInt,
    });
    if (capacityProblem) return failure(capacityProblem);
    let id: LotId;
    let nextLotId = state.nextLotId;
    if (input.preferredId !== undefined) {
      if (state.lots.some((lot) => lot.id === input.preferredId))
        return failure("duplicate-lot");
      id = input.preferredId;
    } else {
      const allocation = allocateLotId(state);
      if (!allocation.ok) return allocation;
      ({ id, nextLotId } = allocation.value);
    }
    const lot: ItemLot = {
      id,
      material: input.material,
      quantity: input.quantity as PositiveInt,
      location: { kind: "container", container: input.source.id },
    };
    const invalidLot = lotProblem(lot);
    if (invalidLot) return failure(invalidLot);
    state.lots.push(lot);
    state.nextLotId = nextLotId;
    return success(lot);
  }

  function resolveReservationSource(
    state: MaterialsState,
    input: ReservationInput,
  ): MaterialResult<{ source: ItemLot; origin: TransferOrigin }> {
    const source = lotById(state, input.sourceLot);
    if (!source) return failure("lot-not-found");
    const origin = originForLot(source);
    if (!origin) return failure("source-not-available");
    if (!isPositiveInt(source.quantity))
      return failure("invalid-positive-integer");
    if (!sourceMatches(source, input.request.source, input.sourceLot))
      return failure("source-ineligible");
    if (
      !definitions[source.material] ||
      (definitions[source.material].carry === "whole" &&
        (source.quantity !== 1 || input.request.quantity !== 1))
    )
      return failure("source-ineligible");
    if (!requestAllowsLot(input.request, source))
      return failure("source-ineligible");
    if (
      definitions[source.material].interior &&
      bindingOwnsLot(state, source.id) &&
      (input.intent.kind !== "use" ||
        useBindingLot(state, input.intent.operation) !== source.id)
    )
      return failure("owner-busy");
    const authorizedBindingQuantity =
      input.intent.kind === "use" &&
      useBindingLot(state, input.intent.operation) === source.id
        ? useBindingQuantity(state, input.intent.operation)
        : 0;
    if (
      availableQuantity(state, source.id) + authorizedBindingQuantity <
      input.request.quantity
    )
      return failure("source-insufficient");
    return success({ source, origin });
  }

  function resolveReservationDestination(
    input: ReservationInput,
  ): MaterialResult<ContainerSpec | undefined> {
    if (input.intent.kind === "deliver")
      return input.destination &&
        input.intent.destination === input.destination.id
        ? success(input.destination)
        : failure("destination-mismatch");
    return input.destination
      ? failure("destination-mismatch")
      : success(undefined);
  }

  function validateReservationOwner(
    state: MaterialsState,
    input: ReservationInput,
  ): MaterialFailure | null {
    if (input.intent.kind === "deliver")
      return input.owner.kind === "job" ? null : "deliver-intent-required";
    const operation = input.intent.operation;
    return input.owner.kind === "operation" &&
      input.owner.operation === operation &&
      useBindingLot(state, operation) === input.sourceLot
      ? null
      : "use-intent-required";
  }

  function reserveTransfer(
    state: MaterialsState,
    input: ReservationInput,
  ): MaterialResult<Transfer> {
    if (!isPositiveInt(input.request.quantity))
      return failure("invalid-positive-integer");
    if (
      input.request.quantityPolicy !== "whole-lot" &&
      input.request.quantityPolicy !== "portion"
    )
      return failure("source-ineligible");
    const resolved = resolveReservationSource(state, input);
    if (!resolved.ok) return resolved;
    const destination = resolveReservationDestination(input);
    if (!destination.ok) return destination;
    const ownerProblem = validateReservationOwner(state, input);
    if (ownerProblem) return failure(ownerProblem);
    if (state.transfers.some((transfer) => transfer.id === input.id))
      return failure("duplicate-transfer");
    if (
      state.transfers.some((transfer) => sameOwner(transfer.owner, input.owner))
    )
      return failure("owner-busy");
    if (transferForActor(state, input.actor)) return failure("actor-busy");
    if (
      state.lots.some(
        (lot) =>
          lot.location.kind === "hand" && lot.location.actor === input.actor,
      )
    )
      return failure("actor-hand-not-empty");
    const { source, origin } = resolved.value;
    if (definitions[source.material].carry === "contained")
      return failure("source-ineligible");
    const use =
      input.intent.kind === "use"
        ? state.bindings.find(
            (binding) =>
              binding.id ===
              (input.intent as Extract<CarryIntent, { kind: "use" }>).operation,
          )
        : undefined;
    if (
      input.intent.kind === "use" &&
      (!use ||
        (use.kind === "vessel-use" && !definitions[source.material].interior) ||
        (use.kind === "operation-use" && use.lot !== source.id))
    )
      return failure("use-intent-required");
    if (!input.access.sourceReachable) return failure("source-unreachable");
    if (destination.value && !input.access.destinationReachableWithPayload)
      return failure("destination-unreachable");
    if (destination.value) {
      const capacityProblem = admitContainerCapacity(state, {
        destination: destination.value,
        material: source.material,
        quantity: input.request.quantity,
      });
      if (capacityProblem) return failure(capacityProblem);
    }
    const transfer: Transfer = {
      id: input.id,
      actor: input.actor,
      owner: { ...input.owner },
      resolvedMaterial: source.material,
      request: {
        source: { ...input.request.source },
        quantityPolicy: input.request.quantityPolicy,
        quantity: input.request.quantity,
      },
      intent: { ...input.intent },
      phase: {
        kind: "reserved",
        sourceLot: source.id,
        quantity: input.request.quantity,
        origin,
      },
    };
    state.transfers.push(transfer);
    return success(transfer);
  }

  /** The same physical phase law gates mutation and decoded restoration. */
  function transferPhaseProblem(
    state: MaterialsState,
    transfer: Transfer,
  ): MaterialFailure | null {
    return phaseProblem(state, transfer, false);
  }
  /** For strictly parsed predecessors only; validates facts without manufacturing a saved obligation. */
  function historicalTransferPhaseProblem(
    state: MaterialsState,
    transfer: Transfer,
  ): MaterialFailure | null {
    return phaseProblem(state, transfer, true);
  }

  function phaseProblem(
    state: MaterialsState,
    transfer: Transfer,
    historical: boolean,
  ): MaterialFailure | null {
    const phase = transfer.phase;
    const lot = lotById(
      state,
      phase.kind === "reserved" ? phase.sourceLot : phase.lot,
    );
    if (!lot) return "lot-not-found";
    const resolvedMaterial = historical
      ? lot.material
      : transfer.resolvedMaterial;
    if (!definitions[lot.material] || lot.material !== resolvedMaterial)
      return "source-ineligible";
    if (
      !isPositiveInt(transfer.request.quantity) ||
      !isPositiveInt(lot.quantity)
    )
      return "invalid-positive-integer";
    if (definitions[lot.material].carry === "contained")
      return "source-ineligible";
    if (
      definitions[lot.material].carry === "whole" &&
      (lot.quantity !== 1 || transfer.request.quantity !== 1)
    )
      return "source-ineligible";
    if (phase.kind === "reserved") {
      if (
        !originMatches(lot, phase.origin) ||
        !sourceMatches(lot, transfer.request.source, lot.id)
      )
        return "source-ineligible";
      if (
        phase.quantity !== transfer.request.quantity ||
        phase.quantity > lot.quantity ||
        !requestAllowsLot(transfer.request, lot)
      )
        return "source-insufficient";
    } else {
      if (
        lot.location.kind !== "hand" ||
        lot.location.actor !== transfer.actor ||
        lot.quantity !== transfer.request.quantity
      )
        return "held-lot-invalid";
      const request = transfer.request;
      if (request.source.kind === "exact-lot") {
        if (
          request.quantityPolicy === "whole-lot" &&
          request.source.lot !== lot.id
        )
          return "source-ineligible";
        const original = lotById(state, request.source.lot);
        if (original && original.material !== resolvedMaterial)
          return "source-ineligible";
      } else if (request.source.material !== resolvedMaterial)
        return "source-ineligible";
    }
    return null;
  }

  function pickupTransfer(
    state: MaterialsState,
    transferId: TransferId,
    access: TransferAccess,
  ): MaterialResult<ItemLot> {
    const transfer = transferById(state, transferId);
    if (!transfer) return failure("transfer-not-found");
    const phaseProblem = transferPhaseProblem(state, transfer);
    if (phaseProblem) return failure(phaseProblem);
    if (transfer.phase.kind !== "reserved") return failure("wrong-phase");
    const source = lotById(state, transfer.phase.sourceLot)!;
    const use =
      transfer.intent.kind === "use"
        ? state.bindings.find(
            (binding) =>
              binding.id ===
              (transfer.intent as Extract<CarryIntent, { kind: "use" }>)
                .operation,
          )
        : undefined;
    if (
      transfer.intent.kind === "use" &&
      (!use ||
        (use.kind === "vessel-use" && !definitions[source.material].interior) ||
        (use.kind === "operation-use" && use.lot !== source.id))
    )
      return failure("use-intent-required");
    if (!access.sourceReachable) return failure("source-unreachable");
    if (
      transfer.intent.kind === "deliver" &&
      !access.destinationReachableWithPayload
    )
      return failure("destination-unreachable");
    if (
      state.lots.some(
        (lot) =>
          lot.id !== source.id &&
          lot.location.kind === "hand" &&
          lot.location.actor === transfer.actor,
      )
    )
      return failure("actor-hand-not-empty");

    let carried: ItemLot;
    if (source.quantity === transfer.phase.quantity) {
      source.location = { kind: "hand", actor: transfer.actor };
      carried = source;
    } else {
      const allocation = allocateLotId(state);
      if (!allocation.ok) return allocation;
      source.quantity = (source.quantity -
        transfer.phase.quantity) as PositiveInt;
      carried = {
        id: allocation.value.id,
        material: source.material,
        quantity: transfer.phase.quantity,
        location: { kind: "hand", actor: transfer.actor },
      };
      state.lots.push(carried);
      state.nextLotId = allocation.value.nextLotId;
    }
    transfer.phase = { kind: "carrying", lot: carried.id };
    if (use?.kind === "operation-use")
      state.bindings = state.bindings.map((binding) =>
        binding === use ? { ...binding, lot: carried.id } : binding,
      );
    return success(carried);
  }

  function deliverTransfer(
    state: MaterialsState,
    transferId: TransferId,
    destination: ContainerSpec,
    destinationReachableWithPayload: boolean,
  ): MaterialResult<ItemLot> {
    const transfer = transferById(state, transferId);
    if (!transfer) return failure("transfer-not-found");
    const phaseProblem = transferPhaseProblem(state, transfer);
    if (phaseProblem) return failure(phaseProblem);
    if (transfer.phase.kind !== "carrying") return failure("wrong-phase");
    if (transfer.intent.kind !== "deliver")
      return failure("deliver-intent-required");
    if (
      transfer.intent.destination !== destination.id ||
      transfer.request.quantity > destination.capacity
    )
      return failure("destination-mismatch");
    const held = lotById(state, transfer.phase.lot)!;
    if (!destinationAccepts(destination, held.material))
      return failure("held-lot-invalid");
    if (!destinationReachableWithPayload)
      return failure("destination-unreachable");
    const capacityProblem = admitContainerCapacity(state, {
      destination,
      material: held.material,
      quantity: held.quantity,
      except: transfer.id,
    });
    if (capacityProblem) return failure(capacityProblem);

    held.location = { kind: "container", container: destination.id };
    state.transfers.splice(state.transfers.indexOf(transfer), 1);
    return success(held);
  }

  function moveContainerPortions(
    state: MaterialsState,
    input: {
      source: ContainerSpec;
      destination: ContainerSpec;
      portions: readonly MaterialPortion[];
      material: Material;
      quantity: number;
      access: TransferAccess;
    },
  ): MaterialResult<MaterialPortion[]> {
    if (input.source.id === input.destination.id)
      return failure("destination-mismatch");
    const sourceProblem = validateContainer(input.source);
    if (sourceProblem) return failure(sourceProblem);
    if (!input.source.accepts.includes(input.material))
      return failure("source-ineligible");
    const planned = planContainerDebit(
      state,
      {
        container: input.source.id,
        material: input.material,
        portions: input.portions,
        quantity: input.quantity,
      },
      availableQuantity,
    );
    if (!planned.ok) return planned;
    if (!input.access.sourceReachable) return failure("source-unreachable");
    if (!input.access.destinationReachableWithPayload)
      return failure("destination-unreachable");
    const capacity = admitContainerCapacity(state, {
      destination: input.destination,
      material: input.material,
      quantity: input.quantity,
    });
    if (capacity) return failure(capacity);
    // Reserve every split identity against a detached allocator cursor before any debit.
    const cursor = { ...state, nextLotId: state.nextLotId };
    const ids: string[] = [];
    for (const { lot, quantity } of planned.value) {
      if (lot.quantity === quantity) ids.push(lot.id);
      else {
        const allocation = allocateLotId(cursor);
        if (!allocation.ok) return allocation;
        ids.push(allocation.value.id);
        cursor.nextLotId = allocation.value.nextLotId;
      }
    }
    planned.value.forEach(({ lot, quantity }, index) => {
      const location = {
        kind: "container" as const,
        container: input.destination.id,
      };
      if (lot.quantity === quantity) lot.location = location;
      else {
        lot.quantity = (lot.quantity - quantity) as PositiveInt;
        state.lots.push({
          id: ids[index]!,
          material: lot.material,
          quantity: quantity as PositiveInt,
          location,
        });
      }
    });
    state.nextLotId = cursor.nextLotId;
    return success(
      planned.value.map(({ quantity }, index) => ({
        lot: ids[index]!,
        quantity,
      })),
    );
  }

  function interruptExactTransfer(
    state: MaterialsState,
    transfer: Transfer | undefined,
    drop?: LegalDrop,
  ): MaterialResult<InterruptResult> {
    if (!transfer) return success({ kind: "none" });
    const problem = transferPhaseProblem(state, transfer);
    if (problem) return failure(problem);
    if (transfer.phase.kind === "reserved") {
      state.transfers.splice(state.transfers.indexOf(transfer), 1);
      return success({
        kind: "released",
        transfer: transfer.id,
        owner: transfer.owner,
      });
    }
    const held = lotById(state, transfer.phase.lot)!;
    if (!drop?.legal) return failure("illegal-drop");
    held.location = groundLocation(drop.cell);
    state.transfers.splice(state.transfers.indexOf(transfer), 1);
    return success({
      kind: "dropped",
      transfer: transfer.id,
      lot: held.id,
      owner: transfer.owner,
    });
  }

  function interruptTransfer(
    state: MaterialsState,
    actor: ActorId,
    drop?: LegalDrop,
  ): MaterialResult<InterruptResult> {
    return interruptExactTransfer(state, transferForActor(state, actor), drop);
  }

  function releaseContainer(
    state: MaterialsState,
    container: ContainerSpec,
    input: {
      contentsDrop: LegalDrop;
      carriedDrops: Readonly<Record<ActorId, LegalDrop>>;
    },
  ): MaterialResult<ReleasedContainer> {
    const containerProblem = validateContainer(container);
    if (containerProblem) return failure(containerProblem);
    if (embeddedQuantity(state, container.id) > 0)
      return failure("container-embedded");
    if (
      state.bindings.some(
        (binding) =>
          binding.kind === "recipe" &&
          (binding.station === container.id ||
            binding.promises.some(
              (promise) => promise.destination === container.id,
            )),
      )
    )
      return failure("owner-busy");
    const contents = [...containerContents(state, container.id)];
    if (contents.length > 0 && !input.contentsDrop.legal)
      return failure("illegal-drop");
    const affected = state.transfers.filter(
      (transfer) =>
        (transfer.intent.kind === "deliver" &&
          transfer.intent.destination === container.id) ||
        (transfer.phase.kind === "reserved" &&
          transfer.phase.origin.kind === "container" &&
          transfer.phase.origin.container === container.id),
    );
    const carried: { transfer: Transfer; lot: ItemLot; drop: LegalDrop }[] = [];
    for (const transfer of affected) {
      const problem = transferPhaseProblem(state, transfer);
      if (problem) return failure(problem);
      if (transfer.phase.kind === "reserved") continue;
      const lot = lotById(state, transfer.phase.lot)!;
      const drop = input.carriedDrops[transfer.actor];
      if (!drop?.legal) return failure("illegal-drop");
      carried.push({ transfer, lot, drop });
    }

    for (const lot of contents)
      lot.location = groundLocation(input.contentsDrop.cell);
    for (const { lot, drop } of carried)
      lot.location = groundLocation(drop.cell);
    const affectedIds = new Set(affected.map((transfer) => transfer.id));
    state.transfers = state.transfers.filter(
      (transfer) => !affectedIds.has(transfer.id),
    );
    return success({
      contents: contents.map((lot) => lot.id),
      released: affected
        .filter((transfer) => transfer.phase.kind === "reserved")
        .map((transfer) => transfer.id),
      dropped: carried.map(({ lot }) => lot.id),
      owners: affected.map((transfer) => transfer.owner),
    });
  }

  function embedContainer(
    state: MaterialsState,
    container: ContainerSpec,
    material: Material,
    quantity: number,
  ): MaterialResult<EmbeddedMaterial> {
    const containerProblem = validateContainer(container);
    if (containerProblem) return failure(containerProblem);
    if (!isPositiveInt(quantity)) return failure("invalid-positive-integer");
    if (!destinationAccepts(container, material))
      return failure("destination-mismatch");
    if (
      incomingQuantity(state, container.id) > 0 ||
      bindingPromiseQuantity(state, container) > 0
    )
      return failure("container-has-incoming");
    if (state.embedded.some((entry) => entry.container === container.id))
      return failure("embedding-exists");
    const contents = [...containerContents(state, container.id)];
    if (
      contents.some((lot) => lot.material !== material) ||
      containerQuantity(state, container.id, material) !== quantity
    )
      return failure("container-incomplete");
    const entry: EmbeddedMaterial = {
      container: container.id,
      material,
      quantity: quantity as PositiveInt,
    };
    const contentIds = new Set(contents.map((lot) => lot.id));
    state.lots = state.lots.filter((lot) => !contentIds.has(lot.id));
    state.embedded.push(entry);
    return success(entry);
  }

  type ReservationInput = {
    id: TransferId;
    actor: ActorId;
    owner: Transfer["owner"];
    request: TransferRequest;
    intent: CarryIntent;
    sourceLot: LotId;
    destination?: ContainerSpec;
    access: TransferAccess;
  };

  type InterruptResult =
    | { kind: "none" }
    | { kind: "released"; transfer: TransferId; owner: Transfer["owner"] }
    | {
        kind: "dropped";
        transfer: TransferId;
        lot: LotId;
        owner: Transfer["owner"];
      };

  type ReleasedContainer = {
    contents: readonly LotId[];
    released: readonly TransferId[];
    dropped: readonly LotId[];
    owners: readonly Transfer["owner"][];
  };

  return {
    lotProblem,
    containerCapacityProblem,
    createGroundLot,
    introduceFiniteSourceLot,
    reserveTransfer,
    pickupTransfer,
    deliverTransfer,
    moveContainerPortions,
    interruptTransfer,
    releaseContainer,
    embedContainer,
    transferPhaseProblem,
    portableContainerInterior,
    internal: {
      historicalTransferPhaseProblem,
      interruptExactTransfer,
      groundLocation,
      sourceContainer,
      vesselBinding,
      operationUseBinding,
      useBindingLot,
      useBindingQuantity,
      bindingOwnsLot,
      boundQuantity,
      originForLot,
      originMatches,
      lotById,
      transferById,
      sameOwner,
      containerContents,
      containerQuantity,
      incomingQuantity,
      bindingPromiseQuantity,
      reservedQuantity,
      availableQuantity,
      availableMaterialFacts,
      availableLotFacts,
      availablePortions,
      transferForActor,
      carriedLot,
      embeddedQuantity,
      allocateLotId,
      sourceMatches,
      validateContainer,
      destinationAccepts,
      bulkFor,
      containerBulk,
      transferPayloadLot,
      incomingBulk,
      remainingContainerQuantity,
      admitContainerCapacity,
      requestAllowsLot,
    },
  };
}
