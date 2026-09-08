import type {
  Cell,
  Clearing,
  PositiveInt,
  SourceFeature,
  SourceFeatureKind,
} from "./model.ts";
import { SIZE, sourceAccessCells } from "./world.js";
import {
  constructionBuffer,
  footprint,
  shelfContainer,
} from "./construction.js";
import {
  introduceFiniteSourceLot,
  sourceContainer,
  type ContainerSpec,
} from "./materials.ts";

export type FiniteSourceDefinition =
  | {
      kind: "spring";
      preferred: Cell;
      access: "open";
      provider: { material: "water"; capacity: PositiveInt };
      initial: readonly [
        { slot: "provider"; material: "water"; quantity: PositiveInt },
      ];
    }
  | {
      kind: "reclaimed-timber-cache";
      preferred: Cell;
      access: "sealed";
      provider: { material: "wood"; capacity: PositiveInt };
      pail: { capacity: PositiveInt };
      supplies: { capacity: PositiveInt };
      initial: readonly [
        { slot: "provider"; material: "wood"; quantity: PositiveInt },
        { slot: "pail"; material: "pail"; quantity: PositiveInt },
        { slot: "supplies"; material: "malt"; quantity: PositiveInt },
        { slot: "supplies"; material: "barm"; quantity: PositiveInt },
        { slot: "supplies"; material: "keg"; quantity: PositiveInt },
      ];
    };

/** The one bounded source policy: placement metadata and finite stock. */
export const FINITE_SOURCE_DEFINITIONS: readonly FiniteSourceDefinition[] = [
  {
    kind: "spring",
    preferred: { x: 13, z: 13, level: 0 },
    access: "open",
    provider: { material: "water", capacity: 8 as PositiveInt },
    initial: [
      { slot: "provider", material: "water", quantity: 8 as PositiveInt },
    ],
  },
  {
    kind: "reclaimed-timber-cache",
    preferred: { x: 1, z: 13, level: 0 },
    access: "sealed",
    provider: { material: "wood", capacity: 10 as PositiveInt },
    pail: { capacity: 1 as PositiveInt },
    supplies: { capacity: 6 as PositiveInt },
    initial: [
      { slot: "provider", material: "wood", quantity: 10 as PositiveInt },
      { slot: "pail", material: "pail", quantity: 1 as PositiveInt },
      { slot: "supplies", material: "malt", quantity: 4 as PositiveInt },
      { slot: "supplies", material: "barm", quantity: 1 as PositiveInt },
      { slot: "supplies", material: "keg", quantity: 1 as PositiveInt },
    ],
  },
];

type SourceState = Pick<
  Clearing,
  | "actors"
  | "parties"
  | "cat"
  | "trees"
  | "herbs"
  | "materials"
  | "rocks"
  | "watcher"
  | "sites"
  | "jobs"
  | "sources"
  | "pendingSources"
  | "operations"
> & { notice: string };

function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.z === b.z && a.level === b.level;
}

function inside(cell: Cell): boolean {
  return (
    Number.isInteger(cell.x) &&
    Number.isInteger(cell.z) &&
    Number.isInteger(cell.level) &&
    cell.x >= 0 &&
    cell.z >= 0 &&
    cell.x < SIZE &&
    cell.z < SIZE &&
    cell.level >= 0 &&
    cell.level <= 1
  );
}

function featureIdMatches(kind: SourceFeatureKind, id: string): boolean {
  return new RegExp(`^feature:${kind}(?::[1-9][0-9]*)?$`).test(id);
}

function sourceDefinition(kind: SourceFeatureKind): FiniteSourceDefinition {
  const definition = FINITE_SOURCE_DEFINITIONS.find(
    (candidate) => candidate.kind === kind,
  );
  if (!definition) throw new Error(`unknown finite source ${kind}`);
  return definition;
}

export function sourceContainerSpec(
  source: Pick<SourceFeature, "id" | "kind">,
): ContainerSpec {
  const definition = sourceDefinition(source.kind);
  return {
    id: sourceContainer(source.id),
    capacity: definition.provider.capacity,
    accepts: [definition.provider.material],
    bulk: { [definition.provider.material]: 1 as PositiveInt },
  };
}

export function sourcePailContainer(id: string): string {
  return `source-pail:${id}`;
}

export function sourceSuppliesContainer(id: string): string {
  return `source-supplies:${id}`;
}

function sourcePailLot(id: string): string {
  return `source-pail-lot:${id}`;
}

function initialLotId(
  id: string,
  initial: FiniteSourceDefinition["initial"][number],
): string {
  return initial.slot === "provider"
    ? `source-lot:${id}`
    : initial.slot === "pail"
      ? sourcePailLot(id)
      : sourceSupplyLot(id, initial.material);
}

function sourceInitialIdentityKeys(
  source: Pick<SourceFeature, "id" | "kind">,
): readonly string[] {
  const definition = sourceDefinition(source.kind);
  return definition.initial.flatMap((initial) => {
    const container =
      initial.slot === "provider"
        ? sourceContainer(source.id)
        : initial.slot === "pail"
          ? sourcePailContainer(source.id)
          : sourceSuppliesContainer(source.id);
    return [container, initialLotId(source.id, initial)];
  });
}

export function sourcePailContainerSpec(
  source: Pick<SourceFeature, "id" | "kind">,
): ContainerSpec | null {
  const definition = sourceDefinition(source.kind);
  return "pail" in definition
    ? {
        id: sourcePailContainer(source.id),
        capacity: definition.pail.capacity,
        accepts: ["pail"],
        bulk: { pail: 1 as PositiveInt },
      }
    : null;
}

export function sourceSuppliesContainerSpec(
  source: Pick<SourceFeature, "id" | "kind">,
): ContainerSpec | null {
  const definition = sourceDefinition(source.kind);
  return "supplies" in definition
    ? {
        id: sourceSuppliesContainer(source.id),
        capacity: definition.supplies.capacity,
        accepts: ["malt", "barm", "keg"],
        bulk: {
          malt: 1 as PositiveInt,
          barm: 1 as PositiveInt,
          keg: 1 as PositiveInt,
        },
      }
    : null;
}

function sourceSupplyLot(
  id: string,
  material: "malt" | "barm" | "keg",
): string {
  return `source-${material}-lot:${id}`;
}

/** Repair is a separate once-only wood consumer, never cache stock capacity. */
export function cacheRepairBuffer(
  source: Pick<SourceFeature, "id" | "kind">,
): ContainerSpec | null {
  return source.kind === "reclaimed-timber-cache"
    ? {
        id: `repair-buffer:${source.id}`,
        capacity: 2 as PositiveInt,
        accepts: ["wood"],
        bulk: { wood: 1 as PositiveInt },
      }
    : null;
}

export function resolveCacheRepairBuffer(
  state: Pick<Clearing, "sources">,
  id: string,
): { source: SourceFeature; destination: ContainerSpec } | null {
  const source = state.sources.find(
    (candidate) =>
      candidate.kind === "reclaimed-timber-cache" &&
      cacheRepairBuffer(candidate)?.id === id,
  );
  const destination = source && cacheRepairBuffer(source);
  return source && destination ? { source, destination } : null;
}

export function sourceIsOpen(source: SourceFeature): boolean {
  return source.kind !== "reclaimed-timber-cache" || source.repaired;
}

/** Source metadata and approach cells; routing remains owned by world/path. */
export function resolveFiniteSource(
  state: Pick<Clearing, "sources">,
  id: string,
): {
  source: SourceFeature;
  container: ContainerSpec;
  accessCells: readonly Cell[];
} | null {
  const source = state.sources.find((candidate) => candidate.id === id);
  return source
    ? {
        source,
        container: sourceContainerSpec(source),
        accessCells: sourceAccessCells(source),
      }
    : null;
}

/** Checked provider lookup for consumers that may withdraw finite stock. */
export function resolveOpenFiniteSourceContainer(
  state: Pick<Clearing, "sources">,
  container: string,
): {
  source: SourceFeature;
  provider: ContainerSpec;
  accessCells: readonly Cell[];
} | null {
  const source = state.sources.find(
    (candidate) => sourceContainer(candidate.id) === container,
  );
  return source && sourceIsOpen(source)
    ? {
        source,
        provider: sourceContainerSpec(source),
        accessCells: sourceAccessCells(source),
      }
    : null;
}

function identityKeys(state: SourceState): Set<string> {
  return new Set([
    ...Object.keys(state.actors),
    ...Object.keys(state.parties),
    ...state.trees.map((entry) => entry.id),
    ...state.herbs.map((entry) => entry.id),
    ...state.sites.flatMap((entry) => [
      entry.id,
      constructionBuffer(entry).id,
      shelfContainer(entry.id).id,
    ]),
    ...state.jobs.map((entry) => entry.id),
    ...state.materials.lots.flatMap((entry) => [
      entry.id,
      ...(entry.location.kind === "container"
        ? [entry.location.container]
        : []),
    ]),
    ...state.materials.transfers.flatMap((entry) => [
      entry.id,
      ...(entry.request.source.kind === "eligible-container"
        ? [entry.request.source.container]
        : []),
      ...(entry.phase.kind === "reserved" &&
      entry.phase.origin.kind === "container"
        ? [entry.phase.origin.container]
        : []),
      ...(entry.intent.kind === "deliver" ? [entry.intent.destination] : []),
    ]),
    ...state.materials.bindings.map((entry) => entry.id),
    ...state.operations.map((entry) => entry.id),
    ...state.sources.flatMap((entry) => [
      entry.id,
      ...sourceInitialIdentityKeys(entry),
    ]),
    ...state.pendingSources.flatMap((entry) => [
      entry.id,
      ...sourceInitialIdentityKeys(entry),
    ]),
  ]);
}

/** IDs outside a source's own derived namespace; used by atomic v10 conversion. */
function foreignIdentityKeys(state: SourceState): Set<string> {
  return new Set([
    ...Object.keys(state.actors),
    ...Object.keys(state.parties),
    ...state.trees.map((entry) => entry.id),
    ...state.herbs.map((entry) => entry.id),
    ...state.sites.flatMap((entry) => [
      entry.id,
      constructionBuffer(entry).id,
      shelfContainer(entry.id).id,
    ]),
    ...state.jobs.map((entry) => entry.id),
    ...state.operations.map((entry) => entry.id),
    ...state.materials.bindings.map((entry) => entry.id),
    ...state.materials.lots.flatMap((entry) => [
      entry.id,
      ...(entry.location.kind === "container"
        ? [entry.location.container]
        : []),
    ]),
    ...state.materials.transfers.flatMap((entry) => [
      entry.id,
      ...(entry.request.source.kind === "eligible-container"
        ? [entry.request.source.container]
        : []),
      ...(entry.phase.kind === "reserved" &&
      entry.phase.origin.kind === "container"
        ? [entry.phase.origin.container]
        : []),
      ...(entry.intent.kind === "deliver" ? [entry.intent.destination] : []),
    ]),
  ]);
}

function fixedIdentityKeys(state: SourceState): Set<string> {
  return new Set([
    ...Object.keys(state.actors),
    ...Object.keys(state.parties),
    ...state.trees.map((entry) => entry.id),
    ...state.herbs.map((entry) => entry.id),
    ...state.sites.flatMap((entry) => [
      entry.id,
      constructionBuffer(entry).id,
      shelfContainer(entry.id).id,
    ]),
    ...state.jobs.map((entry) => entry.id),
    ...state.materials.transfers.map((entry) => entry.id),
    ...state.materials.bindings.map((entry) => entry.id),
  ]);
}

function physicalOccupancy(state: SourceState): Cell[] {
  return [
    ...state.rocks,
    state.watcher,
    state.cat,
    ...state.cat.path,
    ...Object.values(state.actors),
    ...Object.values(state.actors).flatMap((actor) => actor.path),
    ...state.trees,
    ...state.herbs,
    ...state.sites.flatMap(footprint),
    ...state.materials.lots.flatMap((lot) =>
      lot.location.kind === "ground" ? [lot.location] : [],
    ),
    ...state.sources,
  ];
}

function nextFeatureId(kind: SourceFeatureKind, used: Set<string>): string {
  const base = `feature:${kind}`;
  for (let suffix = 0; ; suffix++) {
    const id = suffix === 0 ? base : `${base}:${suffix}`;
    if (
      !used.has(id) &&
      !used.has(sourceContainer(id)) &&
      !used.has(`source-lot:${id}`) &&
      !sourceInitialIdentityKeys({ id, kind }).some((key) => used.has(key))
    )
      return id;
  }
}

function featureCell(preferred: Cell, occupied: readonly Cell[]): Cell | null {
  const candidates: Cell[] = [];
  for (let z = 0; z < SIZE; z++)
    for (let x = 0; x < SIZE; x++) candidates.push({ x, z, level: 0 });
  candidates.sort(
    (a, b) =>
      Math.abs(a.x - preferred.x) +
        Math.abs(a.z - preferred.z) -
        (Math.abs(b.x - preferred.x) + Math.abs(b.z - preferred.z)) ||
      a.z - b.z ||
      a.x - b.x,
  );
  return (
    candidates.find(
      (candidate) => !occupied.some((cell) => sameCell(cell, candidate)),
    ) ?? null
  );
}

type SourcePlan = {
  definition: FiniteSourceDefinition;
  id: string;
  cell: Cell;
};

function planFiniteSources(
  state: SourceState,
  definitions: readonly FiniteSourceDefinition[],
  fixedIds = new Map<SourceFeatureKind, string>(),
): SourcePlan[] | null {
  const used = identityKeys(state);
  for (const [kind, id] of fixedIds) {
    used.delete(id);
    for (const key of sourceInitialIdentityKeys({ id, kind })) used.delete(key);
  }
  const occupied = physicalOccupancy(state);
  const plan: SourcePlan[] = [];
  for (const definition of definitions) {
    const id =
      fixedIds.get(definition.kind) ?? nextFeatureId(definition.kind, used);
    if (
      used.has(id) ||
      sourceInitialIdentityKeys({ id, kind: definition.kind }).some((key) =>
        used.has(key),
      )
    )
      return null;
    const cell = featureCell(definition.preferred, occupied);
    if (!cell) return null;
    used.add(id);
    for (const key of sourceInitialIdentityKeys({ id, kind: definition.kind }))
      used.add(key);
    occupied.push(cell);
    plan.push({ definition, id, cell });
  }
  return plan;
}

function commitSourcePlan(
  state: SourceState,
  plan: readonly SourcePlan[],
): void {
  for (const { definition, id } of plan) {
    for (const initial of definition.initial) {
      const source =
        initial.slot === "provider"
          ? sourceContainerSpec({ id, kind: definition.kind })
          : initial.slot === "pail"
            ? sourcePailContainerSpec({ id, kind: definition.kind })
            : sourceSuppliesContainerSpec({ id, kind: definition.kind });
      if (!source)
        throw new Error("cannot introduce missing finite source slot");
      const lot = introduceFiniteSourceLot(state.materials, {
        source,
        material: initial.material,
        quantity: initial.quantity,
        preferredId: initialLotId(id, initial),
      });
      if (!lot.ok)
        throw new Error(`cannot introduce ${definition.kind}: ${lot.reason}`);
    }
  }
  for (const { definition, id, cell } of plan)
    state.sources.push(
      definition.kind === "spring"
        ? {
            id,
            kind: "spring",
            access: "open",
            x: cell.x,
            z: cell.z,
            level: cell.level,
          }
        : {
            id,
            kind: "reclaimed-timber-cache",
            access: "sealed",
            repaired: false,
            x: cell.x,
            z: cell.z,
            level: cell.level,
          },
    );
}

function persistPending(
  state: SourceState,
  definitions: readonly FiniteSourceDefinition[],
  fixedIds = new Map<SourceFeatureKind, string>(),
): void {
  const used = identityKeys(state);
  for (const definition of definitions) {
    const id =
      fixedIds.get(definition.kind) ?? nextFeatureId(definition.kind, used);
    used.add(id);
    for (const key of sourceInitialIdentityKeys({ id, kind: definition.kind }))
      used.add(key);
    state.pendingSources.push({
      id,
      kind: definition.kind,
      preferred: { ...definition.preferred },
    });
  }
  state.notice = "A spring or reclaimed timber cache needs a clear place.";
}

/** Introduction runs only for Fresh and validated v8→9 conversion. */
export function introduceFiniteSources(state: SourceState): void {
  if (state.pendingSources.length) return;
  const missing = FINITE_SOURCE_DEFINITIONS.filter(
    (definition) =>
      !state.sources.some((source) => source.kind === definition.kind),
  );
  if (!missing.length) return;
  const plan = planFiniteSources(state, missing);
  if (!plan) return persistPending(state, missing);
  commitSourcePlan(state, plan);
}

/** One schema-10→11 conversion only; normal load never calls this. */
export function introduceRecipeCacheSupplies(state: SourceState): void {
  const cache = state.sources.find(
    (source) => source.kind === "reclaimed-timber-cache",
  );
  if (!cache) return;
  const definition = sourceDefinition(cache.kind);
  const supplies = definition.initial.filter(
    (entry) => entry.slot === "supplies",
  );
  if (!supplies.length) return;
  const container = sourceSuppliesContainerSpec(cache);
  if (!container) throw new Error("missing recipe cache supplies container");
  const keys = [
    container.id,
    ...supplies.map((entry) => initialLotId(cache.id, entry)),
  ];
  if (keys.some((key) => foreignIdentityKeys(state).has(key)))
    throw new Error(
      "cannot introduce recipe cache supplies: identity collision",
    );
  if (
    supplies.some((entry) =>
      state.materials.lots.some(
        (lot) => lot.id === initialLotId(cache.id, entry),
      ),
    )
  )
    throw new Error("cannot introduce recipe cache supplies twice");
  const next = structuredClone(state.materials);
  for (const entry of supplies) {
    const result = introduceFiniteSourceLot(next, {
      source: container,
      material: entry.material,
      quantity: entry.quantity,
      preferredId: initialLotId(cache.id, entry),
    });
    if (!result.ok)
      throw new Error(
        `cannot introduce recipe cache supplies: ${result.reason}`,
      );
  }
  state.materials = next;
}

/** Explicit later resolution seam; no tick/load path retries pending placement. */
export function resolvePendingFiniteSources(state: SourceState): void {
  if (!state.pendingSources.length) return;
  const fixedIds = new Map(
    state.pendingSources.map((entry) => [entry.kind, entry.id]),
  );
  const definitions = FINITE_SOURCE_DEFINITIONS.filter((definition) =>
    fixedIds.has(definition.kind),
  );
  const plan = planFiniteSources(state, definitions, fixedIds);
  if (!plan) return;
  state.pendingSources = [];
  commitSourcePlan(state, plan);
}

/** Cache repair opens access without changing its finite wood stock. */
export function repairReclaimedCache(
  state: Pick<Clearing, "sources">,
  id: string,
): boolean {
  const cache = state.sources.find(
    (source) => source.id === id && source.kind === "reclaimed-timber-cache",
  );
  if (!cache || cache.kind !== "reclaimed-timber-cache" || cache.repaired)
    return false;
  cache.repaired = true;
  return true;
}

/** One source/physical/identity law shared by restore and introduction. */
export function finiteSourceProblem(
  state: SourceState,
  requireAll = true,
): string | null {
  const ids = new Set<string>();
  const kinds = new Set<SourceFeatureKind>();
  const cells = new Set<string>();
  const containerIds = new Set<string>();
  const namedLotIds = new Set<string>();
  const occupied = new Set(
    physicalOccupancy({ ...state, sources: [] }).map(
      (cell) => `${cell.x},${cell.z},${cell.level}`,
    ),
  );
  const used = identityKeys({ ...state, sources: [], pendingSources: [] });
  const fixed = fixedIdentityKeys(state);
  for (const source of state.sources) {
    const key = `${source.x},${source.z},${source.level}`;
    const provider = sourceContainerSpec(source);
    const namedLotId = `source-lot:${source.id}`;
    const pailProvider = sourcePailContainerSpec(source);
    const pailLotId = pailProvider ? sourcePailLot(source.id) : null;
    const contents = state.materials.lots.filter(
      (lot) =>
        lot.location.kind === "container" &&
        lot.location.container === provider.id,
    );
    const namedLot = state.materials.lots.find((lot) => lot.id === namedLotId);
    const pailContents = pailProvider
      ? state.materials.lots.filter(
          (lot) =>
            lot.location.kind === "container" &&
            lot.location.container === pailProvider.id,
        )
      : [];
    const pailLot = pailLotId
      ? state.materials.lots.find((lot) => lot.id === pailLotId)
      : undefined;
    // This is provenance, not permanent provider custody: the final portion
    // may be held or in another valid container after a draw.  Its ID is not
    // a competing identity while the material lot itself remains unique.
    if (namedLot) used.delete(namedLotId);
    if (pailLotId && pailLot) used.delete(pailLotId);
    if (
      ids.has(source.id) ||
      kinds.has(source.kind) ||
      !inside(source) ||
      cells.has(key) ||
      occupied.has(key) ||
      used.has(source.id) ||
      used.has(namedLotId) ||
      state.materials.lots.some((lot) => lot.id === provider.id) ||
      fixed.has(provider.id) ||
      fixed.has(namedLotId) ||
      containerIds.has(provider.id) ||
      namedLotIds.has(namedLotId) ||
      (pailProvider !== null &&
        (state.materials.lots.some((lot) => lot.id === pailProvider.id) ||
          fixed.has(pailProvider.id) ||
          fixed.has(pailLotId!) ||
          containerIds.has(pailProvider.id) ||
          namedLotIds.has(pailLotId!) ||
          used.has(pailLotId!))) ||
      !featureIdMatches(source.kind, source.id) ||
      source.access !== sourceDefinition(source.kind).access
    )
      return `source ${source.id} is invalid`;
    if (
      contents.length > 1 ||
      (namedLot !== undefined &&
        (namedLot.material !== provider.accepts[0] ||
          namedLot.quantity > provider.capacity)) ||
      contents.some(
        (lot) =>
          lot.id !== `source-lot:${source.id}` ||
          lot.material !== provider.accepts[0] ||
          lot.quantity > provider.capacity,
      )
    )
      return `source ${source.id} has invalid finite contents`;
    if (
      pailProvider &&
      (!pailLot ||
        pailLot.material !== "pail" ||
        pailLot.quantity !== 1 ||
        pailContents.length > 1 ||
        pailContents.some((lot) => lot.id !== pailLotId))
    )
      return `source ${source.id} has invalid pail contents`;
    ids.add(source.id);
    kinds.add(source.kind);
    cells.add(key);
    containerIds.add(provider.id);
    namedLotIds.add(namedLotId);
    if (pailProvider) {
      containerIds.add(pailProvider.id);
      namedLotIds.add(pailLotId!);
    }
    used.add(source.id);
    used.add(provider.id);
    used.add(`source-lot:${source.id}`);
    if (pailProvider) {
      used.add(pailProvider.id);
      used.add(pailLotId!);
    }
  }
  for (const pending of state.pendingSources) {
    const providerId = sourceContainer(pending.id);
    const namedLotId = `source-lot:${pending.id}`;
    const pailProvider = sourcePailContainerSpec(pending);
    const pailLotId = pailProvider ? sourcePailLot(pending.id) : null;
    if (
      ids.has(pending.id) ||
      kinds.has(pending.kind) ||
      !inside(pending.preferred) ||
      used.has(pending.id) ||
      used.has(providerId) ||
      fixed.has(providerId) ||
      fixed.has(namedLotId) ||
      containerIds.has(providerId) ||
      namedLotIds.has(namedLotId) ||
      (pailProvider !== null &&
        (used.has(pailProvider.id) ||
          used.has(pailLotId!) ||
          fixed.has(pailProvider.id) ||
          fixed.has(pailLotId!) ||
          containerIds.has(pailProvider.id) ||
          namedLotIds.has(pailLotId!))) ||
      !featureIdMatches(pending.kind, pending.id) ||
      state.materials.lots.some(
        (lot) =>
          lot.location.kind === "container" &&
          lot.location.container === sourceContainer(pending.id),
      ) ||
      used.has(namedLotId)
    )
      return `pending source ${pending.id} is invalid`;
    ids.add(pending.id);
    kinds.add(pending.kind);
    containerIds.add(providerId);
    namedLotIds.add(namedLotId);
    if (pailProvider) {
      containerIds.add(pailProvider.id);
      namedLotIds.add(pailLotId!);
    }
    used.add(pending.id);
    used.add(providerId);
    used.add(namedLotId);
    if (pailProvider) {
      used.add(pailProvider.id);
      used.add(pailLotId!);
    }
  }
  return requireAll && kinds.size !== FINITE_SOURCE_DEFINITIONS.length
    ? "finite source introduction is incomplete"
    : null;
}
