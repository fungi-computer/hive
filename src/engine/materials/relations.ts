import type { createMaterialOwner } from "./owner.ts";
import type {
  ContainerSpec,
  MaterialsState,
  MaterialBinding,
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

/** Physical claims and receipts only. Consumer definitions validate authored recipe
 * roles/effects and their original production budgets outside this module. */
function validateBindings<M extends string>(
  state: MaterialsState<M>,
  owner: Owner<M>,
  endpoints: Map<string, ContainerSpec<M>>,
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
      const lotId =
        binding.kind === "vessel-use" ? binding.vessel : binding.lot;
      const lot = state.lots.find((entry) => entry.id === lotId);
      if (
        !lot ||
        (binding.kind === "vessel-use"
          ? !owner.portableContainerInterior(lot)
          : binding.quantity > lot.quantity)
      )
        throw new Error("invalid bound lot");
      continue;
    }
    if (!endpoints.has(binding.station) || stations.has(binding.station))
      throw new Error("invalid recipe station");
    stations.add(binding.station);
    unique(binding.retained, (entry) => entry.role, "retained role");
    unique(binding.promises, (entry) => entry.role, "promised role");
    const transformation = transformations.get(binding.id);
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

export function validateMaterialRelations<M extends string>(
  state: MaterialsState<M>,
  containers: readonly ContainerSpec<M>[],
  owner: Owner<M>,
): void {
  const endpoints = unique(containers, (entry) => entry.id, "container");
  const lots = unique(state.lots, (entry) => entry.id, "lot");
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
  const bindings = validateBindings(state, owner, endpoints);
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
    if (lot.location.kind !== "hand") continue;
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
  for (const endpoint of endpoints.values()) {
    const problem = owner.containerCapacityProblem(state, endpoint);
    if (problem && problem !== "container-embedded")
      throw new Error(`invalid capacity: ${problem}`);
  }
}
