import { appendVisualProjections } from "./visual-projection";
import { TerrainPresentationOwner } from "./terrain-presentation";
import type { EnvironmentDefinition } from "../sdk/environment";
import { appendPresentationCues, checkedCueSnapshot, type CueSnapshot } from "./presentation-cues";
import { isReservedComponent } from "../contracts";
import { checkedAction } from "./actions";
import { readKernelEntities } from "./kernel-records";
import { Body, Position, Support, Surface } from "../sdk/common";
import type {
  ActionRequest,
  AdvanceResult,
  ActionResult,
  ActionOutcome,
  AssignmentCandidate,
  ComponentDefinition,
  ComponentId,
  GameCommandResult,
  GamePack,
  KernelPort,
  QuerySpec,
  QueryRow,
  RandomSource,
  SimulationClock,
  WriteContext,
  WriteIntent,
  EntityRecord,
  EntityId,
  WorldPose,
  Impact,
  WorkMaterialFacts,
} from "../contracts";

class DeterministicRandom implements RandomSource {
  private value: number;
  constructor(seed: number) {
    this.value = seed >>> 0;
  }
  next(): number {
    this.value = (Math.imul(1664525, this.value) + 1013904223) | 0;
    return (this.value >>> 0) / 0x1_0000_0000;
  }
  state(): number {
    return this.value >>> 0;
  }
  restore(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
      throw new Error("invalid random state");
    this.value = value >>> 0;
  }
}

export interface SessionOptions {
  readonly seed?: number;
  readonly port: KernelPort;
  readonly pack: GamePack;
}
export interface SessionSnapshot {
  readonly format: "hive-session";
  readonly version: 8;
  readonly cues: CueSnapshot;
  readonly game: string;
  readonly gameVersion: number;
  readonly paused: boolean;
  readonly kernel: ReturnType<KernelPort["snapshot"]>;
  readonly now: number;
  readonly tick: number;
  readonly random: number;
  readonly outcomes: readonly ActionOutcome[];
  readonly pendingActions: readonly ActionRequest[];
  readonly pendingWrites: readonly WriteIntent[];
  readonly pendingCreates: readonly EntityRecord[];
  readonly pendingRemoves: readonly EntityId[];
  readonly pendingImpacts: readonly Impact[];
  readonly impactHighWater: number;
  readonly impactFrontiers: readonly { system: string; sequence: number | null }[];
  readonly systems: readonly { id: string; version: number; consumesImpacts: boolean }[];
}
const MAX_PENDING_IMPACTS = 1024;
const MAX_AUTHORED_RECORDS = 256;
const MAX_AUTHORED_REMOVES = 256;
function checkedAuthoredId(value: unknown): EntityId {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]+$/.test(value) || value.length > 128)
    throw new Error("invalid authored entity id");
  return value as EntityId;
}
function finiteVec3(value: unknown): value is { x: number; y: number; z: number } {
  return Boolean(value) && typeof value === "object" &&
    Number.isFinite((value as { x?: unknown }).x) &&
    Number.isFinite((value as { y?: unknown }).y) &&
    Number.isFinite((value as { z?: unknown }).z);
}
function checkedImpact(value: unknown): Impact {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid physical impact");
  const impact = value as Record<string, unknown>;
  const allowed = new Set(["id", "sequence", "projectileId", "sourceId", "targetId", "time", "point", "normal", "velocity"]);
  if (Object.keys(impact).some((key) => !allowed.has(key)))
    throw new Error("invalid physical impact fields");
  for (const field of ["id", "sourceId", "targetId"])
    if (typeof impact[field] !== "string" || impact[field].length === 0 || impact[field].length > 160)
      throw new Error("invalid physical impact identity");
  if (impact.projectileId !== undefined &&
      (typeof impact.projectileId !== "string" || impact.projectileId.length === 0 || impact.projectileId.length > 160))
    throw new Error("invalid physical projectile identity");
  if (typeof impact.sequence !== "number" || !Number.isSafeInteger(impact.sequence) || impact.sequence < 1 ||
      typeof impact.time !== "number" || !Number.isFinite(impact.time) || impact.time < 0 ||
      !finiteVec3(impact.point) || !finiteVec3(impact.normal) || !finiteVec3(impact.velocity))
    throw new Error("invalid physical impact geometry");
  return structuredClone(value) as Impact;
}
export class GameSession {
  readonly pack: GamePack;
  private readonly port: KernelPort;
  private readonly random: DeterministicRandom;
  private readonly seed: number;
  private paused = false;
  private now = 0;
  private tick = 0;
  private outcomes: ActionOutcome[] = [];
  private pendingActions: ActionRequest[] = [];
  private pendingWrites: WriteIntent[] = [];
  private pendingCreates: EntityRecord[] = [];
  private pendingRemoves: EntityId[] = [];
  private pendingImpacts: Impact[] = [];
  private impactHighWater = 0;
  private cues: CueSnapshot = { sequence: 0, recent: [] };
  private impactFrontiers = new Map<string, number | null>();
  private poisoned = true;
  private terrainPresentation: TerrainPresentationOwner | undefined;
  constructor(options: SessionOptions) {
    this.pack = options.pack;
    this.port = options.port;
    this.seed = (options.seed ?? 1) >>> 0;
    this.random = new DeterministicRandom(this.seed);
    const consumers = new Set<string>();
    for (const system of this.pack.systems) {
      if (consumers.has(system.id)) throw new Error("duplicate system identity");
      consumers.add(system.id);
      if (system.consumesImpacts) this.impactFrontiers.set(system.id, null);
    }
    for (const definition of Object.values(this.pack.commands ?? {})) {
      const commandWrites = new Set(
        definition.writes.map((component) => component.id),
      );
      if (
        this.pack.systems.some((system) =>
          system.writes.some((component) => commandWrites.has(component.id)),
        )
      )
        throw new Error("command and system write ownership overlaps");
    }
  }
  start(): void {
    this.terrainPresentation = undefined;
    this.poisoned = true;
    this.random.restore(this.seed);
    this.paused = false;
    this.now = 0;
    this.tick = 0;
    this.outcomes = [];
    this.pendingActions = [];
    this.pendingWrites = [];
    this.pendingCreates = [];
    this.pendingRemoves = [];
    this.pendingImpacts = [];
    this.impactHighWater = 0;
    this.cues = { sequence: 0, recent: [] };
    this.impactFrontiers = new Map(
      this.pack.systems.filter(system => system.consumesImpacts).map(system => [system.id, null]),
    );
    this.port.load(this.pack.definition);
    if (this.pack.environmentDefinition)
      this.port.loadEnvironment(this.pack.environmentDefinition);
    if (this.pack.initialActions)
      this.pendingActions.push(...this.pack.initialActions);
    this.poisoned = false;
  }
  private ensureLive(): void {
    if (this.poisoned) throw new Error("session-poisoned");
  }
  pause(): void {
    this.ensureLive();
    this.paused = true;
  }
  resume(): void {
    this.ensureLive();
    this.paused = false;
  }
  get isPaused(): boolean {
    this.ensureLive();
    return this.paused;
  }
  get simulationTime(): number {
    this.ensureLive();
    return this.now;
  }
  reset(): void {
    this.start();
  }
  atmosphereSamples(cells: readonly [number, number, number][]) {
    this.ensureLive();
    return this.port.atmosphereSamples(cells);
  }
  environmentFacts() {
    this.ensureLive();
    return this.port.environmentFacts();
  }
  terrainSurfaces(columns: readonly [number, number][]) {
    this.ensureLive();
    return this.port.terrainSurfaces(columns);
  }
  query<T extends object>(spec: QuerySpec<T>): readonly QueryRow<T>[] {
    this.ensureLive();
    return this.port.query(spec);
  }
  assign(
    candidates: readonly AssignmentCandidate[],
    maxEdges = 128,
  ) {
    this.ensureLive();
    return this.port.assign(candidates, maxEdges);
  }
  private worldPoses(
    entities: readonly EntityId[],
    reads: readonly ComponentDefinition<any>[],
  ): readonly WorldPose[] {
    const declared = new Set(reads.map((component) => component.id));
    if (
      !declared.has(Position.id) ||
      !declared.has(Support.id) ||
      !declared.has(Surface.id)
    )
      throw new Error(
        "world poses require hive.position, hive.support, and hive.surface reads",
      );
    return this.port.worldPoses(entities);
  }
  request(action: ActionRequest): void {
    this.ensureLive();
    if (this.pendingActions.length >= 128)
      throw new Error("pending action limit reached");
    this.pendingActions.push(checkedAction(action));
  }
  command(name: string, input: unknown): void {
    this.ensureLive();
    const handler = this.pack.commands?.[name];
    if (!handler || !Object.hasOwn(this.pack.commands ?? {}, name))
      throw new Error("unknown game command");
    const reads = new Set(
      (handler.reads ?? []).map((component) => component.id),
    );
    const result: GameCommandResult = handler.invoke(
      {
        physicalContacts: cells => this.port.physicalContacts(cells),
        query: (spec) => {
          for (const component of spec.components)
            if (!reads.has(component.id))
              throw new Error(`command ${name} cannot read ${component.id}`);
          return this.queryOverlay(spec, this.pendingWrites);
        },
      },
      structuredClone(input),
    );
    if (
      !result ||
      !Array.isArray(result.actions) ||
      !Array.isArray(result.writes) ||
      (result.creates !== undefined && !Array.isArray(result.creates)) ||
      (result.removes !== undefined && !Array.isArray(result.removes))
    )
      throw new Error("invalid command result");
    const actions = result.actions.map(checkedAction);
    const edits = this.validateAuthoredEdits(result.creates ?? [], result.removes ?? [],
      [...this.pendingWrites, ...result.writes], handler.lifecycle ?? [], this.pendingCreates, this.pendingRemoves);
    const writes = this.validateWrites(result.writes, handler.writes, edits.known);
    const { creates, removes } = edits;
    const merged = [...this.pendingWrites];
    for (const write of writes) {
      const index = merged.findIndex(
        (existing) =>
          existing.entity === write.entity &&
          existing.component === write.component,
      );
      if (index >= 0) merged[index] = write;
      else merged.push(write);
    }
    if (
      this.pendingActions.length + actions.length > 128 ||
      merged.length > 128 || this.pendingCreates.length + creates.length > MAX_AUTHORED_RECORDS ||
      this.pendingRemoves.length + removes.length > MAX_AUTHORED_REMOVES
    )
      throw new Error("pending action limit reached");
    this.pendingActions.push(...actions);
    this.pendingWrites = merged;
    this.pendingCreates.push(...creates);
    this.pendingRemoves.push(...removes);
  }
  private validateAuthoredEdits(
    creates: readonly EntityRecord[], removes: readonly EntityId[], writes: readonly WriteIntent[],
    allowed: readonly ComponentDefinition<any>[],
    queuedCreates: readonly EntityRecord[] = [], queuedRemoves: readonly EntityId[] = [],
    incoming?: readonly EntityRecord[],
  ) {
    const allCreates = [...queuedCreates, ...creates];
    const allRemoves = [...queuedRemoves, ...removes].map(checkedAuthoredId);
    if (allCreates.length > MAX_AUTHORED_RECORDS || allRemoves.length > MAX_AUTHORED_REMOVES)
      throw new Error("authored edit budget exceeded");
    const removed = new Set(allRemoves);
    if (removed.size !== allRemoves.length) throw new Error("duplicate authored removal");
    const permitted = new Set(allowed.map(definition => definition.id));
    const definitions = new Map(this.pack.components.map(definition => [definition.id, definition]));
    const requested = new Set<EntityId>(allRemoves);
    const created = new Set<EntityId>();
    const inspectValue = (name: string, value: unknown) => {
      const definition = definitions.get(name as ComponentId);
      if (!definition || !definition.validate(value)) throw new Error(`invalid authored component ${name}`);
      for (const [field, kind] of Object.entries(definition.fields)) {
        const item = (value as Record<string, unknown>)[field];
        if ((kind === "entity" || kind === "nullable-entity") && item !== null)
          requested.add(checkedAuthoredId(item));
        if (typeof item === "string" && new TextEncoder().encode(item).length > 4096)
          throw new Error("authored string exceeds 4096 bytes");
      }
    };
    for (const record of allCreates) {
      const id = checkedAuthoredId(record?.id);
      if (created.has(id) || removed.has(id)) throw new Error("conflicting authored identity edit");
      created.add(id); requested.add(id);
      if (!record.components || Array.isArray(record.components) || typeof record.components !== "object" ||
          Object.keys(record.components).length === 0 || Object.keys(record.components).length > 32)
        throw new Error("invalid authored creation components");
      for (const [name,value] of Object.entries(record.components)) {
        if (isReservedComponent(name)) throw new Error("physical authored creation");
        inspectValue(name,value);
      }
    }
    for (const record of creates)
      for (const name of Object.keys(record.components))
        if (!permitted.has(name as ComponentId)) throw new Error(`undeclared authored creation ${name}`);
    for (const write of writes) { requested.add(checkedAuthoredId(write.entity)); inspectValue(write.component, write.value); }
    const known = new Set<EntityId>();
    const ids = [...requested];
    const incomingIds = incoming && new Set(incoming.map(record => record.id));
    for (let offset=0;offset<ids.length;offset+=128) {
      const batch = ids.slice(offset,offset+128);
      const membership = incomingIds ? batch.map(id => incomingIds.has(id)) : this.port.entityMembership(batch);
      if (membership.length !== batch.length) throw new Error("invalid entity membership result");
      batch.forEach((id,index) => { if (membership[index]) known.add(id); });
    }
    for (const id of created) {
      if (known.has(id)) throw new Error("authored creation already exists");
      known.add(id);
    }
    for (const id of removed) {
      if (!known.delete(id)) throw new Error("unknown authored removal");
    }
    for (const id of requested)
      if (!created.has(id) && !removed.has(id) && !known.has(id)) throw new Error(`unknown entity reference ${id}`);
    const checkReferences = (name: string, value: unknown) => {
      const definition = definitions.get(name as ComponentId)!;
      for (const [field,kind] of Object.entries(definition.fields)) {
        const ref = (value as Record<string,unknown>)[field];
        if ((kind === "entity" || kind === "nullable-entity") && ref !== null && !known.has(ref as EntityId))
          throw new Error(`unknown authored reference ${field}`);
      }
    };
    for (const record of allCreates) for (const [name,value] of Object.entries(record.components)) checkReferences(name,value);
    for (const write of writes) {
      if (!known.has(write.entity)) throw new Error("write targets removed entity");
      checkReferences(write.component,write.value);
    }
    if (removes.length) {
      const targets = new Set(removes);
      const owned = new Set<EntityId>();
      // Removal is uncommon. Read component membership only here, never for
      // ordinary ticks or creation. Native removal also checks physical state
      // and every surviving reference before publication.
      for (const definition of this.pack.components) {
        const rows = incoming
          ? incoming.filter(record => Object.hasOwn(record.components,definition.id)).map(record => ({id:record.id}))
          : this.port.query({components:[definition]});
        for (const row of rows) if (targets.has(row.id)) {
          if (isReservedComponent(definition.id) || !permitted.has(definition.id)) throw new Error("authored removal exceeds component ownership");
          owned.add(row.id);
        }
      }
      if (removes.some(id => !owned.has(id))) throw new Error("authored removal has no owned record");
    }
    return { creates: structuredClone([...creates]), removes: [...removes], known };
  }
  private validateWrites(
    writes: readonly WriteIntent[],
    allowed: readonly ComponentDefinition<any>[],
    knownTargets?: ReadonlySet<EntityId>,
    knownMembership?: ReadonlySet<string>,
  ): WriteIntent[] {
    const definitions = new Map(
      this.pack.components.map((component) => [component.id, component]),
    );
    const permitted = new Set(allowed.map((component) => component.id));
    const referenced = new Set<EntityId>();
    if (!knownTargets) {
      for (const write of writes) {
        const definition = definitions.get(write.component);
        if (!definition || typeof write.value !== "object" || write.value === null) continue;
        for (const [field, kind] of Object.entries(definition.fields)) {
          const value = (write.value as Record<string, unknown>)[field];
          if ((kind === "entity" || kind === "nullable-entity") && value !== null) {
            if (typeof value !== "string") throw new Error(`unknown entity reference ${field}`);
            referenced.add(value as EntityId);
          }
        }
      }
    }
    const referencedIds = [...referenced];
    const referenceMembership = new Map<EntityId, boolean>();
    for (let offset = 0; offset < referencedIds.length; offset += 128) {
      const batch = referencedIds.slice(offset, offset + 128);
      const membership = this.port.entityMembership(batch);
      batch.forEach((id, index) => referenceMembership.set(id, membership[index] === true));
    }
    return writes.map((write) => {
      if (
        !permitted.has(write.component) ||
        isReservedComponent(write.component)
      )
        throw new Error(`undeclared or physical write ${write.component}`);
      const definition = definitions.get(write.component);
      if (!definition || !definition.validate(write.value))
        throw new Error(`invalid component write ${write.component}`);
      if (
        typeof write.value === "object" &&
        write.value !== null &&
        Object.values(write.value as Record<string, unknown>).some(
          (value) =>
            typeof value === "string" &&
            new TextEncoder().encode(value).length > 4096,
        )
      )
        throw new Error("authored string exceeds 4096 bytes");
      if (
        knownMembership
          ? !knownMembership.has(`${write.entity}|${write.component}`)
          : knownTargets
            ? !knownTargets.has(write.entity)
            : !this.port
                .query({ components: [definition] })
                .some((row) => row.id === write.entity)
      )
        throw new Error(`unknown write target ${write.entity}`);
      for (const [field, kind] of Object.entries(definition.fields)) {
        const value = (write.value as Record<string, unknown>)[field];
        if (
          (kind === "entity" || kind === "nullable-entity") &&
          value !== null
        ) {
          const targetKnown = knownTargets
            ? knownTargets.has(value as EntityId)
            : referenceMembership?.get(value as EntityId) === true;
          if (typeof value !== "string" || !targetKnown)
            throw new Error(`unknown entity reference ${field}`);
        }
      }
      return structuredClone(write);
    });
  }
  private queryOverlay<T extends object>(
    spec: QuerySpec<T>,
    pending: readonly WriteIntent[],
    creates: readonly EntityRecord[] = this.pendingCreates,
    removes: readonly EntityId[] = this.pendingRemoves,
  ): readonly QueryRow<T>[] {
    const rows = this.port.query(spec).filter((row) => !removes.includes(row.id));
    const createdRows = creates.filter((record) => spec.components.every((component) => Object.hasOwn(record.components, component.id))).map((record) => ({
      id: record.id,
      get: <V extends object>(definition: ComponentDefinition<V>) => structuredClone(record.components[definition.id]) as V,
    }));
    return [...rows, ...createdRows].map((row) => ({
      id: row.id,
      get: <V extends object>(
        definition: ComponentDefinition<V>,
      ) => {
        if (
          !spec.components.some((component) => component.id === definition.id)
        )
          throw new Error(
            `query row ${row.id} did not request ${definition.id}`,
          );
        const intent = pending.find(
          (write) =>
            write.entity === row.id && write.component === definition.id,
        );
        return structuredClone(
          intent ? intent.value : row.get(definition),
        ) as V;
      },
    }));
  }
  private impactsFor(
    systemId: string,
    frontiers: ReadonlyMap<string, number | null>,
  ): readonly Impact[] {
    const frontier = frontiers.get(systemId);
    if (frontier === undefined) throw new Error("missing impact consumer frontier");
    if (frontier === null) return structuredClone(this.pendingImpacts);
    return structuredClone(
      this.pendingImpacts.filter((impact) => impact.sequence > frontier),
    );
  }
  private compactImpacts(): void {
    if (this.impactFrontiers.size === 0) {
      this.pendingImpacts = [];
      return;
    }
    if (this.pendingImpacts.length === 0) return;
    const frontiers: number[] = [];
    for (const frontier of this.impactFrontiers.values()) {
      if (frontier === null) return;
      frontiers.push(frontier);
    }
    const removeThrough = Math.min(...frontiers);
    this.pendingImpacts = this.pendingImpacts.filter(
      (impact) => impact.sequence > removeThrough,
    );
  }
  step(delta: number): readonly ActionResult[] {
    if (delta < 0 || delta > 1 || !Number.isFinite(delta))
      throw new Error("delta must be finite and between zero and one second");
    this.ensureLive();
    if (this.paused) return [];
    try {
      this.compactImpacts();
      const clock: SimulationClock = Object.freeze({
        now: this.now,
        delta,
        tick: this.tick,
      });
      const queuedWrites = structuredClone(this.pendingWrites);
      this.pendingWrites = [];
      const queuedCreates = structuredClone(this.pendingCreates);
      this.pendingCreates = [];
      const queuedRemoves = structuredClone(this.pendingRemoves);
      this.pendingRemoves = [];
      const writes: WriteIntent[] = [...queuedWrites];
      const actions: ActionRequest[] = this.pendingActions.splice(0);
      const nextFrontiers = new Map(this.impactFrontiers);
      let systemActionCount = 0;
      let routeRequests = 0;
      let committedWorkMaterialFacts: WorkMaterialFacts | undefined;
      let activeReads: readonly ComponentDefinition<any>[] =
        [];
      const context: WriteContext = {
        clock,
        random: this.random,
        impacts: [],
        assign: (candidates, maxEdges) => this.assign(candidates, maxEdges),
        worldPoses: (entities) => this.worldPoses(entities, activeReads),
        physicalContacts: cells => this.port.physicalContacts(cells),
        environmentFacts: () => this.port.environmentFacts(),
        atmosphereSamples: cells => this.port.atmosphereSamples(cells),
        terrainMaterials: cells => this.port.terrainMaterials(cells),
        terrainSurfaces: columns => this.port.terrainSurfaces(columns),
        routeCosts: requests => {
          if (!activeReads.some(definition => definition.id === Position.id) || !activeReads.some(definition => definition.id === Body.id))
            throw new Error("route query requires declared position and body reads");
          if (routeRequests + requests.length > 128)
            return requests.map(request => ({actor:request.actor,status:"unavailable" as const,reason:"Route planning deferred"}));
          routeRequests += requests.length;
          return this.port.routeCosts(requests);
        },
        outcomes: structuredClone(this.outcomes),
        query: (spec) => this.queryOverlay(spec, queuedWrites, queuedCreates, queuedRemoves),
        workMaterialFacts: () => {
          // Physical material actions commit at the native boundary. Authored
          // overlays cannot write reserved material components, so this
          // committed snapshot is valid for every system in this step.
          return committedWorkMaterialFacts ??= this.port.workMaterialFacts();
        },
        write: (definition, entity, value) => {
          writes.push({ component: definition.id, entity, value });
        },
        action: (action) => {
          if (++systemActionCount > 128)
            throw new Error("game systems exceeded 128 actions per step");
          actions.push(checkedAction(action));
        },
        createAuthoredEntity: (record) => {
          if (queuedCreates.length >= MAX_AUTHORED_RECORDS) throw new Error("authored creation budget exceeded");
          queuedCreates.push(structuredClone(record));
        },
        removeAuthoredEntity: (id) => {
          if (queuedRemoves.length >= MAX_AUTHORED_REMOVES) throw new Error("authored removal budget exceeded");
          queuedRemoves.push(checkedAuthoredId(id));
        },
      };
      for (const definition of this.pack.systems) {
        if (
          definition.every !== undefined &&
          this.tick % definition.every !== 0
        )
          continue;
        const beforeWrites = writes.length;
        const beforeCreates = queuedCreates.length;
        const beforeRemoves = queuedRemoves.length;
        activeReads = definition.reads;
        const impacts = definition.consumesImpacts
          ? this.impactsFor(definition.id, nextFrontiers)
          : [];
        definition.run({
          ...context,
          impacts,
        });
        if (definition.consumesImpacts && this.pendingImpacts.length > 0)
          nextFrontiers.set(
            definition.id,
            this.pendingImpacts[this.pendingImpacts.length - 1].sequence,
          );
        const edits = this.validateAuthoredEdits(
          queuedCreates.slice(beforeCreates), queuedRemoves.slice(beforeRemoves), writes,
          definition.writes, queuedCreates.slice(0,beforeCreates), queuedRemoves.slice(0,beforeRemoves));
        writes.push(...this.validateWrites(writes.splice(beforeWrites), definition.writes, edits.known));
      }
      const advanced: AdvanceResult = this.port.advance(delta, writes, actions, { creates: queuedCreates, removes: queuedRemoves });
      if (advanced.results.length !== actions.length)
        throw new Error("kernel result count mismatch");
      const incoming = advanced.impacts.map(checkedImpact);
      const seen = new Set(this.pendingImpacts.map((impact) => impact.sequence));
      let previousSequence = this.pendingImpacts.at(-1)?.sequence ?? this.impactHighWater;
      for (const impact of incoming) {
        if (seen.has(impact.sequence) || impact.sequence <= this.impactHighWater)
          throw new Error("duplicate physical impact sequence");
        if (impact.time < this.now - 1e-9 || impact.time > this.now + delta + 1e-9)
          throw new Error("physical impact outside committed step");

        if (impact.sequence <= previousSequence) throw new Error("physical impacts out of order");
        seen.add(impact.sequence);
        previousSequence = impact.sequence;
      }
      this.pendingImpacts = [...this.pendingImpacts, ...incoming];
      if (incoming.length > 0)
        this.impactHighWater = incoming[incoming.length - 1].sequence;
      this.impactFrontiers = nextFrontiers;
      this.compactImpacts();
      if (this.pendingImpacts.length > MAX_PENDING_IMPACTS)
        throw new Error("physical impact backlog limit reached");
      this.outcomes = actions.map((action, index) => ({
        action,
        result: advanced.results[index],
      }));
      if (this.pack.presentation?.feedback)
        this.cues = appendPresentationCues(this.cues, this.now + delta, this.outcomes, incoming);
      this.now += delta;
      this.tick++;
      return advanced.results;
    } catch (error) {
      this.poisoned = true;
      throw error;
    }
  }
  save(): SessionSnapshot {
    this.ensureLive();
    return {
      format: "hive-session",
      version: 8,
      cues: structuredClone(this.cues),
      outcomes: structuredClone(this.outcomes),
      game: this.pack.id,
      gameVersion: this.pack.version,
      paused: this.paused,
      kernel: this.port.snapshot(),
      now: this.now,
      tick: this.tick,
      random: this.random.state(),
      pendingActions: structuredClone(this.pendingActions),
      pendingWrites: structuredClone(this.pendingWrites),
      pendingCreates: structuredClone(this.pendingCreates),
      pendingRemoves: structuredClone(this.pendingRemoves),
      pendingImpacts: structuredClone(this.pendingImpacts),
      impactHighWater: this.impactHighWater,
      impactFrontiers: [...this.impactFrontiers.entries()].map(([system, sequence]) => ({ system, sequence })),
      systems: this.pack.systems.map((system) => ({
        id: system.id,
        version: system.version,
        consumesImpacts: system.consumesImpacts === true,
      })),
    };
  }
  restore(snapshot: SessionSnapshot): void {
    if (
      snapshot.format !== "hive-session" ||
      snapshot.version !== 8 ||
      snapshot.game !== this.pack.id ||
      snapshot.gameVersion !== this.pack.version ||
      typeof snapshot.paused !== "boolean" ||
      snapshot.now < 0 ||
      !Number.isFinite(snapshot.now) ||
      !Number.isSafeInteger(snapshot.tick) ||
      snapshot.tick < 0 ||
      !Number.isInteger(snapshot.random) ||
      snapshot.random < 0 ||
      snapshot.random > 0xffffffff ||
      !Number.isSafeInteger(snapshot.impactHighWater) ||
      snapshot.impactHighWater < 0
    )
      throw new Error("invalid session snapshot");
    if (
      !Array.isArray(snapshot.pendingActions) ||
      snapshot.pendingActions.length > 128 ||
      !Array.isArray(snapshot.pendingWrites) ||
      snapshot.pendingWrites.length > 128 ||
      !Array.isArray(snapshot.pendingCreates) || snapshot.pendingCreates.length > MAX_AUTHORED_RECORDS ||
      !Array.isArray(snapshot.pendingRemoves) || snapshot.pendingRemoves.length > MAX_AUTHORED_REMOVES ||
      !Array.isArray(snapshot.pendingImpacts) ||
      snapshot.pendingImpacts.length > MAX_PENDING_IMPACTS ||
      !Array.isArray(snapshot.impactFrontiers) ||
      !Array.isArray(snapshot.systems)
    )
      throw new Error("invalid session queues");
    const expectedEnvironment = this.pack.environmentDefinition;
    const savedEnvironment = snapshot.kernel.records?.find(record => record.key === "kernel/environment/definition")?.bytes;
    if (Boolean(expectedEnvironment) !== Boolean(savedEnvironment) ||
        (expectedEnvironment && savedEnvironment && (expectedEnvironment.byteLength !== savedEnvironment.byteLength ||
          expectedEnvironment.some((byte, index) => byte !== savedEnvironment[index]))))
      throw new Error("snapshot environment definitions do not match");
    const cues = checkedCueSnapshot(snapshot.cues, snapshot.now);
    const pending = snapshot.pendingActions.map(checkedAction);
    let canonical: any;
    try { canonical = readKernelEntities(snapshot.kernel); }
    catch { throw new Error("invalid session snapshot"); }
    const initialEntities = canonical.scene?.initial;
    if (!Array.isArray(initialEntities))
      throw new Error("invalid session entities");
    const incomingTargets = new Set<EntityId>(
      initialEntities.map((entity: { id: EntityId }) => entity.id),
    );
    const incomingMembership = new Set<string>();
    for (const entity of initialEntities)
      for (const component of Object.keys(entity.components ?? {}))
        incomingMembership.add(`${entity.id}|${component}`);
    const pendingKeys = new Set<string>();
    for (const write of snapshot.pendingWrites) {
      const key = `${write.entity}|${write.component}`;
      if (pendingKeys.has(key)) throw new Error("duplicate pending write");
      pendingKeys.add(key);
    }
    const authoredDefinitions = Object.values(this.pack.commands ?? {}).flatMap(command => command.writes);
    const edits = this.validateAuthoredEdits(snapshot.pendingCreates, snapshot.pendingRemoves,
      snapshot.pendingWrites, Object.values(this.pack.commands ?? {}).flatMap(command => command.lifecycle ?? []), [], [], initialEntities);
    const pendingWrites = this.validateWrites(snapshot.pendingWrites, authoredDefinitions, edits.known);
    const pendingCreates = edits.creates;
    const pendingRemoves = edits.removes;
    const pendingImpacts = snapshot.pendingImpacts.map(checkedImpact);
    const impactIds = new Set<string>();
    const impactSequences = new Set<number>();
    let previousSequence = 0;
    for (const impact of pendingImpacts) {
      if (impactIds.has(impact.id)) throw new Error("duplicate pending impact");
      if (impactSequences.has(impact.sequence) || impact.sequence <= previousSequence ||
          impact.sequence > snapshot.impactHighWater)
        throw new Error("invalid pending impact sequence");
      impactIds.add(impact.id);
      impactSequences.add(impact.sequence);
      previousSequence = impact.sequence;
    }
    const expectedConsumers = new Set(
      this.pack.systems.filter((system) => system.consumesImpacts).map((system) => system.id),
    );
    if (snapshot.impactFrontiers.length !== expectedConsumers.size)
      throw new Error("invalid impact frontiers");
    const frontiers = new Map<string, number | null>();
    for (const frontier of snapshot.impactFrontiers) {
      if (typeof frontier.system !== "string" || !expectedConsumers.has(frontier.system) ||
          frontiers.has(frontier.system) ||
          (frontier.sequence !== null &&
            (typeof frontier.sequence !== "number" || !Number.isSafeInteger(frontier.sequence) ||
              frontier.sequence < 0 || frontier.sequence > snapshot.impactHighWater)))
        throw new Error("invalid impact frontier");
      frontiers.set(frontier.system, frontier.sequence);
    }
    const minimum = Math.min(
      ...[...frontiers.values()].map((sequence) => sequence ?? 0),
    );
    if (pendingImpacts.some((impact) => impact.sequence <= minimum))
      throw new Error("uncompacted impact frontier");
    if (!Array.isArray(snapshot.outcomes) || snapshot.outcomes.length > 256)
      throw new Error("invalid action outcomes");
    const outcomes = snapshot.outcomes.map((outcome) => {
      if (
        !outcome.result ||
        typeof outcome.result.accepted !== "boolean" ||
        outcome.result.revision !== snapshot.kernel.revision ||
        (outcome.result.reason != null &&
          typeof outcome.result.reason !== "string")
      )
        throw new Error("invalid action result");
      return {
        action: checkedAction(outcome.action),
        result: structuredClone(outcome.result),
      };
    });
    const definition = JSON.parse(
      new TextDecoder().decode(this.pack.definition),
    );
    if (
      canonical.scene?.game !== this.pack.id ||
      canonical.time !== snapshot.now ||
      canonical.revision !== snapshot.kernel.revision ||
      canonical.revision !== snapshot.tick
    )
      throw new Error("snapshot world does not match session");
    const schema = (items: { id: string; version: number; fields: object }[]) =>
      items
        .filter((item) => !isReservedComponent(item.id))
        .map((item) =>
          JSON.stringify([
            item.id,
            item.version,
            Object.entries(item.fields).sort(),
          ]),
        )
        .sort()
        .join("\n");
    if (schema(canonical.scene.components) !== schema(definition.components))
      throw new Error("snapshot component versions do not match");
    const expected = this.pack.systems
      .map((system) => `${system.id}@${system.version}:${system.consumesImpacts === true}`)
      .join(",");
    const actual = snapshot.systems
      .map((system) => `${system.id}@${system.version}:${system.consumesImpacts === true}`)
      .join(",");
    if (expected !== actual)
      throw new Error("snapshot game system versions do not match");
    this.port.restore(snapshot.kernel);
    this.now = snapshot.now;
    this.tick = snapshot.tick;
    this.random.restore(snapshot.random);
    this.pendingActions = pending;
    this.pendingWrites = pendingWrites;
    this.pendingCreates = pendingCreates;
    this.pendingRemoves = pendingRemoves;
    this.pendingImpacts = pendingImpacts;
    this.impactHighWater = snapshot.impactHighWater;
    this.impactFrontiers = frontiers;
    this.outcomes = outcomes;
    this.cues = cues;
    this.paused = snapshot.paused;
    this.terrainPresentation = undefined;
    this.poisoned = false;
  }
  terrainView() {
    this.ensureLive();
    if (!this.pack.environmentDefinition) return undefined;
    if (!this.terrainPresentation) {
      const definition = JSON.parse(new TextDecoder().decode(this.pack.environmentDefinition)) as EnvironmentDefinition;
      this.terrainPresentation = new TerrainPresentationOwner(this.port, definition);
    }
    return this.terrainPresentation.read();
  }
  presentationCues() {
    this.ensureLive();
    return structuredClone(this.cues.recent);
  }
  renderFacts(limit = 512) {
    this.ensureLive();
    const physical = this.port.renderFacts(limit);
    const project = this.pack.presentation?.visuals;
    if (!project) return physical;
    return appendVisualProjections(physical, project({ query: spec => this.query(spec) }),
      ids => this.port.entityMembership(ids), limit);
  }
}
