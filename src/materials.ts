import type {
  ActorId,
  CarryIntent,
  Cell,
  ContainerId,
  EmbeddedMaterial,
  ItemLot,
  JobId,
  LotId,
  Material,
  MaterialBinding,
  MaterialsState,
  PositiveInt,
  RecipeId,
  SourcePolicy,
  Transfer,
  TransferId,
  TransferOrigin,
  TransferRequest,
} from "./model.ts";
import {
  portableContainerInterior,
  vesselContainer,
} from "./item-containers.ts";

export { vesselContainer } from "./item-containers.ts";

/** A resolved destination definition.  The transfer kernel only sees its
 * accepted materials and promised capacity; site/shelf rules stay with callers. */
export type ContainerSpec = {
  id: ContainerId;
  capacity: PositiveInt;
  accepts: readonly Material[];
  bulk: Readonly<Partial<Record<Material, PositiveInt>>>;
};

export type TransferAccess = {
  sourceReachable: boolean;
  destinationReachableWithPayload: boolean;
};

export type LegalDrop = { cell: Cell; legal: boolean };

export type MaterialFailure =
  | "invalid-positive-integer"
  | "invalid-allocator"
  | "duplicate-lot"
  | "duplicate-sink"
  | "duplicate-transfer"
  | "lot-not-found"
  | "transfer-not-found"
  | "source-not-available"
  | "source-ineligible"
  | "source-insufficient"
  | "source-unreachable"
  | "destination-unreachable"
  | "destination-mismatch"
  | "destination-full"
  | "owner-busy"
  | "actor-busy"
  | "actor-hand-not-empty"
  | "wrong-phase"
  | "held-lot-invalid"
  | "illegal-drop"
  | "container-has-incoming"
  | "container-embedded"
  | "container-incomplete"
  | "embedding-exists"
  | "embedding-not-found"
  | "invalid-salvage"
  | "use-intent-required"
  | "deliver-intent-required"
  | "vessel-invalid";

export type MaterialResult<T> =
  { ok: true; value: T } | { ok: false; reason: MaterialFailure };

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

function groundLocation(at: Cell): ItemLot["location"] {
  return { kind: "ground", x: at.x, z: at.z, level: at.level };
}

export function sourceContainer(id: string): ContainerId {
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
    (binding): binding is Extract<MaterialBinding, { kind: "operation-use" }> =>
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
          level: lot.location.level,
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
        lot.location.level === origin.cell.level
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

export function containerContents(
  state: MaterialsState,
  container: ContainerId,
): readonly ItemLot[] {
  return state.lots.filter(
    (lot) =>
      lot.location.kind === "container" && lot.location.container === container,
  );
}

export function containerQuantity(
  state: MaterialsState,
  container: ContainerId,
  material?: Material,
): number {
  return containerContents(state, container).reduce(
    (total, lot) =>
      total +
      (material === undefined || lot.material === material ? lot.quantity : 0),
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

/** Durable recipe promises occupy output space before process work begins. */
export function bindingPromiseQuantity(
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

export function availableQuantity(state: MaterialsState, lot: LotId): number {
  const source = lotById(state, lot);
  if (!source || source.location.kind === "hand") return 0;
  return Math.max(
    0,
    source.quantity -
      reservedQuantity(state, source.id) -
      boundQuantity(state, source.id),
  );
}

export type AvailablePortion = { lot: LotId; quantity: number };

/** Immutable planning facts.  They deliberately do not reserve anything: the
 * kernel remains the only atomic admission point at commit. */
export type AvailableLotFact = {
  readonly lot: ItemLot;
  readonly quantity: number;
  readonly origin: TransferOrigin;
};

export function availableMaterialFacts(
  state: MaterialsState,
): readonly AvailableLotFact[] {
  const reserved = new Map<LotId, number>();
  for (const transfer of state.transfers)
    if (transfer.phase.kind === "reserved")
      reserved.set(
        transfer.phase.sourceLot,
        (reserved.get(transfer.phase.sourceLot) ?? 0) + transfer.phase.quantity,
      );
  return state.lots.flatMap((lot) => {
    const origin = originForLot(lot);
    const quantity =
      lot.quantity - (reserved.get(lot.id) ?? 0) - boundQuantity(state, lot.id);
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

export function availablePortions(
  state: MaterialsState,
  source: SourcePolicy,
): readonly AvailablePortion[] {
  return availableLotFacts(state, source).map(({ lot, quantity }) => ({
    lot: lot.id,
    quantity,
  }));
}

export function transferForActor(
  state: MaterialsState,
  actor: ActorId,
): Transfer | undefined {
  return state.transfers.find((transfer) => transfer.actor === actor);
}

export function carriedLot(
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

export function embeddedQuantity(
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

export function materialQuantity(
  state: MaterialsState,
  material: Material,
): { live: number; embedded: number; consumed: number } {
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

export function createGroundLot(
  state: MaterialsState,
  material: Material,
  quantity: number,
  at: Cell,
  preferredId?: LotId,
): MaterialResult<ItemLot> {
  if (!isPositiveInt(quantity)) return failure("invalid-positive-integer");
  if (material === "water") return failure("source-ineligible");
  if (material === "pail" && quantity !== 1) return failure("vessel-invalid");
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

/** A checked permanent portion sink for a consumer with an exact ground input. */
function consumeGroundPortion(
  state: MaterialsState,
  input: { lot: LotId; material: Material; quantity: number },
): MaterialResult<void> {
  if (!isPositiveInt(input.quantity))
    return failure("invalid-positive-integer");
  const lot = lotById(state, input.lot);
  if (!lot || lot.material !== input.material || lot.location.kind !== "ground")
    return failure("source-ineligible");
  if (availableQuantity(state, lot.id) < input.quantity)
    return failure("source-insufficient");
  if (lot.quantity === input.quantity)
    state.lots = state.lots.filter((candidate) => candidate !== lot);
  else lot.quantity = (lot.quantity - input.quantity) as PositiveInt;
  if (input.material === "wood") state.consumedWood += input.quantity;
  return success(undefined);
}

/** A checked permanent portion sink for a resolved consumer container. */
export function consumeContainerPortion(
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
  if (input.material === "wood") state.consumedWood += input.quantity;
  return success(undefined);
}

/** One-time finite-source seeding. Callers must pass the resolved source spec. */
export function introduceFiniteSourceLot(
  state: MaterialsState,
  input: {
    source: ContainerSpec;
    material: Material;
    quantity: number;
    preferredId: LotId;
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
  if (state.lots.some((lot) => lot.id === input.preferredId))
    return failure("duplicate-lot");
  let nextLotId = state.nextLotId;
  const lot: ItemLot = {
    id: input.preferredId,
    material: input.material,
    quantity: input.quantity as PositiveInt,
    location: { kind: "container", container: input.source.id },
  };
  state.lots.push(lot);
  state.nextLotId = nextLotId;
  return success(lot);
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
  if (spec.accepts.some((material) => !isPositiveInt(spec.bulk[material] ?? 0)))
    return "invalid-positive-integer";
  return null;
}

function destinationAccepts(spec: ContainerSpec, material: Material): boolean {
  return spec.accepts.includes(material);
}

function bulkFor(spec: ContainerSpec, material: Material): number | null {
  const bulk = spec.bulk[material];
  return destinationAccepts(spec, material) && isPositiveInt(bulk ?? 0)
    ? bulk!
    : null;
}

export function containerBulk(
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
      transfer.phase.kind === "reserved" ? "lot-not-found" : "held-lot-invalid",
    );
  // Water travels only inside a vessel.  A generic carrying transfer must
  // never make it actor-hand cargo, even when decoding malformed state.
  if (lot.material === "water" && lot.location.kind === "hand")
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

/** Read-only planner fact; reserveTransfer still revalidates atomically. */
export function remainingContainerQuantity(
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
  const used = checkedAdd(containerBulk(state, container), promised.value);
  if (bulk === null || used === null) return success(0);
  return success(Math.max(0, Math.floor((container.capacity - used) / bulk)));
}

/** The one checked occupancy rule for promises, delivery and direct portions. */
function admitContainerCapacity(
  state: MaterialsState,
  input: {
    destination: ContainerSpec;
    material: Material;
    quantity: PositiveInt;
    except?: TransferId;
  },
): MaterialFailure | null {
  const problem = validateContainer(input.destination);
  if (problem) return problem;
  if (!destinationAccepts(input.destination, input.material))
    return "destination-mismatch";
  if (embeddedQuantity(state, input.destination.id) > 0)
    return "container-embedded";
  const promised = incomingBulk(state, input.destination, input.except);
  if (!promised.ok) return promised.reason;
  const bulk = bulkFor(input.destination, input.material);
  const used = checkedAdd(
    containerBulk(state, input.destination),
    promised.value,
  );
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
  if (!requestAllowsLot(input.request, source))
    return failure("source-ineligible");
  if (
    source.material === "pail" &&
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

export function reserveTransfer(
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
  if (source.material === "water") return failure("source-ineligible");
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
      (use.kind === "vessel-use" && source.material !== "pail") ||
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

/** Atomically records the one operation that may retain this whole held pail. */
export function acquirePailForOperation(
  state: MaterialsState,
  input: {
    id: TransferId;
    operation: string;
    actor: ActorId;
    vessel: LotId;
    access: TransferAccess;
  },
): MaterialResult<Transfer> {
  if (vesselBinding(state, input.operation)) return failure("owner-busy");
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
export function acquireLotForOperation(
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
export function parkOperationPail(
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
  if (transfer.phase.kind === "reserved") {
    state.transfers.splice(state.transfers.indexOf(transfer), 1);
    return success(undefined);
  }
  const held = lotById(state, transfer.phase.lot);
  if (
    !held ||
    held.location.kind !== "hand" ||
    held.location.actor !== input.actor ||
    held.material !== "pail" ||
    held.quantity !== 1 ||
    !input.drop.legal
  )
    return failure("held-lot-invalid");
  const cell = {
    x: input.drop.cell.x,
    z: input.drop.cell.z,
    level: input.drop.cell.level,
  };
  held.location = groundLocation(cell);
  state.transfers.splice(state.transfers.indexOf(transfer), 1);
  return success(undefined);
}

/** Reassignment creates fresh executor custody for the operation's bound pail. */
export function rebindOperationPail(
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

export function pickupTransfer(
  state: MaterialsState,
  transferId: TransferId,
  access: TransferAccess,
): MaterialResult<ItemLot> {
  const transfer = transferById(state, transferId);
  if (!transfer) return failure("transfer-not-found");
  if (transfer.phase.kind !== "reserved") return failure("wrong-phase");
  const source = lotById(state, transfer.phase.sourceLot);
  if (!source) return failure("lot-not-found");
  if (!originMatches(source, transfer.phase.origin))
    return failure("source-not-available");
  if (!isPositiveInt(source.quantity))
    return failure("invalid-positive-integer");
  if (!sourceMatches(source, transfer.request.source, source.id))
    return failure("source-ineligible");
  if (!requestAllowsLot(transfer.request, source))
    return failure("source-ineligible");
  if (source.material === "water") return failure("source-ineligible");
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
      (use.kind === "vessel-use" && source.material !== "pail") ||
      (use.kind === "operation-use" && use.lot !== source.id))
  )
    return failure("use-intent-required");
  if (source.quantity < transfer.phase.quantity)
    return failure("source-insufficient");
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

/** Cancelling an ordinary use releases both its claim and physical custody. */
export function retireOperationUse(
  state: MaterialsState,
  operation: string,
): void {
  state.bindings = state.bindings.filter((binding) => binding.id !== operation);
}

export function deliverTransfer(
  state: MaterialsState,
  transferId: TransferId,
  destination: ContainerSpec,
  destinationReachableWithPayload: boolean,
): MaterialResult<ItemLot> {
  const transfer = transferById(state, transferId);
  if (!transfer) return failure("transfer-not-found");
  if (transfer.phase.kind !== "carrying") return failure("wrong-phase");
  if (transfer.intent.kind !== "deliver")
    return failure("deliver-intent-required");
  if (
    transfer.intent.destination !== destination.id ||
    transfer.request.quantity > destination.capacity
  )
    return failure("destination-mismatch");
  const held = lotById(state, transfer.phase.lot);
  if (
    !held ||
    held.location.kind !== "hand" ||
    held.location.actor !== transfer.actor ||
    held.quantity !== transfer.request.quantity ||
    !destinationAccepts(destination, held.material)
  )
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

/** Moves one exact portion between resolved containers as one mutation. */
export function moveContainerPortion(
  state: MaterialsState,
  input: {
    source: ContainerSpec;
    destination: ContainerSpec;
    sourceLot: LotId;
    material: Material;
    quantity: number;
    access: TransferAccess;
  },
): MaterialResult<ItemLot> {
  if (!isPositiveInt(input.quantity))
    return failure("invalid-positive-integer");
  if (input.source.id === input.destination.id)
    return failure("destination-mismatch");
  const sourceProblem = validateContainer(input.source);
  if (sourceProblem) return failure(sourceProblem);
  if (
    !destinationAccepts(input.source, input.material) ||
    !destinationAccepts(input.destination, input.material)
  )
    return failure("destination-mismatch");
  const source = lotById(state, input.sourceLot);
  if (
    !source ||
    source.material !== input.material ||
    source.location.kind !== "container" ||
    source.location.container !== input.source.id
  )
    return failure("source-ineligible");
  if (availableQuantity(state, source.id) < input.quantity)
    return failure("source-insufficient");
  if (!input.access.sourceReachable) return failure("source-unreachable");
  if (!input.access.destinationReachableWithPayload)
    return failure("destination-unreachable");
  const capacityProblem = admitContainerCapacity(state, {
    destination: input.destination,
    material: input.material,
    quantity: input.quantity as PositiveInt,
  });
  if (capacityProblem) return failure(capacityProblem);
  let allocation: MaterialResult<{ id: LotId; nextLotId: number }> | null =
    null;
  if (source.quantity !== input.quantity) {
    allocation = allocateLotId(state);
    if (!allocation.ok) return allocation;
  }
  if (allocation) {
    source.quantity = (source.quantity - input.quantity) as PositiveInt;
    const moved: ItemLot = {
      id: allocation.value.id,
      material: input.material,
      quantity: input.quantity as PositiveInt,
      location: { kind: "container", container: input.destination.id },
    };
    state.lots.push(moved);
    state.nextLotId = allocation.value.nextLotId;
    return success(moved);
  }
  source.location = { kind: "container", container: input.destination.id };
  return success(source);
}

function heldUsePail(
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
  if (
    !transfer ||
    transfer.intent.kind !== "use" ||
    transfer.intent.operation !== use.id ||
    transfer.owner.kind !== "operation" ||
    transfer.owner.operation !== use.id ||
    transfer.phase.kind !== "carrying" ||
    transfer.phase.lot !== use.vessel
  )
    return failure("use-intent-required");
  const lot = lotById(state, use.vessel);
  const interior = lot && portableContainerInterior(lot);
  if (
    !lot ||
    !interior ||
    lot.location.kind !== "hand" ||
    lot.location.actor !== transfer.actor
  )
    return failure("vessel-invalid");
  return success({ lot, interior });
}

export function drawPailWater(
  state: MaterialsState,
  input: {
    operation: string;
    source: ContainerSpec;
    sourceLot: LotId;
    quantity: number;
    access: TransferAccess;
  },
): MaterialResult<ItemLot> {
  const held = heldUsePail(state, input.operation);
  if (!held.ok) return held;
  return moveContainerPortion(state, {
    source: input.source,
    destination: held.value.interior,
    sourceLot: input.sourceLot,
    material: "water",
    quantity: input.quantity,
    access: input.access,
  });
}

export function pourPailWater(
  state: MaterialsState,
  input: {
    operation: string;
    destination: ContainerSpec;
    sourceLot: LotId;
    quantity: number;
    access: TransferAccess;
  },
): MaterialResult<ItemLot> {
  const held = heldUsePail(state, input.operation);
  if (!held.ok) return held;
  return moveContainerPortion(state, {
    source: held.value.interior,
    destination: input.destination,
    sourceLot: input.sourceLot,
    material: "water",
    quantity: input.quantity,
    access: input.access,
  });
}

/** A checked consumer may settle an exact held portion into an immutable receipt. */
export function sinkHeldPortion(
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
  const held = heldUsePail(state, input.operation);
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
export function sinkHeldOperationPortion(
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
  if (
    !use ||
    use.lot !== input.lot ||
    use.quantity !== input.quantity ||
    !transfer ||
    transfer.intent.kind !== "use" ||
    transfer.phase.kind !== "carrying" ||
    transfer.phase.lot !== input.lot ||
    !lot ||
    lot.material !== input.material ||
    lot.quantity !== input.quantity ||
    lot.location.kind !== "hand" ||
    lot.location.actor !== transfer.actor ||
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

/** Fully resolved by a content owner; the material kernel knows no recipe roles. */
export type ResolvedRecipePlan = {
  id: string;
  definition: RecipeId;
  station: ContainerId;
  consumed: readonly {
    role: string;
    lot: LotId;
    material: Material;
    quantity: PositiveInt;
  }[];
  retained: readonly {
    role: string;
    lot: LotId;
    material: Material;
    quantity: PositiveInt;
  }[];
  promises: readonly {
    role: string;
    material: Material;
    quantity: PositiveInt;
    destination: ContainerSpec;
  }[];
};

/** Definition-resolved output destinations; the kernel only checks this plan. */
export type ResolvedRecipeSettlement = {
  id: string;
  definition: RecipeId;
  station: ContainerId;
  retained: ResolvedRecipePlan["retained"];
  outputs: readonly {
    role: string;
    material: Material;
    quantity: PositiveInt;
    destination: ContainerSpec;
  }[];
};

/** A definition-resolved serving from one settled physical output destination. */
/** A recipe owner resolves one exact settled-output portion before mutation. */
export type ResolvedRecipeOutputConsumption = {
  id: string;
  transformation: string;
  role: string;
  material: Material;
  quantity: PositiveInt;
  sourceLot: LotId;
  destination: ContainerSpec;
};

function recipePlanOwnerAvailable(
  state: MaterialsState,
  input: ResolvedRecipePlan,
): MaterialResult<void> {
  if (
    state.bindings.some(
      (binding) =>
        binding.id === input.id ||
        (binding.kind === "recipe" && binding.station === input.station),
    )
  )
    return failure("owner-busy");
  if (
    new Set(input.retained.map((entry) => entry.role)).size !==
      input.retained.length ||
    new Set(input.promises.map((entry) => entry.role)).size !==
      input.promises.length
  )
    return failure("source-ineligible");
  return success(undefined);
}

function consumedPortionsAvailable(
  state: MaterialsState,
  consumed: ResolvedRecipePlan["consumed"],
): MaterialResult<void> {
  const consumedByLot = new Map<LotId, number>();
  for (const portion of consumed) {
    const lot = lotById(state, portion.lot);
    if (
      !lot ||
      lot.material !== portion.material ||
      !isPositiveInt(portion.quantity)
    )
      return failure("source-insufficient");
    consumedByLot.set(
      portion.lot,
      (consumedByLot.get(portion.lot) ?? 0) + portion.quantity,
    );
  }
  for (const [lotId, quantity] of consumedByLot) {
    if (availableQuantity(state, lotId) < quantity)
      return failure("source-insufficient");
  }
  return success(undefined);
}

function retainedLotsExclusive(
  state: MaterialsState,
  retainedLots: ResolvedRecipePlan["retained"],
): MaterialResult<void> {
  for (const retained of retainedLots) {
    const lot = lotById(state, retained.lot);
    if (
      !lot ||
      lot.material !== retained.material ||
      lot.quantity !== retained.quantity ||
      bindingOwnsLot(state, retained.lot)
    )
      return failure("source-ineligible");
  }
  return success(undefined);
}

function recipePromisesFit(
  state: MaterialsState,
  promises: ResolvedRecipePlan["promises"],
): MaterialResult<void> {
  const promised = new Map<
    ContainerId,
    { destination: ContainerSpec; used: number }
  >();
  for (const promise of promises) {
    if (
      !isPositiveInt(promise.quantity) ||
      !destinationAccepts(promise.destination, promise.material)
    )
      return failure("destination-mismatch");
    const existing = promised.get(promise.destination.id) ?? {
      destination: promise.destination,
      used: 0,
    };
    const bulk = bulkFor(promise.destination, promise.material);
    if (bulk === null) return failure("destination-mismatch");
    existing.used += promise.quantity * bulk;
    promised.set(promise.destination.id, existing);
  }
  for (const { destination, used } of promised.values()) {
    const incoming = incomingBulk(state, destination);
    if (!incoming.ok) return incoming;
    const occupied = containerBulk(state, destination);
    if (
      occupied +
        incoming.value +
        bindingPromiseQuantity(state, destination) +
        used >
      destination.capacity
    )
      return failure("destination-full");
  }
  return success(undefined);
}

/** A resolved plan uses the same checks as final mutation, without a promise. */
export function checkRecipePlan(
  state: MaterialsState,
  input: ResolvedRecipePlan,
): MaterialResult<void> {
  const owner = recipePlanOwnerAvailable(state, input);
  if (!owner.ok) return owner;
  const consumed = consumedPortionsAvailable(state, input.consumed);
  if (!consumed.ok) return consumed;
  const retained = retainedLotsExclusive(state, input.retained);
  if (!retained.ok) return retained;
  return recipePromisesFit(state, input.promises);
}

/** Atomic resolved-plan admission: a promise, never copied staging inventory. */
export function admitRecipePlan(
  state: MaterialsState,
  input: ResolvedRecipePlan,
): MaterialResult<Extract<MaterialBinding, { kind: "recipe" }>> {
  const checked = checkRecipePlan(state, input);
  if (!checked.ok) return checked;
  const binding: Extract<MaterialBinding, { kind: "recipe" }> = {
    kind: "recipe",
    id: input.id,
    definition: input.definition,
    station: input.station,
    consumed: input.consumed.map((portion) => ({ ...portion })),
    retained: input.retained.map((entry) => ({ ...entry })),
    promises: input.promises.map((entry) => ({
      ...entry,
      destination: entry.destination.id,
    })),
  };
  state.bindings.push(binding);
  return success(binding);
}

/** PREPARE's one joined transformation receipt; later stages consume this provenance. */
export function completeRecipePrepare(
  state: MaterialsState,
  id: string,
): MaterialResult<void> {
  const binding = state.bindings.find(
    (candidate): candidate is Extract<MaterialBinding, { kind: "recipe" }> =>
      candidate.kind === "recipe" && candidate.id === id,
  );
  if (!binding || state.transformations.some((entry) => entry.id === id))
    return failure("wrong-phase");
  const lots = binding.consumed.map((portion) => ({
    portion,
    lot: lotById(state, portion.lot),
  }));
  if (
    lots.some(
      ({ portion, lot }) =>
        !lot ||
        lot.material !== portion.material ||
        lot.quantity < portion.quantity,
    )
  )
    return failure("source-insufficient");
  for (const { portion, lot } of lots) {
    if (lot!.quantity === portion.quantity)
      state.lots.splice(state.lots.indexOf(lot!), 1);
    else lot!.quantity = (lot!.quantity - portion.quantity) as PositiveInt;
  }
  state.transformations.push({
    id,
    definition: binding.definition,
    inputs: binding.consumed.map((portion) => ({ ...portion })),
    settlement: null,
  });
  return success(undefined);
}

function sameRecipeEntries(
  left: readonly {
    role: string;
    lot: LotId;
    material: Material;
    quantity: PositiveInt;
  }[],
  right: readonly {
    role: string;
    lot: LotId;
    material: Material;
    quantity: PositiveInt;
  }[],
): boolean {
  const key = (entry: (typeof left)[number]) =>
    `${entry.role}\u0000${entry.lot}\u0000${entry.material}\u0000${entry.quantity}`;
  return (
    left.length === right.length &&
    [...left]
      .map(key)
      .sort()
      .every((entry, index) => entry === [...right].map(key).sort()[index])
  );
}

function sameRecipeOutputs(
  binding: Extract<MaterialBinding, { kind: "recipe" }>,
  outputs: ResolvedRecipeSettlement["outputs"],
): boolean {
  const key = (entry: {
    role: string;
    destination: ContainerId;
    material: Material;
    quantity: PositiveInt;
  }) =>
    `${entry.role}\u0000${entry.destination}\u0000${entry.material}\u0000${entry.quantity}`;
  const planned = outputs.map((entry) =>
    key({ ...entry, destination: entry.destination.id }),
  );
  const promised = binding.promises.map(key);
  return (
    planned.length === promised.length &&
    planned.sort().every((entry, index) => entry === promised.sort()[index])
  );
}

function recipePromiseBulkExcept(
  state: MaterialsState,
  container: ContainerSpec,
  except: string,
): number {
  return state.bindings.reduce(
    (total, binding) =>
      total +
      (binding.kind !== "recipe" || binding.id === except
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

function settlementOutputCapacity(
  state: MaterialsState,
  plan: ResolvedRecipeSettlement,
): MaterialResult<void> {
  const promised = new Map<
    ContainerId,
    { destination: ContainerSpec; bulk: number }
  >();
  for (const output of plan.outputs) {
    const unit = bulkFor(output.destination, output.material);
    if (unit === null) return failure("destination-mismatch");
    const entry = promised.get(output.destination.id) ?? {
      destination: output.destination,
      bulk: 0,
    };
    entry.bulk += output.quantity * unit;
    promised.set(output.destination.id, entry);
  }
  for (const { destination, bulk } of promised.values()) {
    const incoming = incomingBulk(state, destination);
    if (!incoming.ok) return incoming;
    if (
      containerBulk(state, destination) +
        incoming.value +
        recipePromiseBulkExcept(state, destination, plan.id) +
        bulk >
      destination.capacity
    )
      return failure("destination-full");
  }
  return success(undefined);
}

function allocateLotIds(
  state: MaterialsState,
  count: number,
): MaterialResult<{ ids: LotId[]; nextLotId: number }> {
  const ids = new Set(state.lots.map((lot) => lot.id));
  let next = state.nextLotId;
  const allocated: LotId[] = [];
  while (allocated.length < count) {
    if (
      !Number.isSafeInteger(next) ||
      next < 0 ||
      next === Number.MAX_SAFE_INTEGER
    )
      return failure("invalid-allocator");
    const id = `lot-${next}`;
    next++;
    if (ids.has(id)) continue;
    ids.add(id);
    allocated.push(id);
  }
  return success({ ids: allocated, nextLotId: next });
}

/** Atomically realizes a fully checked definition-owned output settlement. */
export function settleRecipePlan(
  state: MaterialsState,
  plan: ResolvedRecipeSettlement,
): MaterialResult<void> {
  const binding = state.bindings.find(
    (candidate): candidate is Extract<MaterialBinding, { kind: "recipe" }> =>
      candidate.kind === "recipe" && candidate.id === plan.id,
  );
  const transformation = state.transformations.find(
    (entry) => entry.id === plan.id,
  );
  if (
    !binding ||
    !transformation ||
    transformation.settlement !== null ||
    binding.definition !== plan.definition ||
    binding.station !== plan.station ||
    !sameRecipeEntries(binding.retained, plan.retained) ||
    !sameRecipeOutputs(binding, plan.outputs)
  )
    return failure("wrong-phase");
  if (
    plan.retained.some((entry) => {
      const lot = lotById(state, entry.lot);
      return (
        !lot ||
        lot.material !== entry.material ||
        lot.quantity !== entry.quantity ||
        lot.location.kind === "hand"
      );
    })
  )
    return failure("source-ineligible");
  const capacity = settlementOutputCapacity(state, plan);
  if (!capacity.ok) return capacity;
  const allocation = allocateLotIds(state, plan.outputs.length);
  if (!allocation.ok) return allocation;
  const settled = {
    station: plan.station,
    retained: plan.retained.map((entry) => ({ ...entry })),
    outputs: plan.outputs.map((entry) => ({
      role: entry.role,
      destination: entry.destination.id,
      material: entry.material,
      quantity: entry.quantity,
    })),
  };
  state.lots.push(
    ...plan.outputs.map((output, index) => ({
      id: allocation.value.ids[index],
      material: output.material,
      quantity: output.quantity,
      location: {
        kind: "container" as const,
        container: output.destination.id,
      },
    })),
  );
  state.nextLotId = allocation.value.nextLotId;
  state.transformations.splice(
    state.transformations.indexOf(transformation),
    1,
    {
      ...transformation,
      settlement: settled,
    },
  );
  state.bindings = state.bindings.filter((candidate) => candidate !== binding);
  return success(undefined);
}

/** Atomically sinks one exact settled output portion and leaves a durable receipt. */
export function consumeRecipeOutput(
  state: MaterialsState,
  consumption: ResolvedRecipeOutputConsumption,
): MaterialResult<void> {
  if (state.consumptions.some((entry) => entry.id === consumption.id))
    return failure("owner-busy");
  const transformation = state.transformations.find(
    (entry) => entry.id === consumption.transformation,
  );
  const output = transformation?.settlement?.outputs.find(
    (entry) =>
      entry.role === consumption.role &&
      entry.material === consumption.material &&
      entry.destination === consumption.destination.id,
  );
  if (!transformation?.settlement || !output) return failure("wrong-phase");
  const consumed = state.consumptions.reduce(
    (total, entry) =>
      total +
      (entry.transformation === consumption.transformation &&
      entry.role === consumption.role
        ? entry.quantity
        : 0),
    0,
  );
  if (consumed + consumption.quantity > output.quantity)
    return failure("source-insufficient");
  const lot = lotById(state, consumption.sourceLot);
  if (
    !lot ||
    lot.material !== consumption.material ||
    lot.location.kind !== "container" ||
    lot.location.container !== consumption.destination.id ||
    availableQuantity(state, lot.id) < consumption.quantity
  )
    return failure("source-insufficient");
  if (lot.quantity === consumption.quantity)
    state.lots = state.lots.filter((entry) => entry !== lot);
  else lot.quantity = (lot.quantity - consumption.quantity) as PositiveInt;
  state.consumptions.push({
    id: consumption.id,
    transformation: consumption.transformation,
    role: consumption.role,
    material: consumption.material,
    quantity: consumption.quantity,
  });
  return success(undefined);
}

/** Pre-PREPARE cancellation releases only the promise; staged physical lots stay put. */
export function releaseUnpreparedRecipeBinding(
  state: MaterialsState,
  id: string,
): MaterialResult<void> {
  const binding = state.bindings.find(
    (candidate): candidate is Extract<MaterialBinding, { kind: "recipe" }> =>
      candidate.kind === "recipe" && candidate.id === id,
  );
  if (!binding || state.transformations.some((entry) => entry.id === id))
    return failure("wrong-phase");
  state.bindings = state.bindings.filter((candidate) => candidate !== binding);
  return success(undefined);
}

export type InterruptResult =
  | { kind: "none" }
  | { kind: "released"; transfer: TransferId; owner: Transfer["owner"] }
  | {
      kind: "dropped";
      transfer: TransferId;
      lot: LotId;
      owner: Transfer["owner"];
    };

export function retireOperationPail(
  state: MaterialsState,
  operation: string,
): void {
  state.bindings = state.bindings.filter((binding) => binding.id !== operation);
}

function interruptExactTransfer(
  state: MaterialsState,
  transfer: Transfer | undefined,
  drop?: LegalDrop,
): MaterialResult<InterruptResult> {
  if (!transfer) return success({ kind: "none" });
  if (transfer.phase.kind === "reserved") {
    state.transfers.splice(state.transfers.indexOf(transfer), 1);
    return success({
      kind: "released",
      transfer: transfer.id,
      owner: transfer.owner,
    });
  }
  const held = lotById(state, transfer.phase.lot);
  if (
    !held ||
    held.location.kind !== "hand" ||
    held.location.actor !== transfer.actor ||
    held.quantity !== transfer.request.quantity
  )
    return failure("held-lot-invalid");
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

export function interruptOperationPail(
  state: MaterialsState,
  operation: string,
  drop?: LegalDrop,
): MaterialResult<InterruptResult> {
  return interruptExactTransfer(
    state,
    state.transfers.find(
      (transfer) =>
        transfer.owner.kind === "operation" &&
        transfer.owner.operation === operation,
    ),
    drop,
  );
}

export function interruptTransfer(
  state: MaterialsState,
  actor: ActorId,
  drop?: LegalDrop,
): MaterialResult<InterruptResult> {
  return interruptExactTransfer(state, transferForActor(state, actor), drop);
}

export type ReleasedContainer = {
  contents: readonly LotId[];
  released: readonly TransferId[];
  dropped: readonly LotId[];
  owners: readonly Transfer["owner"][];
};

export function releaseContainer(
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
    if (transfer.phase.kind === "reserved") continue;
    const lot = lotById(state, transfer.phase.lot);
    if (
      !lot ||
      lot.location.kind !== "hand" ||
      lot.location.actor !== transfer.actor ||
      lot.quantity !== transfer.request.quantity
    )
      return failure("held-lot-invalid");
    const drop = input.carriedDrops[transfer.actor];
    if (!drop?.legal) return failure("illegal-drop");
    carried.push({ transfer, lot, drop });
  }

  for (const lot of contents)
    lot.location = groundLocation(input.contentsDrop.cell);
  for (const { lot, drop } of carried) lot.location = groundLocation(drop.cell);
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

export function embedConstruction(
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
  if (incomingQuantity(state, container.id) > 0)
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

export function salvageConstruction(
  state: MaterialsState,
  container: ContainerSpec,
  salvageQuantity: number,
  drop: LegalDrop,
): MaterialResult<{ salvage: ItemLot | null; consumed: number }> {
  // The consumed ledger is currently wood-only construction accounting.
  if (!destinationAccepts(container, "wood"))
    return failure("destination-mismatch");
  const entry = state.embedded.find(
    (candidate) =>
      candidate.container === container.id && candidate.material === "wood",
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
  const nextConsumed = checkedAdd(state.consumedWood, consumed);
  if (nextConsumed === null) return failure("invalid-positive-integer");
  let allocation: MaterialResult<{ id: LotId; nextLotId: number }> | null =
    null;
  if (salvageQuantity > 0) {
    allocation = allocateLotId(state);
    if (!allocation.ok) return allocation;
  }

  state.embedded.splice(state.embedded.indexOf(entry), 1);
  state.consumedWood = nextConsumed;
  if (!allocation) return success({ salvage: null, consumed });
  const salvage: ItemLot = {
    id: allocation.value.id,
    material: "wood",
    quantity: salvageQuantity as PositiveInt,
    location: groundLocation(drop.cell),
  };
  state.lots.push(salvage);
  state.nextLotId = allocation.value.nextLotId;
  return success({ salvage, consumed });
}
