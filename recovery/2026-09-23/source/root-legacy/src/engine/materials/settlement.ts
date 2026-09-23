import type * as T from "./types.ts";
import type { createMaterialOwner } from "./owner.ts";
export function createRecipeSettlements<M extends string>(
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
    lotById,
    embeddedQuantity,
    destinationAccepts,
    bulkFor,
    incomingBulk,
    availableQuantity,
    containerBulk,
    bindingPromiseQuantity,
  } = owner.internal;
  type ResolvedRecipePlan = {
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
  type ResolvedRecipeSettlement = {
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
  type ResolvedRecipeOutputConsumption = {
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
      state.transformations.some((entry) => entry.id === input.id) ||
      state.bindings.some(
        (binding) =>
          binding.id === input.id ||
          (binding.kind === "recipe" && binding.station === input.station),
      )
    )
      return failure("owner-busy");
    if (
      input.retained.some((entry) =>
        input.consumed.some((portion) => portion.lot === entry.lot),
      ) ||
      new Set(input.retained.map((entry) => entry.role)).size !==
        input.retained.length ||
      new Set(input.retained.map((entry) => entry.lot)).size !==
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
        availableQuantity(state, retained.lot) !== retained.quantity
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
        embeddedQuantity(state, promise.destination.id) > 0 ||
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
  function checkRecipePlan(
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
  function admitRecipePlan(
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
  function completeRecipePrepare(
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
  function settleRecipePlan(
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
    state.bindings = state.bindings.filter(
      (candidate) => candidate !== binding,
    );
    return success(undefined);
  }

  /** Atomically sinks one exact settled output portion and leaves a durable receipt. */
  function consumeRecipeOutput(
    state: MaterialsState,
    consumption: ResolvedRecipeOutputConsumption,
  ): MaterialResult<void> {
    if (!isPositiveInt(consumption.quantity))
      return failure("invalid-positive-integer");
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
  function releaseUnpreparedRecipeBinding(
    state: MaterialsState,
    id: string,
  ): MaterialResult<void> {
    const binding = state.bindings.find(
      (candidate): candidate is Extract<MaterialBinding, { kind: "recipe" }> =>
        candidate.kind === "recipe" && candidate.id === id,
    );
    if (!binding || state.transformations.some((entry) => entry.id === id))
      return failure("wrong-phase");
    state.bindings = state.bindings.filter(
      (candidate) => candidate !== binding,
    );
    return success(undefined);
  }

  return {
    checkRecipePlan,
    admitRecipePlan,
    completeRecipePrepare,
    settleRecipePlan,
    consumeRecipeOutput,
    releaseUnpreparedRecipeBinding,
  };
}

export type ResolvedRecipePlan<M extends string = string> = Parameters<
  ReturnType<typeof createRecipeSettlements<M>>["admitRecipePlan"]
>[1];
export type ResolvedRecipeSettlement<M extends string = string> = Parameters<
  ReturnType<typeof createRecipeSettlements<M>>["settleRecipePlan"]
>[1];
export type ResolvedRecipeOutputConsumption<M extends string = string> =
  Parameters<
    ReturnType<typeof createRecipeSettlements<M>>["consumeRecipeOutput"]
  >[1];
