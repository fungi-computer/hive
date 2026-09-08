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

export type FiniteSourceDefinition = {
  kind: SourceFeatureKind;
  preferred: Cell;
  access: SourceFeature["access"];
  material: "wood" | "water";
  quantity: PositiveInt;
};

/** The one bounded source policy: placement metadata and finite stock. */
export const FINITE_SOURCE_DEFINITIONS: readonly FiniteSourceDefinition[] = [
  {
    kind: "spring",
    preferred: { x: 13, z: 13, level: 0 },
    access: "open",
    material: "water",
    quantity: 8 as PositiveInt,
  },
  {
    kind: "reclaimed-timber-cache",
    preferred: { x: 1, z: 13, level: 0 },
    access: "sealed",
    material: "wood",
    quantity: 10 as PositiveInt,
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
    capacity: definition.quantity,
    accepts: [definition.material],
    bulk: { [definition.material]: 1 as PositiveInt },
  };
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
    ...state.materials.vesselUses.map((entry) => entry.id),
    ...state.sources.flatMap((entry) => [
      entry.id,
      sourceContainer(entry.id),
      `source-lot:${entry.id}`,
    ]),
    ...state.pendingSources.flatMap((entry) => [
      entry.id,
      sourceContainer(entry.id),
      `source-lot:${entry.id}`,
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
    ...state.materials.vesselUses.map((entry) => entry.id),
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
      !used.has(`source-lot:${id}`)
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
  for (const id of fixedIds.values()) {
    used.delete(id);
    used.delete(sourceContainer(id));
    used.delete(`source-lot:${id}`);
  }
  const occupied = physicalOccupancy(state);
  const plan: SourcePlan[] = [];
  for (const definition of definitions) {
    const id =
      fixedIds.get(definition.kind) ?? nextFeatureId(definition.kind, used);
    if (
      used.has(id) ||
      used.has(sourceContainer(id)) ||
      used.has(`source-lot:${id}`)
    )
      return null;
    const cell = featureCell(definition.preferred, occupied);
    if (!cell) return null;
    used.add(id);
    used.add(sourceContainer(id));
    used.add(`source-lot:${id}`);
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
    const stock = introduceFiniteSourceLot(state.materials, {
      source: sourceContainerSpec({ id, kind: definition.kind }),
      material: definition.material,
      quantity: definition.quantity,
      preferredId: `source-lot:${id}`,
    });
    if (!stock.ok)
      throw new Error(`cannot introduce ${definition.kind}: ${stock.reason}`);
  }
  for (const { definition, id, cell } of plan)
    state.sources.push({
      id,
      kind: definition.kind,
      access: definition.access,
      x: cell.x,
      z: cell.z,
      level: cell.level,
    });
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
    used.add(sourceContainer(id));
    used.add(`source-lot:${id}`);
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
    const contents = state.materials.lots.filter(
      (lot) =>
        lot.location.kind === "container" &&
        lot.location.container === provider.id,
    );
    const namedLot = state.materials.lots.find((lot) => lot.id === namedLotId);
    // This is provenance, not permanent provider custody: the final portion
    // may be held or in another valid container after a draw.  Its ID is not
    // a competing identity while the material lot itself remains unique.
    if (namedLot) used.delete(namedLotId);
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
    ids.add(source.id);
    kinds.add(source.kind);
    cells.add(key);
    containerIds.add(provider.id);
    namedLotIds.add(namedLotId);
    used.add(source.id);
    used.add(provider.id);
    used.add(`source-lot:${source.id}`);
  }
  for (const pending of state.pendingSources) {
    const providerId = sourceContainer(pending.id);
    const namedLotId = `source-lot:${pending.id}`;
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
    used.add(pending.id);
    used.add(providerId);
    used.add(namedLotId);
  }
  return requireAll && kinds.size !== FINITE_SOURCE_DEFINITIONS.length
    ? "finite source introduction is incomplete"
    : null;
}
