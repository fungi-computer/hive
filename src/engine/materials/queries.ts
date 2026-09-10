import { resolvePortableInterior } from "./definitions.ts";
import type * as T from "./types.ts";
export type {
  ContainerSpec,
  MaterialFailure,
  MaterialResult,
  TransferAccess,
  LegalDrop,
} from "./types.ts";

/** One physical owner, configured once by each consumer's checked content definitions. */
export function createMaterialQueries<M extends string>(
  definitions: T.MaterialDefinitions<M>,
) {
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
  function groundLocation(at: Cell): ItemLot["location"] {
    return { kind: "ground", x: at.x, z: at.z, y: at.y };
  }

  function sourceContainer(id: string): ContainerId {
    return `source:${id}`;
  }

  function vesselBinding(
    state: MaterialsState,
    operation: string,
  ): Extract<MaterialBinding, { kind: "vessel-use" }> | undefined {
    return state.bindings.find(
      (binding): binding is Extract<MaterialBinding, { kind: "vessel-use" }> =>
        binding.kind === "vessel-use" && binding.id === operation,
    );
  }

  function operationUseBinding(
    state: MaterialsState,
    operation: string,
  ): Extract<MaterialBinding, { kind: "operation-use" }> | undefined {
    return state.bindings.find(
      (
        binding,
      ): binding is Extract<MaterialBinding, { kind: "operation-use" }> =>
        binding.kind === "operation-use" && binding.id === operation,
    );
  }

  function useBindingLot(
    state: MaterialsState,
    operation: string,
  ): LotId | undefined {
    return (
      vesselBinding(state, operation)?.vessel ??
      operationUseBinding(state, operation)?.lot
    );
  }

  function useBindingQuantity(
    state: MaterialsState,
    operation: string,
  ): number {
    return vesselBinding(state, operation)
      ? 1
      : (operationUseBinding(state, operation)?.quantity ?? 0);
  }

  function bindingOwnsLot(state: MaterialsState, lot: LotId): boolean {
    return state.bindings.some(
      (binding) =>
        (binding.kind === "vessel-use" && binding.vessel === lot) ||
        (binding.kind === "operation-use" && binding.lot === lot) ||
        (binding.kind === "recipe" &&
          (binding.retained.some((entry) => entry.lot === lot) ||
            (!state.transformations.some((entry) => entry.id === binding.id) &&
              binding.consumed.some((portion) => portion.lot === lot)))),
    );
  }

  function boundQuantity(state: MaterialsState, lot: LotId): number {
    return state.bindings.reduce(
      (total, binding) =>
        total +
        (binding.kind === "vessel-use"
          ? binding.vessel === lot
            ? 1
            : 0
          : binding.kind === "operation-use"
            ? binding.lot === lot
              ? binding.quantity
              : 0
            : binding.retained.reduce(
                (sum, retained) =>
                  sum + (retained.lot === lot ? retained.quantity : 0),
                0,
              ) +
              (state.transformations.some((entry) => entry.id === binding.id)
                ? 0
                : binding.consumed.reduce(
                    (sum, portion) =>
                      sum + (portion.lot === lot ? portion.quantity : 0),
                    0,
                  ))),
      0,
    );
  }

  function originForLot(lot: ItemLot): TransferOrigin | null {
    return lot.location.kind === "ground"
      ? {
          kind: "ground",
          cell: {
            x: lot.location.x,
            z: lot.location.z,
            y: lot.location.y,
          },
        }
      : lot.location.kind === "container"
        ? { kind: "container", container: lot.location.container }
        : null;
  }

  function originMatches(lot: ItemLot, origin: TransferOrigin): boolean {
    return origin.kind === "ground"
      ? lot.location.kind === "ground" &&
          lot.location.x === origin.cell.x &&
          lot.location.z === origin.cell.z &&
          lot.location.y === origin.cell.y
      : lot.location.kind === "container" &&
          lot.location.container === origin.container;
  }

  function lotById(state: MaterialsState, id: LotId): ItemLot | undefined {
    return state.lots.find((lot) => lot.id === id);
  }

  function transferById(
    state: MaterialsState,
    id: TransferId,
  ): Transfer | undefined {
    return state.transfers.find((transfer) => transfer.id === id);
  }

  function sameOwner(a: Transfer["owner"], b: Transfer["owner"]): boolean {
    return a.kind === "operation" || b.kind === "operation"
      ? a.kind === "operation" &&
          b.kind === "operation" &&
          a.operation === b.operation
      : a.job === b.job && a.step === b.step;
  }

  function containerContents(
    state: MaterialsState,
    container: ContainerId,
  ): readonly ItemLot[] {
    return state.lots.filter(
      (lot) =>
        lot.location.kind === "container" &&
        lot.location.container === container,
    );
  }

  function containerQuantity(
    state: MaterialsState,
    container: ContainerId,
    material?: Material,
  ): number {
    return containerContents(state, container).reduce(
      (total, lot) =>
        total +
        (material === undefined || lot.material === material
          ? lot.quantity
          : 0),
      0,
    );
  }

  function incomingQuantity(
    state: MaterialsState,
    container: ContainerId,
    except?: TransferId,
  ): number {
    return state.transfers.reduce(
      (total, transfer) =>
        total +
        (transfer.id !== except &&
        transfer.intent.kind === "deliver" &&
        transfer.intent.destination === container
          ? transfer.request.quantity
          : 0),
      0,
    );
  }

  function bindingPromiseQuantity(
    state: MaterialsState,
    container: ContainerSpec,
  ): number {
    return state.bindings.reduce(
      (total, binding) =>
        total +
        (binding.kind !== "recipe"
          ? 0
          : binding.promises
              .filter((promise) => promise.destination === container.id)
              .reduce((sum, promise) => {
                const bulk = bulkFor(container, promise.material);
                return sum + promise.quantity * (bulk ?? Infinity);
              }, 0)),
      0,
    );
  }

  function reservedQuantity(state: MaterialsState, lot: LotId): number {
    return state.transfers.reduce(
      (total, transfer) =>
        total +
        (transfer.phase.kind === "reserved" && transfer.phase.sourceLot === lot
          ? transfer.phase.quantity
          : 0),
      0,
    );
  }

  function availableQuantity(state: MaterialsState, lot: LotId): number {
    const source = lotById(state, lot);
    if (!source || source.location.kind === "hand") return 0;
    return Math.max(
      0,
      source.quantity -
        reservedQuantity(state, source.id) -
        boundQuantity(state, source.id),
    );
  }

  function availableMaterialFacts(
    state: MaterialsState,
  ): readonly AvailableLotFact[] {
    const reserved = new Map<LotId, number>();
    for (const transfer of state.transfers)
      if (transfer.phase.kind === "reserved")
        reserved.set(
          transfer.phase.sourceLot,
          (reserved.get(transfer.phase.sourceLot) ?? 0) +
            transfer.phase.quantity,
        );
    return state.lots.flatMap((lot) => {
      const origin = originForLot(lot);
      const quantity =
        lot.quantity -
        (reserved.get(lot.id) ?? 0) -
        boundQuantity(state, lot.id);
      return origin && quantity > 0 ? [{ lot, quantity, origin }] : [];
    });
  }

  function availableLotFacts(
    state: MaterialsState,
    source: SourcePolicy,
  ): readonly AvailableLotFact[] {
    return availableMaterialFacts(state).filter(({ lot }) =>
      source.kind === "exact-lot"
        ? source.lot === lot.id
        : source.kind === "eligible-ground"
          ? lot.material === source.material && lot.location.kind === "ground"
          : lot.material === source.material &&
            lot.location.kind === "container" &&
            lot.location.container === source.container,
    );
  }

  function availablePortions(
    state: MaterialsState,
    source: SourcePolicy,
  ): readonly AvailablePortion[] {
    return availableLotFacts(state, source).map(({ lot, quantity }) => ({
      lot: lot.id,
      quantity,
    }));
  }

  function transferForActor(
    state: MaterialsState,
    actor: ActorId,
  ): Transfer | undefined {
    return state.transfers.find((transfer) => transfer.actor === actor);
  }

  function carriedLot(
    state: MaterialsState,
    actor: ActorId,
  ): ItemLot | undefined {
    const transfer = transferForActor(state, actor);
    if (!transfer || transfer.phase.kind !== "carrying") return undefined;
    const lot = lotById(state, transfer.phase.lot);
    return lot?.location.kind === "hand" && lot.location.actor === actor
      ? lot
      : undefined;
  }

  function embeddedQuantity(
    state: MaterialsState,
    container: ContainerId,
    material?: Material,
  ): number {
    return state.embedded.reduce(
      (total, entry) =>
        total +
        (entry.container === container &&
        (material === undefined || entry.material === material)
          ? entry.quantity
          : 0),
      0,
    );
  }

  function allocateLotId(
    state: MaterialsState,
  ): MaterialResult<{ id: LotId; nextLotId: number }> {
    if (!Number.isSafeInteger(state.nextLotId) || state.nextLotId < 0)
      return failure("invalid-allocator");
    let next = state.nextLotId;
    while (state.lots.some((lot) => lot.id === `lot-${next}`)) {
      next++;
      if (!Number.isSafeInteger(next)) return failure("invalid-allocator");
    }
    if (next === Number.MAX_SAFE_INTEGER) return failure("invalid-allocator");
    return success({ id: `lot-${next}`, nextLotId: next + 1 });
  }

  function sourceMatches(
    lot: ItemLot,
    policy: SourcePolicy,
    selected: LotId,
  ): boolean {
    return policy.kind === "exact-lot"
      ? policy.lot === selected
      : policy.kind === "eligible-ground"
        ? lot.material === policy.material && lot.location.kind === "ground"
        : lot.material === policy.material &&
          lot.location.kind === "container" &&
          lot.location.container === policy.container;
  }

  function validateContainer(spec: ContainerSpec): MaterialFailure | null {
    if (!isPositiveInt(spec.capacity)) return "invalid-positive-integer";
    if (!spec.accepts.length) return "destination-mismatch";
    if (
      spec.accepts.some((material) => !isPositiveInt(spec.bulk[material] ?? 0))
    )
      return "invalid-positive-integer";
    return null;
  }

  function destinationAccepts(
    spec: ContainerSpec,
    material: Material,
  ): boolean {
    return spec.accepts.includes(material);
  }

  function bulkFor(spec: ContainerSpec, material: Material): number | null {
    const bulk = spec.bulk[material];
    return destinationAccepts(spec, material) && isPositiveInt(bulk ?? 0)
      ? bulk!
      : null;
  }

  function containerBulk(
    state: MaterialsState,
    container: ContainerSpec,
  ): number {
    return containerContents(state, container.id).reduce((total, lot) => {
      const bulk = bulkFor(container, lot.material);
      return total + lot.quantity * (bulk ?? Number.POSITIVE_INFINITY);
    }, 0);
  }

  function transferPayloadLot(
    state: MaterialsState,
    transfer: Transfer,
  ): MaterialResult<ItemLot> {
    const lot = lotById(
      state,
      transfer.phase.kind === "reserved"
        ? transfer.phase.sourceLot
        : transfer.phase.lot,
    );
    if (!lot)
      return failure(
        transfer.phase.kind === "reserved"
          ? "lot-not-found"
          : "held-lot-invalid",
      );
    // Water travels only inside a vessel.  A generic carrying transfer must
    // never make it actor-hand cargo, even when decoding malformed state.
    if (
      definitions[lot.material].carry === "contained" &&
      lot.location.kind === "hand"
    )
      return failure("held-lot-invalid");
    return success(lot);
  }

  function incomingBulk(
    state: MaterialsState,
    container: ContainerSpec,
    except?: TransferId,
  ): MaterialResult<number> {
    let total = 0;
    for (const transfer of state.transfers) {
      if (
        transfer.id === except ||
        transfer.intent.kind !== "deliver" ||
        transfer.intent.destination !== container.id
      )
        continue;
      const payload = transferPayloadLot(state, transfer);
      if (!payload.ok) return payload;
      const bulk = bulkFor(container, payload.value.material);
      if (bulk === null) return success(Number.POSITIVE_INFINITY);
      const next = checkedAdd(total, transfer.request.quantity * bulk);
      if (next === null) return success(Number.POSITIVE_INFINITY);
      total = next;
    }
    return success(total);
  }

  function remainingContainerQuantity(
    state: MaterialsState,
    container: ContainerSpec,
    material: Material,
  ): MaterialResult<number> {
    const problem = validateContainer(container);
    if (problem) return failure(problem);
    if (!destinationAccepts(container, material))
      return failure("destination-mismatch");
    if (embeddedQuantity(state, container.id) > 0)
      return failure("container-embedded");
    const promised = incomingBulk(state, container);
    if (!promised.ok) return promised;
    const bulk = bulkFor(container, material);
    const occupied = checkedAdd(
      containerBulk(state, container),
      bindingPromiseQuantity(state, container),
    );
    const used =
      occupied === null ? null : checkedAdd(occupied, promised.value);
    if (bulk === null || used === null) return success(0);
    return success(Math.max(0, Math.floor((container.capacity - used) / bulk)));
  }

  function admitContainerCapacity(
    state: MaterialsState,
    input: {
      destination: ContainerSpec;
      material: Material;
      quantity: number;
      except?: TransferId;
    },
  ): MaterialFailure | null {
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 0)
      return "invalid-positive-integer";
    const problem = validateContainer(input.destination);
    if (problem) return problem;
    if (!destinationAccepts(input.destination, input.material))
      return "destination-mismatch";
    if (embeddedQuantity(state, input.destination.id) > 0)
      return "container-embedded";
    const promised = incomingBulk(state, input.destination, input.except);
    if (!promised.ok) return promised.reason;
    const bulk = bulkFor(input.destination, input.material);
    const occupied = checkedAdd(
      containerBulk(state, input.destination),
      bindingPromiseQuantity(state, input.destination),
    );
    const used =
      occupied === null ? null : checkedAdd(occupied, promised.value);
    const after =
      used === null || bulk === null
        ? null
        : checkedAdd(used, input.quantity * bulk);
    return after === null || after > input.destination.capacity
      ? "destination-full"
      : null;
  }

  function requestAllowsLot(request: TransferRequest, lot: ItemLot): boolean {
    return (
      request.quantityPolicy === "portion" || request.quantity === lot.quantity
    );
  }

  type AvailablePortion = { lot: LotId; quantity: number };

  type AvailableLotFact = {
    readonly lot: ItemLot;
    readonly quantity: number;
    readonly origin: TransferOrigin;
  };

  return {
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
  };
}
