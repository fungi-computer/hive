import type { createMaterialOwner } from "./owner.ts";
import type {
  ContainerSpec,
  MaterialsState,
  MaterialBinding,
  ItemLot,
  Transfer,
  RecipeTransformation,
} from "./types.ts";

type Owner<M extends string> = ReturnType<typeof createMaterialOwner<M>>;
function unique<T>(
  entries: readonly T[],
  key: (entry: T) => string,
  label: string,
): Map<string, T> {
  const result = new Map(entries.map((entry) => [key(entry), entry]));
  if (result.size !== entries.length) throw new Error(`duplicate ${label}`);
  return result;
}
function samePortions<M extends string>(
  a: readonly { role: string; lot: string; material: M; quantity: number }[],
  b: typeof a,
): boolean {
  const keys = (values: typeof a) =>
    values
      .map((entry) =>
        JSON.stringify([entry.role, entry.lot, entry.material, entry.quantity]),
      )
      .sort();
  return JSON.stringify(keys(a)) === JSON.stringify(keys(b));
}

type RecipeBinding<M extends string> = Extract<
  MaterialBinding<M>,
  { kind: "recipe" }
>;

/** A use binds either a real portable vessel or an existing ordinary portion. */
function validateUseBinding<M extends string>(
  state: MaterialsState<M>,
  owner: Owner<M>,
  binding: Exclude<MaterialBinding<M>, { kind: "recipe" }>,
): void {
  const lotId = binding.kind === "vessel-use" ? binding.vessel : binding.lot;
  const lot = state.lots.find((entry) => entry.id === lotId);
  if (
    !lot ||
    (binding.kind === "vessel-use"
      ? !owner.portableContainerInterior(lot)
      : binding.quantity > lot.quantity)
  )
    throw new Error("invalid bound lot");
}

/** Before preparation inputs are live; afterwards their exact receipt owns them.
 * Retained lots and promised endpoints must remain live in either phase. */
function validateRecipeBinding<M extends string>(
  state: MaterialsState<M>,
  binding: RecipeBinding<M>,
  transformation: RecipeTransformation<M> | undefined,
  endpoints: ReadonlyMap<string, ContainerSpec<M>>,
): void {
  unique(binding.retained, (entry) => entry.role, "retained role");
  unique(binding.promises, (entry) => entry.role, "promised role");
  if (
    transformation &&
    (transformation.definition !== binding.definition ||
      transformation.settlement ||
      !samePortions(transformation.inputs, binding.consumed))
  )
    throw new Error("invalid active transformation");
  for (const portion of transformation ? [] : binding.consumed) {
    const lot = state.lots.find((entry) => entry.id === portion.lot);
    if (
      !lot ||
      lot.material !== portion.material ||
      lot.quantity < portion.quantity
    )
      throw new Error("invalid recipe input");
  }
  for (const retained of binding.retained) {
    const lot = state.lots.find((entry) => entry.id === retained.lot);
    if (
      !lot ||
      lot.material !== retained.material ||
      lot.quantity !== retained.quantity
    )
      throw new Error("invalid retained lot");
  }
  for (const promise of binding.promises) {
    const endpoint = endpoints.get(promise.destination);
    if (!endpoint || !endpoint.accepts.includes(promise.material))
      throw new Error("invalid promised destination");
  }
}

/** Active transformations need their recipe binding; settled ones have released it. */
function validateTransformationLifecycle<M extends string>(
  state: MaterialsState<M>,
  bindings: ReadonlyMap<string, MaterialBinding<M>>,
): void {
  for (const transformation of state.transformations) {
    const binding = bindings.get(transformation.id);
    if (transformation.settlement === null) {
      if (binding?.kind !== "recipe")
        throw new Error("unowned active transformation");
    } else {
      if (binding) throw new Error("settled transformation retains binding");
      unique(
        transformation.settlement.outputs,
        (entry) => entry.role,
        "settled output role",
      );
    }
  }
}

/** All consumption receipts for a settled role share its finite output budget. */
function validateOutputConsumptions<M extends string>(
  state: MaterialsState<M>,
  transformations: ReadonlyMap<string, RecipeTransformation<M>>,
): void {
  const consumed = new Map<string, number>();
  for (const receipt of state.consumptions) {
    const transformation = transformations.get(receipt.transformation);
    const output = transformation?.settlement?.outputs.find(
      (entry) =>
        entry.role === receipt.role && entry.material === receipt.material,
    );
    const key = JSON.stringify([receipt.transformation, receipt.role]);
    const total = (consumed.get(key) ?? 0) + receipt.quantity;
    if (!output || total > output.quantity)
      throw new Error("invalid output consumption");
    consumed.set(key, total);
  }
}

/** Physical claims and receipts only; authored roles/effects remain consumer facts. */
function validateBindings<M extends string>(
  state: MaterialsState<M>,
  owner: Owner<M>,
  endpoints: ReadonlyMap<string, ContainerSpec<M>>,
) {
  const bindings = unique(
    state.bindings,
    (entry) => entry.id,
    "material binding",
  );
  const transformations = unique(
    state.transformations,
    (entry) => entry.id,
    "transformation",
  );
  unique(state.sinks, (entry) => entry.id, "sink receipt");
  unique(state.consumptions, (entry) => entry.id, "consumption receipt");
  const stations = new Set<string>();
  for (const binding of state.bindings) {
    if (binding.kind !== "recipe") {
      validateUseBinding(state, owner, binding);
      continue;
    }
    if (!endpoints.has(binding.station) || stations.has(binding.station))
      throw new Error("invalid recipe station");
    stations.add(binding.station);
    validateRecipeBinding(
      state,
      binding,
      transformations.get(binding.id),
      endpoints,
    );
  }
  validateTransformationLifecycle(state, bindings);
  validateOutputConsumptions(state, transformations);
  return bindings;
}

function bindingQuantity<M extends string>(
  binding: MaterialBinding<M>,
  lot: string,
): number {
  if (binding.kind === "vessel-use") return binding.vessel === lot ? 1 : 0;
  if (binding.kind === "operation-use")
    return binding.lot === lot ? binding.quantity : 0;
  return binding.retained.reduce(
    (sum, entry) => sum + (entry.lot === lot ? entry.quantity : 0),
    0,
  );
}

function resolveEndpoints<M extends string>(
  state: MaterialsState<M>,
  containers: readonly ContainerSpec<M>[],
  owner: Owner<M>,
) {
  const endpoints = unique(containers, (entry) => entry.id, "container");
  unique(state.lots, (entry) => entry.id, "lot");
  for (const lot of state.lots) {
    const problem = owner.lotProblem(lot);
    if (problem) throw new Error(`invalid lot: ${problem}`);
    const interior = owner.portableContainerInterior(lot);
    if (interior) {
      const supplied = endpoints.get(interior.id);
      if (supplied && JSON.stringify(supplied) !== JSON.stringify(interior))
        throw new Error("conflicting portable interior");
      endpoints.set(interior.id, interior);
    }
  }
  return endpoints;
}

/** Delivery needs an accepted endpoint; a use must join its exact ordinary claim. */
function validateTransferIntent<M extends string>(
  transfer: Transfer<M>,
  bindings: ReadonlyMap<string, MaterialBinding<M>>,
  endpoints: ReadonlyMap<string, ContainerSpec<M>>,
): void {
  if (transfer.intent.kind === "deliver") {
    const endpoint = endpoints.get(transfer.intent.destination);
    if (
      transfer.owner.kind !== "job" ||
      !endpoint ||
      !endpoint.accepts.includes(transfer.resolvedMaterial)
    )
      throw new Error("missing or incompatible destination");
  } else {
    const binding = bindings.get(transfer.intent.operation);
    const lotId =
      transfer.phase.kind === "reserved"
        ? transfer.phase.sourceLot
        : transfer.phase.lot;
    if (
      transfer.owner.kind !== "operation" ||
      transfer.owner.operation !== transfer.intent.operation ||
      !binding ||
      binding.kind === "recipe" ||
      bindingQuantity(binding, lotId) !== transfer.request.quantity
    )
      throw new Error("invalid use custody");
  }
}

/** Validate each transfer before accumulating its non-overlapping reservation.
 * Use reservations already belong to their binding and must not count twice. */
function validateTransfers<M extends string>(
  state: MaterialsState<M>,
  owner: Owner<M>,
  bindings: ReadonlyMap<string, MaterialBinding<M>>,
  endpoints: ReadonlyMap<string, ContainerSpec<M>>,
): Map<string, number> {
  unique(state.transfers, (entry) => entry.id, "transfer");
  const actors = new Set<string>(),
    owners = new Set<string>();
  const reservations = new Map<string, number>();
  for (const transfer of state.transfers) {
    const ownerKey =
      transfer.owner.kind === "job"
        ? JSON.stringify(["job", transfer.owner.job, transfer.owner.step])
        : JSON.stringify(["operation", transfer.owner.operation]);
    if (actors.has(transfer.actor) || owners.has(ownerKey))
      throw new Error("duplicate custody");
    actors.add(transfer.actor);
    owners.add(ownerKey);
    const problem = owner.transferPhaseProblem(state, transfer);
    if (problem) throw new Error(`invalid transfer phase: ${problem}`);
    validateTransferIntent(transfer, bindings, endpoints);
    if (transfer.phase.kind === "reserved") {
      const overlap =
        transfer.intent.kind === "use" ? transfer.phase.quantity : 0;
      reservations.set(
        transfer.phase.sourceLot,
        (reservations.get(transfer.phase.sourceLot) ?? 0) +
          transfer.phase.quantity -
          overlap,
      );
    }
  }
  return reservations;
}

/** A hand lot is owned by its carrying transfer or one durable use claim. */
function validateHandLot<M extends string>(
  state: MaterialsState<M>,
  lot: ItemLot<M>,
  handActors: Set<string>,
): void {
  if (lot.location.kind !== "hand") return;
  if (handActors.has(lot.location.actor))
    throw new Error("actor holds multiple lots");
  handActors.add(lot.location.actor);
  const custody = state.transfers.filter(
    (entry) => entry.phase.kind === "carrying" && entry.phase.lot === lot.id,
  );
  const claims = state.bindings.filter(
    (entry) => bindingQuantity(entry, lot.id) > 0,
  );
  if (custody.length === 0) {
    if (
      claims.length !== 1 ||
      bindingQuantity(claims[0], lot.id) !== lot.quantity
    )
      throw new Error("orphan hand lot");
  } else if (
    claims.some(
      (claim) =>
        custody[0].intent.kind !== "use" ||
        custody[0].intent.operation !== claim.id,
    )
  ) {
    throw new Error("conflicting hand custody");
  }
}

/** Preserve per-lot validation order: aggregate claims, placement, then hand custody. */
function validateLotCustody<M extends string>(
  state: MaterialsState<M>,
  owner: Owner<M>,
  endpoints: ReadonlyMap<string, ContainerSpec<M>>,
  reservations: ReadonlyMap<string, number>,
): void {
  const handActors = new Set<string>();
  for (const lot of state.lots) {
    if (
      (reservations.get(lot.id) ?? 0) +
        owner.internal.boundQuantity(state, lot.id) >
      lot.quantity
    )
      throw new Error("source overbooked");
    if (lot.location.kind === "container") {
      const endpoint = endpoints.get(lot.location.container);
      if (!endpoint || !endpoint.accepts.includes(lot.material))
        throw new Error("unknown or incompatible container");
    }
    validateHandLot(state, lot, handActors);
  }
}

/** Embedded stock cannot coexist with live inventory or a promise to refill it. */
function validateEmbeddings<M extends string>(state: MaterialsState<M>): void {
  unique(state.embedded, (entry) => entry.container, "embedding");
  for (const embedded of state.embedded) {
    if (
      state.bindings.some(
        (binding) =>
          binding.kind === "recipe" &&
          binding.promises.some(
            (promise) => promise.destination === embedded.container,
          ),
      ) ||
      state.lots.some(
        (lot) =>
          lot.location.kind === "container" &&
          lot.location.container === embedded.container,
      ) ||
      state.transfers.some(
        (transfer) =>
          transfer.intent.kind === "deliver" &&
          transfer.intent.destination === embedded.container,
      )
    )
      throw new Error("embedded container still has inventory");
  }
}

function validateCapacity<M extends string>(
  state: MaterialsState<M>,
  owner: Owner<M>,
  endpoints: ReadonlyMap<string, ContainerSpec<M>>,
): void {
  for (const endpoint of endpoints.values()) {
    const problem = owner.containerCapacityProblem(state, endpoint);
    if (problem && problem !== "container-embedded")
      throw new Error(`invalid capacity: ${problem}`);
  }
}

/** Restore follows the same phase/capacity owners as mutation, in stable error order. */
export function validateMaterialRelations<M extends string>(
  state: MaterialsState<M>,
  containers: readonly ContainerSpec<M>[],
  owner: Owner<M>,
): void {
  const endpoints = resolveEndpoints(state, containers, owner);
  const bindings = validateBindings(state, owner, endpoints);
  const reservations = validateTransfers(state, owner, bindings, endpoints);
  validateLotCustody(state, owner, endpoints, reservations);
  validateEmbeddings(state);
  validateCapacity(state, owner, endpoints);
}
