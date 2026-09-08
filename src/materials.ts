import type {
  ActorId,
  Cell,
  ContainerId,
  EmbeddedMaterial,
  ItemLot,
  JobId,
  LotId,
  Material,
  MaterialsState,
  PositiveInt,
  SourcePolicy,
  Transfer,
  TransferId,
  TransferRequest,
} from "./model.ts";

/** A resolved destination definition.  The transfer kernel only sees its
 * accepted materials and promised capacity; site/shelf rules stay with callers. */
export type ContainerSpec = {
  id: ContainerId;
  capacity: PositiveInt;
  accepts: readonly Material[];
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
  | "duplicate-transfer"
  | "lot-not-found"
  | "transfer-not-found"
  | "source-not-ground"
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
  | "invalid-salvage";

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

function lotById(state: MaterialsState, id: LotId): ItemLot | undefined {
  return state.lots.find((lot) => lot.id === id);
}

function transferById(
  state: MaterialsState,
  id: TransferId,
): Transfer | undefined {
  return state.transfers.find((transfer) => transfer.id === id);
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
      (transfer.id !== except && transfer.request.destination === container
        ? transfer.request.quantity
        : 0),
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
  if (!source || source.location.kind !== "ground") return 0;
  return Math.max(0, source.quantity - reservedQuantity(state, source.id));
}

export type AvailablePortion = { lot: LotId; quantity: number };

export function availablePortions(
  state: MaterialsState,
  source: SourcePolicy,
): readonly AvailablePortion[] {
  if (source.kind === "exact-lot") {
    const quantity = availableQuantity(state, source.lot);
    return quantity > 0 ? [{ lot: source.lot, quantity }] : [];
  }
  return state.lots.flatMap((lot) => {
    if (lot.material !== source.material || lot.location.kind !== "ground")
      return [];
    const quantity = availableQuantity(state, lot.id);
    return quantity > 0 ? [{ lot: lot.id, quantity }] : [];
  });
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
    consumed: material === "wood" ? state.consumedWood : 0,
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

function sourceMatches(
  lot: ItemLot,
  policy: SourcePolicy,
  selected: LotId,
): boolean {
  return policy.kind === "exact-lot"
    ? policy.lot === selected
    : lot.material === policy.material;
}

function validateContainer(spec: ContainerSpec): MaterialFailure | null {
  if (!isPositiveInt(spec.capacity)) return "invalid-positive-integer";
  if (!spec.accepts.length) return "destination-mismatch";
  return null;
}

function destinationAccepts(spec: ContainerSpec, material: Material): boolean {
  return spec.accepts.includes(material);
}

function requestAllowsLot(request: TransferRequest, lot: ItemLot): boolean {
  return (
    request.quantityPolicy === "portion" || request.quantity === lot.quantity
  );
}

export function reserveTransfer(
  state: MaterialsState,
  input: {
    id: TransferId;
    actor: ActorId;
    owner: Transfer["owner"];
    request: TransferRequest;
    sourceLot: LotId;
    destination: ContainerSpec;
    access: TransferAccess;
  },
): MaterialResult<Transfer> {
  if (!isPositiveInt(input.request.quantity))
    return failure("invalid-positive-integer");
  if (
    input.request.quantityPolicy !== "whole-lot" &&
    input.request.quantityPolicy !== "portion"
  )
    return failure("source-ineligible");
  const containerProblem = validateContainer(input.destination);
  if (containerProblem) return failure(containerProblem);
  if (state.transfers.some((transfer) => transfer.id === input.id))
    return failure("duplicate-transfer");
  if (
    state.transfers.some(
      (transfer) =>
        transfer.owner.job === input.owner.job &&
        transfer.owner.step === input.owner.step,
    )
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
  if (input.request.destination !== input.destination.id)
    return failure("destination-mismatch");
  // Job step identity is exclusive ownership only. Its admission policy was
  // checked by the consumer before it resolved this request and container.
  const source = lotById(state, input.sourceLot);
  if (!source) return failure("lot-not-found");
  if (source.location.kind !== "ground") return failure("source-not-ground");
  if (!isPositiveInt(source.quantity))
    return failure("invalid-positive-integer");
  if (!sourceMatches(source, input.request.source, input.sourceLot))
    return failure("source-ineligible");
  if (!requestAllowsLot(input.request, source))
    return failure("source-ineligible");
  if (!destinationAccepts(input.destination, source.material))
    return failure("destination-mismatch");
  if (embeddedQuantity(state, input.destination.id) > 0)
    return failure("container-embedded");
  if (availableQuantity(state, source.id) < input.request.quantity)
    return failure("source-insufficient");
  if (!input.access.sourceReachable) return failure("source-unreachable");
  if (!input.access.destinationReachableWithPayload)
    return failure("destination-unreachable");
  const occupied = containerQuantity(state, input.destination.id);
  const promised = incomingQuantity(state, input.destination.id);
  const used = checkedAdd(occupied, promised);
  const after = used === null ? null : checkedAdd(used, input.request.quantity);
  if (after === null || after > input.destination.capacity)
    return failure("destination-full");
  const transfer: Transfer = {
    id: input.id,
    actor: input.actor,
    owner: { ...input.owner },
    request: {
      source: { ...input.request.source },
      quantityPolicy: input.request.quantityPolicy,
      quantity: input.request.quantity,
      destination: input.request.destination,
    },
    phase: {
      kind: "reserved",
      sourceLot: source.id,
      quantity: input.request.quantity,
    },
  };
  state.transfers.push(transfer);
  return success(transfer);
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
  if (source.location.kind !== "ground") return failure("source-not-ground");
  if (!isPositiveInt(source.quantity))
    return failure("invalid-positive-integer");
  if (!sourceMatches(source, transfer.request.source, source.id))
    return failure("source-ineligible");
  if (!requestAllowsLot(transfer.request, source))
    return failure("source-ineligible");
  if (source.quantity < transfer.phase.quantity)
    return failure("source-insufficient");
  if (!access.sourceReachable) return failure("source-unreachable");
  if (!access.destinationReachableWithPayload)
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
  return success(carried);
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
  const containerProblem = validateContainer(destination);
  if (containerProblem) return failure(containerProblem);
  if (
    transfer.request.destination !== destination.id ||
    transfer.request.quantity > destination.capacity
  )
    return failure("destination-mismatch");
  if (embeddedQuantity(state, destination.id) > 0)
    return failure("container-embedded");
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
  const occupied = containerQuantity(state, destination.id);
  const otherIncoming = incomingQuantity(state, destination.id, transfer.id);
  const used = checkedAdd(occupied, otherIncoming);
  const after = used === null ? null : checkedAdd(used, held.quantity);
  if (after === null || after > destination.capacity)
    return failure("destination-full");

  held.location = { kind: "container", container: destination.id };
  state.transfers.splice(state.transfers.indexOf(transfer), 1);
  return success(held);
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

export function interruptTransfer(
  state: MaterialsState,
  actor: ActorId,
  drop?: LegalDrop,
): MaterialResult<InterruptResult> {
  const transfer = transferForActor(state, actor);
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
    held.location.actor !== actor ||
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
    (transfer) => transfer.request.destination === container.id,
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
): MaterialResult<EmbeddedMaterial> {
  const containerProblem = validateContainer(container);
  if (containerProblem) return failure(containerProblem);
  if (!destinationAccepts(container, material))
    return failure("destination-mismatch");
  if (incomingQuantity(state, container.id) > 0)
    return failure("container-has-incoming");
  if (state.embedded.some((entry) => entry.container === container.id))
    return failure("embedding-exists");
  const contents = [...containerContents(state, container.id)];
  if (
    contents.some((lot) => lot.material !== material) ||
    containerQuantity(state, container.id, material) !== container.capacity
  )
    return failure("container-incomplete");
  const entry: EmbeddedMaterial = {
    container: container.id,
    material,
    quantity: container.capacity,
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
