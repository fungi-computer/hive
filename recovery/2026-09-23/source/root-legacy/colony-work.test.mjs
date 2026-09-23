var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target2, all) => {
  for (var name in all)
    __defProp(target2, name, { get: all[name], enumerable: true });
};

// engine/src/sdk/authoring.ts
function component(id3, options) {
  if (!id3.includes(".") || options.version < 1)
    throw new Error(`Invalid component ${id3}`);
  const fields = Object.freeze({ ...options.fields });
  return Object.freeze({
    id: id3,
    version: options.version,
    fields,
    validate(value) {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return false;
      return Object.keys(value).length === Object.keys(fields).length && Object.entries(fields).every(
        ([name, type]) => valid(type, value[name])
      );
    }
  });
}
function query(...components) {
  if (!components.length)
    throw new Error("A query must request at least one component");
  return Object.freeze({ components });
}
function system(options) {
  const writes = Object.freeze([...options.writes ?? []]);
  const reads = Object.freeze([...options.reads ?? []]);
  const run = options.run;
  return Object.freeze({
    ...options,
    reads,
    writes,
    run(context) {
      const permitted = new Set(writes.map((c) => c.id));
      const readable = new Set(reads.map((c) => c.id));
      const checked = {
        ...context,
        query(spec) {
          for (const definition of spec.components)
            if (!readable.has(definition.id))
              throw new Error(
                `System ${options.id} cannot read ${definition.id}`
              );
          return context.query(spec);
        },
        write(definition, entity2, value) {
          if (!permitted.has(definition.id))
            throw new Error(
              `System ${options.id} cannot write ${definition.id}`
            );
          if (!definition.validate(value))
            throw new Error(`Invalid ${definition.id} value`);
          context.write(definition, entity2, value);
        },
        action(request) {
          context.action(request);
        },
        createAuthoredEntity(record) {
          for (const component2 of Object.keys(record.components))
            if (!writes.some((definition) => definition.id === component2)) throw new Error(`System ${options.id} cannot create ${component2}`);
          context.createAuthoredEntity(record);
        },
        removeAuthoredEntity(entity2) {
          context.removeAuthoredEntity(entity2);
        }
      };
      run(checked);
    }
  });
}
function command(options) {
  return Object.freeze({
    input: options.input,
    title: options.title,
    category: options.category,
    description: options.description,
    ...options.localPresentation === void 0 ? {} : { localPresentation: Object.freeze({ bindings: Object.freeze(options.localPresentation.bindings.map((binding) => Object.freeze({ ...binding }))) }) },
    ...options.availability === void 0 ? {} : { availability: options.availability },
    ...options.subjects === void 0 ? {} : { subjects: options.subjects },
    lifecycle: Object.freeze([...options.lifecycle ?? []]),
    reads: Object.freeze([...options.reads ?? []]),
    writes: Object.freeze([...options.writes]),
    invoke(context, input) {
      return options.run(context, options.input.parse(input));
    }
  });
}
function entity(id3) {
  if (!id3 || !/^[A-Za-z0-9._:-]+$/.test(id3))
    throw new Error(`Invalid entity id ${id3}`);
  return id3;
}
var valid;
var init_authoring = __esm({
  "engine/src/sdk/authoring.ts"() {
    "use strict";
    valid = (type, value) => type === "nullable-entity" && (value === null || typeof value === "string") || type === "number" && typeof value === "number" && Number.isFinite(value) || type === "boolean" && typeof value === "boolean" || type === "string" && typeof value === "string" || type === "entity" && typeof value === "string";
  }
});

// engine/src/contracts.ts
var RESERVED_COMPONENTS, isReservedComponent;
var init_contracts = __esm({
  "engine/src/contracts.ts"() {
    "use strict";
    RESERVED_COMPONENTS = [
      "hive.stockpile-cell",
      "hive.position",
      "hive.body",
      "hive.traversal",
      "hive.container",
      "hive.sealed-container",
      "hive.ground-stock",
      "hive.construction-site",
      "hive.lot",
      "hive.lot-water",
      "hive.process-binding",
      "hive.finite-resource",
      "hive.resource-site",
      "hive.excavation-work",
      "hive.destination",
      "hive.support",
      "hive.surface",
      "hive.obstacle",
      "hive.visual",
      "hive.collider",
      "hive.launcher",
      "hive.emitter",
      "hive.projectile",
      "hive.impact-material"
    ];
    isReservedComponent = (id3) => RESERVED_COMPONENTS.includes(id3);
  }
});

// engine/src/sdk/common.ts
var Body, Emitter, exchangeFieldWater, Container, Traversal, Position, Support, Surface, MaterialLot, LotWater, FiniteResource, ResourceSite, Destination, move, dropLot, transfer, extractResource, establishResourceSite, tendResourceSite, encodeDefinition, ExcavationWork, excavate, cancelWork;
var init_common = __esm({
  "engine/src/sdk/common.ts"() {
    "use strict";
    init_authoring();
    init_contracts();
    Body = component("hive.body", {
      version: 1,
      fields: { speed: "number" }
    });
    Emitter = component("hive.emitter", {
      version: 1,
      fields: { catalog: "string" }
    });
    exchangeFieldWater = (operation, worker, vessel, cell3, portions = 1) => ({
      kind: "exchange-field-water",
      operation,
      worker,
      vessel,
      ...cell3,
      direction: "withdraw",
      portions
    });
    Container = component("hive.container", {
      version: 1,
      fields: { capacity: "number" }
    });
    Traversal = component("hive.traversal", {
      version: 1,
      fields: { clearanceCells: "number", maxStepCells: "number" }
    });
    Position = component("hive.position", {
      version: 1,
      fields: { x: "number", y: "number", z: "number", facing: "number" }
    });
    Support = component("hive.support", {
      version: 1,
      fields: { entity: "entity" }
    });
    Surface = component("hive.surface", {
      version: 1,
      fields: {
        minX: "number",
        maxX: "number",
        minZ: "number",
        maxZ: "number",
        height: "number"
      }
    });
    MaterialLot = component("hive.lot", {
      version: 1,
      fields: { quantity: "number", kind: "string", container: "entity" }
    });
    LotWater = component("hive.lot-water", {
      version: 1,
      fields: { waterKg: "number" }
    });
    FiniteResource = component("hive.finite-resource", {
      version: 1,
      fields: { kind: "string", quantity: "number" }
    });
    ResourceSite = component("hive.resource-site", {
      version: 1,
      fields: { definition: "string", stage: "number", nextDue: "number" }
    });
    Destination = component("hive.destination", {
      version: 1,
      fields: {
        x: "number",
        y: "number",
        z: "number",
        facing: "number",
        frame: "nullable-entity"
      }
    });
    move = (entity2, destination, facing2 = 0) => ({
      kind: "move",
      entity: entity2,
      destination: {
        x: destination.x,
        y: destination.y,
        z: destination.z,
        frame: destination.frame
      },
      facing: facing2
    });
    dropLot = (entity2, lot) => ({ kind: "drop-lot", entity: entity2, lot });
    transfer = (lot, from, to, quantity2) => ({ kind: "transfer", lot, from, to, quantity: quantity2 });
    extractResource = (operation, worker, source) => ({
      kind: "extract-resource",
      operation,
      worker,
      source
    });
    establishResourceSite = (operation, worker, site, definition, cell3) => ({ kind: "establish-resource-site", operation, worker, site, definition, ...cell3 });
    tendResourceSite = (operation, worker, site, vessel) => ({ kind: "tend-resource-site", operation, worker, site, vessel });
    encodeDefinition = (game, components, initial = []) => new TextEncoder().encode(
      JSON.stringify({
        format: "hive-game",
        version: 1,
        game,
        components: components.filter((c) => !isReservedComponent(c.id)).map((c) => ({ id: c.id, version: c.version, fields: c.fields })),
        initial
      })
    );
    ExcavationWork = component("hive.excavation-work", {
      version: 1,
      fields: { x: "number", y: "number", z: "number", expected: "number", replacement: "number", seconds: "number" }
    });
    excavate = (entity2, cell3, expected, replacement) => ({ kind: "excavate", entity: entity2, ...cell3, expected, replacement });
    cancelWork = (entity2) => ({ kind: "cancel-work", entity: entity2 });
  }
});

// engine/src/runtime/visual-projection.ts
function appendVisualProjections(physical, projections, exists, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 512 || !Array.isArray(projections) || projections.length > limit)
    throw new Error("visual projection exceeds bound");
  const existing = new Map(physical.map((fact) => [fact.id, fact]));
  const ids = /* @__PURE__ */ new Set();
  for (const projection of projections) {
    if (!projection || typeof projection.id !== "string" || !projection.id || projection.id.length > 128 || ids.has(projection.id))
      throw new Error("duplicate or invalid projected entity");
    ids.add(projection.id);
    const original = existing.get(projection.id);
    if (original && (original.visual || original.collision || original.direct || original.aim || original.support))
      throw new Error("visual projection cannot replace an existing visual or dynamic body");
    if (projection.cutawayTop !== void 0 && !Number.isSafeInteger(projection.cutawayTop)) throw new Error("invalid visual cutaway level");
    const point = projection.pose?.position;
    if (!point || ![point.x, point.y, point.z, projection.pose.facing].every(Number.isFinite) || typeof projection.visual !== "string" || !projection.visual || projection.visual.length > 128 || typeof projection.label !== "string" || projection.label.length > 256)
      throw new Error("invalid entity visual projection");
  }
  for (let offset2 = 0; offset2 < projections.length; offset2 += 128) {
    const batch = projections.slice(offset2, offset2 + 128).map((item) => item.id);
    const membership = exists(batch);
    if (membership.length !== batch.length || membership.some((value) => value !== true))
      throw new Error("visual projection references missing entity");
  }
  if (physical.length + projections.filter((item) => !existing.has(item.id)).length > limit) throw new Error("combined visual projection exceeds bound");
  for (const item of projections) existing.set(item.id, {
    ...existing.get(item.id),
    id: item.id,
    visual: item.visual,
    label: item.label,
    pose: { position: { ...item.pose.position }, facing: item.pose.facing },
    view: { pickable: false, ...item.cutawayTop === void 0 ? {} : { cutawayTop: item.cutawayTop } }
  });
  return [...existing.values()];
}
var init_visual_projection = __esm({
  "engine/src/runtime/visual-projection.ts"() {
    "use strict";
  }
});

// engine/src/runtime/terrain-presentation.ts
function residentWindow(bounds, configured) {
  return configured ?? bounds;
}
function signedInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_I32 && value <= MAX_I32;
}
function columnKey(x, z8) {
  return `${x},${z8}`;
}
function parseFacts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid environment facts");
  const facts = value;
  if (!Number.isSafeInteger(facts.terrainRevision) || facts.terrainRevision < 0)
    throw new Error("invalid environment terrain revision");
  if (!Array.isArray(facts.cells)) throw new Error("invalid environment water cells");
  const cells = facts.cells.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("invalid environment water cell");
    const cell3 = raw;
    const at = cell3.at;
    if (!Array.isArray(at) || at.length !== 3 || !at.every(signedInteger) || !Number.isInteger(cell3.level) || cell3.level < 0 || cell3.level > 7 || typeof cell3.massKg !== "number" || !Number.isFinite(cell3.massKg) || cell3.massKg < 0 || typeof cell3.liquidVolumeM3 !== "number" || !Number.isFinite(cell3.liquidVolumeM3) || cell3.liquidVolumeM3 < 0)
      throw new Error("invalid environment water cell values");
    for (const field of ["capacityKg", "mobileKg", "moisture"])
      if (field in cell3 && (typeof cell3[field] !== "number" || !Number.isFinite(cell3[field])))
        throw new Error("invalid environment water cell values");
    return Object.freeze({
      ...cell3,
      at: Object.freeze([at[0], at[1], at[2]])
    });
  });
  return {
    terrainRevision: facts.terrainRevision,
    cells: Object.freeze(cells)
  };
}
function validateDefinition(definition, configured) {
  const bounds = definition?.world?.bounds;
  const values = bounds && [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ];
  if (!values || !values.every(Number.isSafeInteger) || bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ)
    throw new Error("invalid terrain presentation bounds");
  const window = residentWindow(bounds, configured);
  if (!window || ![window.minX, window.maxX, window.minZ, window.maxZ].every(Number.isSafeInteger) || window.minX < bounds.minX || window.maxX > bounds.maxX || window.minZ < bounds.minZ || window.maxZ > bounds.maxZ || window.minX >= window.maxX || window.minZ >= window.maxZ)
    throw new Error("invalid terrain presentation window");
  const columns = (window.maxX - window.minX) * (window.maxZ - window.minZ);
  if (!Number.isSafeInteger(columns) || columns < 1 || columns > MAX_COLUMNS)
    throw new Error("terrain presentation exceeds the column budget");
  if (!Number.isFinite(definition.world.verticalMetres) || definition.world.verticalMetres <= 0)
    throw new Error("invalid terrain presentation vertical scale");
}
var MIN_I32, MAX_I32, MAX_COLUMNS, SURFACE_BATCH, MAX_STRUCTURE_SURFACES, TerrainPresentationOwner;
var init_terrain_presentation = __esm({
  "engine/src/runtime/terrain-presentation.ts"() {
    "use strict";
    MIN_I32 = -2147483648;
    MAX_I32 = 2147483647;
    MAX_COLUMNS = 4096;
    SURFACE_BATCH = 64;
    MAX_STRUCTURE_SURFACES = 16384;
    TerrainPresentationOwner = class {
      constructor(port, definition, configuredWindow) {
        this.port = port;
        this.definition = definition;
        this.configuredWindow = configuredWindow;
        validateDefinition(definition, configuredWindow);
      }
      port;
      definition;
      configuredWindow;
      cached;
      reset() {
        this.cached = void 0;
      }
      read() {
        const facts = parseFacts(this.port.environmentFacts());
        if (!this.cached) this.cached = this.sampleSurfaces(facts.terrainRevision);
        else if (this.cached.revision !== facts.terrainRevision) {
          const changes = this.port.terrainChanges(this.cached.revision);
          if (changes.revision !== facts.terrainRevision)
            throw new Error("terrain change revision does not match environment facts");
          this.cached = changes.kind === "full-reset" ? this.sampleSurfaces(facts.terrainRevision) : this.patchSurfaces(this.cached, facts.terrainRevision, changes);
        }
        const water = facts.cells.filter((cell3) => this.isExteriorWater(cell3));
        return Object.freeze({
          revision: facts.terrainRevision,
          verticalMetres: this.definition.world.verticalMetres,
          surfaces: this.cached.surfaces,
          structureSurfaces: this.cached.structureSurfaces,
          water: Object.freeze(water)
        });
      }
      sampleSurfaces(revision) {
        const columns = this.columns();
        const sampled = this.sampleColumns(columns);
        return this.assemble(revision, columns, sampled.byColumn, sampled.structuresByColumn);
      }
      patchSurfaces(cached, revision, changes) {
        const seen = /* @__PURE__ */ new Set();
        for (const column of changes.columns) {
          const key = columnKey(column[0], column[1]);
          if (!this.inBounds(column) || seen.has(key)) throw new Error("invalid terrain changed column");
          seen.add(key);
        }
        const sampled = this.sampleColumns(changes.columns.map(([x, z8]) => [x, z8]));
        const byColumn = new Map(cached.byColumn);
        const structuresByColumn = new Map(cached.structuresByColumn);
        for (const column of changes.columns) {
          const key = columnKey(column[0], column[1]);
          byColumn.set(key, sampled.byColumn.get(key) ?? null);
          structuresByColumn.set(key, sampled.structuresByColumn.get(key) ?? []);
        }
        return this.assemble(revision, this.columns(), byColumn, structuresByColumn);
      }
      columns() {
        const { minX, maxX, minZ, maxZ } = residentWindow(this.definition.world.bounds, this.configuredWindow);
        const columns = [];
        for (let x = minX; x < maxX; x++)
          for (let z8 = minZ; z8 < maxZ; z8++) columns.push([x, z8]);
        return columns;
      }
      inBounds(column) {
        const { minX, maxX, minZ, maxZ } = residentWindow(this.definition.world.bounds, this.configuredWindow);
        return column[0] >= minX && column[0] < maxX && column[1] >= minZ && column[1] < maxZ;
      }
      sampleColumns(columns) {
        const byColumn = /* @__PURE__ */ new Map();
        const structuresByColumn = /* @__PURE__ */ new Map();
        for (let offset2 = 0; offset2 < columns.length; offset2 += SURFACE_BATCH) {
          const batch = columns.slice(offset2, offset2 + SURFACE_BATCH);
          const result = this.port.terrainSurfaces(batch);
          const structures = this.port.structureSurfaces(batch);
          if (result.length !== batch.length) throw new Error("terrain surface query returned the wrong count");
          if (structures.length !== batch.length) throw new Error("structure surface query returned the wrong count");
          for (let index = 0; index < batch.length; index++) {
            const column = batch[index];
            const surface = result[index];
            if (surface !== null) {
              const cell3 = surface.cell;
              if (cell3[0] !== column[0] || cell3[2] !== column[1] || !signedInteger(cell3[1]) || !Number.isInteger(surface.material) || surface.material < 0 || surface.material > 65535)
                throw new Error("invalid terrain surface projection");
              byColumn.set(columnKey(column[0], column[1]), Object.freeze({
                cell: Object.freeze([cell3[0], cell3[1], cell3[2]]),
                material: surface.material,
                generatedTop: surface.generatedTop
              }));
            } else byColumn.set(columnKey(column[0], column[1]), null);
            const parsed = [];
            const seenHeights = /* @__PURE__ */ new Set();
            if (!Array.isArray(structures[index])) throw new Error("invalid structure surface projection");
            for (const surface2 of structures[index]) {
              const cell3 = surface2?.cell;
              if (!cell3 || cell3.length !== 3 || cell3[0] !== column[0] || cell3[2] !== column[1] || !signedInteger(cell3[1]))
                throw new Error("invalid structure surface projection");
              if (seenHeights.has(cell3[1])) throw new Error("duplicate structure surface projection");
              seenHeights.add(cell3[1]);
              parsed.push(Object.freeze({ cell: Object.freeze([cell3[0], cell3[1], cell3[2]]) }));
            }
            structuresByColumn.set(columnKey(column[0], column[1]), Object.freeze(parsed));
          }
        }
        return { byColumn, structuresByColumn };
      }
      assemble(revision, columns, byColumn, structuresByColumn) {
        const surfaces = [];
        const structureSurfaces = [];
        for (const column of columns) {
          const key = columnKey(column[0], column[1]);
          const surface = byColumn.get(key);
          if (surface !== void 0 && surface !== null) surfaces.push(surface);
          const structures = structuresByColumn.get(key);
          if (!structures) throw new Error("terrain structure projection is missing a column");
          if (structureSurfaces.length + structures.length > MAX_STRUCTURE_SURFACES)
            throw new Error("structure surface projection exceeds the budget");
          structureSurfaces.push(...structures);
        }
        return {
          revision,
          surfaces: Object.freeze(surfaces),
          byColumn,
          structuresByColumn,
          structureSurfaces: Object.freeze(structureSurfaces)
        };
      }
      isExteriorWater(cell3) {
        const { minX, maxX, minY, maxY, minZ, maxZ } = this.definition.world.bounds;
        const [x, y, z8] = cell3.at;
        if (x < minX || x >= maxX || z8 < minZ || z8 >= maxZ || y < minY || y >= maxY) return false;
        const surface = this.cached?.byColumn.get(columnKey(x, z8));
        return surface === null || surface !== void 0 && y >= surface.cell[1];
      }
    };
  }
});

// engine/src/runtime/whistle.ts
import { createWhistle } from "@fungi.computer/whistle";
import { parse as parseAgentProjection } from "@fungi.computer/whistle/wire";
import { toJSONSchema, z as z5 } from "zod";
function availability(value) {
  if (value === void 0 || value.status === "available") return { status: "available" };
  if (value.reason.trim().length === 0) throw new Error("Whistle availability reason must not be blank");
  return { status: "unavailable", reason: value.reason };
}
function stableSubjects(value) {
  if (value === void 0 || value.length === 0) return [];
  const subjects = [...new Set(value)];
  if (subjects.length > 128 || subjects.some((id3) => id3.length > 128 || entity(id3) !== id3))
    throw new Error("invalid Whistle contextual subject");
  return subjects;
}
function jsonValue(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, jsonValue(nested)]));
  throw new Error("Whistle schema must be JSON");
}
function inputSchema(input) {
  const value = z5.json().parse(toJSONSchema(input, { io: "input" }));
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Whistle input schema must be an object");
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, jsonValue(nested)]));
}
function createWhistleObservationProjector(pack) {
  const whistle = createWhistle();
  let currentContext;
  let revision = 0;
  let previousAgentSignature;
  let previousTargets;
  let previous;
  const commands = Object.entries(pack.commands ?? {}).map(([id3, definition], order) => ({
    id: id3,
    title: definition.title,
    category: definition.category,
    description: definition.description,
    projections: { agent: { order } },
    action: { inputSchema: inputSchema(definition.input) },
    availability: () => {
      if (currentContext === void 0) throw new Error("Whistle projection context is unavailable");
      return availability(definition.availability?.(currentContext));
    },
    // Agent projections are discovery only. Admission remains the durable
    // runtime command boundary and is never routed through this projection.
    handler: () => void 0
  }));
  whistle.contribute({ sourceId: `hive.${pack.id}`, namespace: pack.id, commands });
  return Object.freeze({
    project(context) {
      currentContext = context;
      const agentSource = whistle.snapshot().agent;
      const agentSignature = agentSource.map((row2) => `${row2.commandId}\0${row2.availability.status}\0${row2.availability.status === "unavailable" ? row2.availability.reason : ""}`).join("");
      const targets = Object.entries(pack.commands ?? {}).flatMap(([name, definition]) => {
        const subjects = stableSubjects(definition.subjects?.(context));
        return subjects.length === 0 ? [] : [{ commandId: `${pack.id}:${name}`, subjects }];
      });
      const sameTargets = previousTargets !== void 0 && previousTargets.length === targets.length && previousTargets.every((candidate, index) => candidate.commandId === targets[index].commandId && candidate.subjects.length === targets[index].subjects.length && candidate.subjects.every((id3, subjectIndex) => id3 === targets[index].subjects[subjectIndex]));
      if (previous && previousAgentSignature === agentSignature && sameTargets) return previous;
      revision++;
      const agent = previous && previousAgentSignature === agentSignature ? previous.agent : parseAgentProjection(agentSource);
      const projection = Object.freeze({ agent, targets: Object.freeze(targets), revision });
      previousAgentSignature = agentSignature;
      previousTargets = projection.targets;
      previous = projection;
      return projection;
    }
  });
}
var init_whistle = __esm({
  "engine/src/runtime/whistle.ts"() {
    "use strict";
    init_authoring();
  }
});

// engine/src/runtime/presentation-cues.ts
function isPresentationCue(value) {
  if (!value || typeof value !== "object") return false;
  const cue = value;
  return Number.isSafeInteger(cue.sequence) && cue.sequence > 0 && Number.isFinite(cue.time) && cue.time >= 0 && (cue.kind === "launch" || cue.kind === "impact") && identity(cue.subject) && identity(cue.source) && vector(cue.at) && vector(cue.direction);
}
function checkedCueSnapshot(value, now) {
  if (!value || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || !Array.isArray(value.recent) || value.recent.length > MAX_CUES)
    throw new Error("invalid presentation cue snapshot");
  let previous = 0;
  for (const cue of value.recent) {
    if (!isPresentationCue(cue) || cue.sequence <= previous || cue.sequence > value.sequence || cue.time > now + 1e-9 || cue.time < now - RETENTION_SECONDS - 1e-9)
      throw new Error("invalid presentation cue frontier");
    previous = cue.sequence;
  }
  return structuredClone(value);
}
function appendPresentationCues(before, now, outcomes, impacts) {
  let sequence = before.sequence;
  const recent = before.recent.filter((cue) => cue.time >= now - RETENTION_SECONDS);
  const append = (cue) => {
    if (!Number.isSafeInteger(sequence + 1)) throw new Error("presentation cue sequence exhausted");
    recent.push({ ...cue, sequence: ++sequence });
  };
  for (const { action, result } of outcomes) {
    if (action.kind !== "launch" || !result.accepted) continue;
    if (!vector(result.launchPoint)) throw new Error("accepted launch lacks launch point");
    append({
      kind: "launch",
      time: now,
      subject: action.launcher,
      source: action.launcher,
      at: result.launchPoint,
      direction: action.velocity
    });
  }
  for (const impact of impacts)
    append({
      kind: "impact",
      time: impact.time,
      subject: impact.targetId,
      source: impact.sourceId,
      at: impact.point,
      direction: impact.velocity
    });
  return checkedCueSnapshot({ sequence, recent: recent.slice(-MAX_CUES) }, now);
}
var MAX_CUES, RETENTION_SECONDS, identity, vector;
var init_presentation_cues = __esm({
  "engine/src/runtime/presentation-cues.ts"() {
    "use strict";
    MAX_CUES = 64;
    RETENTION_SECONDS = 3;
    identity = (value) => typeof value === "string" && value.length > 0 && value.length <= 160;
    vector = (value) => {
      if (!value || typeof value !== "object") return false;
      const v = value;
      return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
    };
  }
});

// engine/src/runtime/actions.ts
function checkedAction(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid action");
  const action = value;
  let keys;
  let valid2 = false;
  switch (action.kind) {
    case "establish-resource-site":
      keys = ["kind", "operation", "worker", "site", "definition", "x", "y", "z"];
      valid2 = id(action.operation) && id(action.worker) && id(action.site) && id(action.definition) && [action.x, action.y, action.z].every((value2) => Number.isSafeInteger(value2));
      break;
    case "tend-resource-site":
      keys = ["kind", "operation", "worker", "site", "vessel"];
      valid2 = id(action.operation) && id(action.worker) && id(action.site) && id(action.vessel);
      break;
    case "request-process":
      keys = ["kind", "definition", "station"];
      valid2 = id(action.definition) && id(action.station);
      break;
    case "attend-process":
      keys = ["kind", "worker", "process"];
      valid2 = id(action.worker) && id(action.process);
      break;
    case "admit-process":
      keys = ["kind", "process", "definition", "station"];
      valid2 = id(action.process) && id(action.definition) && id(action.station);
      break;
    case "designate-stockpile": {
      keys = ["kind", "zone", "cells"];
      const cells = action.cells;
      valid2 = id(action.zone) && Array.isArray(cells) && cells.length > 0 && cells.length <= 256 && cells.every((cell3) => {
        if (!cell3 || typeof cell3 !== "object" || Array.isArray(cell3)) return false;
        const value2 = cell3;
        return Object.keys(value2).length === 6 && [value2.x, value2.y, value2.z].every((item) => typeof item === "number" && Number.isSafeInteger(item)) && quantity(value2.priority) && quantity(value2.capacity) && stream(value2.filterProfile);
      });
      break;
    }
    case "update-stockpile":
      keys = ["kind", "zone", "filterProfile", "priority"];
      valid2 = id(action.zone) && stream(action.filterProfile) && quantity(action.priority);
      break;
    case "plan-construction": {
      keys = ["kind", "catalog", "site", "x", "y", "z", "orientation"];
      valid2 = id(action.catalog) && id(action.site) && [action.x, action.z].every((value2) => typeof value2 === "number" && Number.isSafeInteger(value2)) && typeof action.y === "number" && Number.isInteger(action.y) && action.y >= -2147483648 && action.y <= 2147483647 && ["north", "east", "south", "west"].includes(action.orientation);
      break;
    }
    case "bind-construction-stage":
      keys = ["kind", "site", "contact"];
      valid2 = id(action.site) && terrainContact(action.contact);
      break;
    case "set-structure-open":
      keys = ["kind", "worker", "site", "open"];
      valid2 = id(action.worker) && id(action.site) && typeof action.open === "boolean";
      break;
    case "attend-construction":
      keys = ["kind", "worker", "site", "contact"];
      valid2 = id(action.worker) && id(action.site) && terrainContact(action.contact);
      break;
    case "deconstruct":
      keys = ["kind", "worker", "site"];
      valid2 = id(action.worker) && id(action.site);
      break;
    case "excavate":
      keys = ["kind", "entity", "x", "y", "z", "expected", "replacement"];
      valid2 = id(action.entity) && [action.x, action.y, action.z].every((value2) => coordinate(value2) && Number.isInteger(value2)) && [action.expected, action.replacement].every((value2) => typeof value2 === "number" && Number.isInteger(value2) && value2 >= 0 && value2 <= 65535) && action.expected !== action.replacement;
      break;
    case "cancel-work":
      keys = ["kind", "entity"];
      valid2 = id(action.entity);
      break;
    case "begin-direct":
      keys = ["kind", "entity", "stream"];
      valid2 = id(action.entity) && stream(action.stream);
      break;
    case "begin-emission":
      keys = ["kind", "worker", "station"];
      valid2 = id(action.worker) && id(action.station);
      break;
    case "exchange-field-water":
      keys = ["kind", "operation", "worker", "vessel", "x", "y", "z", "direction", "portions"];
      valid2 = id(action.operation) && id(action.worker) && id(action.vessel) && [action.x, action.y, action.z].every((value2) => typeof value2 === "number" && Number.isSafeInteger(value2)) && (action.direction === "withdraw" || action.direction === "deposit") && typeof action.portions === "number" && Number.isInteger(action.portions) && action.portions >= 1 && action.portions <= 7;
      break;
    case "direct-input": {
      keys = ["kind", "entity", "stream", "inputs"];
      const inputs = action.inputs;
      valid2 = id(action.entity) && stream(action.stream) && Array.isArray(inputs) && inputs.length >= 1 && inputs.length <= 50 && inputs.every((input, index) => directSample(input) && (index === 0 || input.sequence === inputs[index - 1].sequence + 1));
      break;
    }
    case "launch":
    case "displace": {
      const launch = action.kind === "launch";
      keys = launch ? ["kind", "launcher", "ammunition", "velocity"] : ["kind", "entity", "delta"];
      const vector2 = action[launch ? "velocity" : "delta"];
      valid2 = (launch ? id(action.launcher) && id(action.ammunition) : id(action.entity)) && !!vector2 && typeof vector2 === "object" && !Array.isArray(vector2) && Object.keys(vector2).length === 3 && coordinate(vector2.x) && coordinate(vector2.y) && coordinate(vector2.z);
      break;
    }
    case "move": {
      keys = ["kind", "entity", "destination", "facing"];
      const at = action.destination;
      valid2 = id(action.entity) && !!at && typeof at === "object" && Object.keys(at).length === 4 && coordinate(at.x) && coordinate(at.y) && coordinate(at.z) && (at.frame === null || id(at.frame)) && (action.facing === void 0 || coordinate(action.facing));
      break;
    }
    case "drop-lot":
      keys = ["kind", "entity", "lot"];
      valid2 = id(action.entity) && id(action.lot);
      break;
    case "transfer":
      keys = ["kind", "lot", "from", "to", "quantity"];
      valid2 = id(action.lot) && id(action.from) && id(action.to) && quantity(action.quantity);
      break;
    case "consume":
      keys = ["kind", "entity", "lot", "quantity"];
      valid2 = id(action.entity) && id(action.lot) && quantity(action.quantity);
      break;
    case "extract-resource":
      keys = ["kind", "operation", "worker", "source"];
      valid2 = id(action.operation) && id(action.worker) && id(action.source);
      break;
    default:
      throw new Error("unsupported action kind");
  }
  if (!valid2 || Object.keys(action).some((key) => !keys.includes(key)))
    throw new Error("invalid action fields");
  return structuredClone(action);
}
var id, coordinate, quantity, stream, axis, directSample, terrainContact;
var init_actions = __esm({
  "engine/src/runtime/actions.ts"() {
    "use strict";
    id = (value) => typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
    coordinate = (value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e6;
    quantity = (value) => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 4294967295;
    stream = (value) => typeof value === "string" && value.length > 0 && value.length <= 64 && /^[A-Za-z0-9._:-]+$/.test(value);
    axis = (value) => typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1;
    directSample = (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const sample = value;
      return Object.keys(sample).length === 3 && typeof sample.sequence === "number" && Number.isSafeInteger(sample.sequence) && sample.sequence > 0 && axis(sample.x) && axis(sample.z);
    };
    terrainContact = (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const contact = value;
      return Object.keys(contact).length === 4 && contact.frame === null && coordinate(contact.x) && coordinate(contact.y) && coordinate(contact.z);
    };
  }
});

// engine/src/runtime/kernel-records.ts
function isSafeRevision(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isFiniteTime(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function keyAllowed(key) {
  if (key.length === 0 || key.length > MAX_KEY_BYTES || !/^[\x20-\x7e]+$/.test(key)) return false;
  if (key.startsWith(ENTITY_PREFIX)) {
    const suffix = key.slice(ENTITY_PREFIX.length);
    return /^\d{4}$/.test(suffix) && Number(suffix) < 32;
  }
  if (key.startsWith(ATMOSPHERE_PREFIX)) {
    const suffix = key.slice(ATMOSPHERE_PREFIX.length);
    return /^\d{4}$/.test(suffix) && Number(suffix) < 9;
  }
  return key === "kernel/header" || ENVIRONMENT_KEYS.includes(key);
}
function validateKeyList(keys) {
  if (keys.length > MAX_RECORDS) throw new Error("record count exceeds bound");
  const seen = /* @__PURE__ */ new Set();
  for (const key of keys) {
    if (typeof key !== "string" || !keyAllowed(key) || seen.has(key)) throw new Error("invalid native record key");
    seen.add(key);
  }
  if (!seen.has("kernel/header")) throw new Error("missing native record header");
  const environment = ENVIRONMENT_KEYS.some((key) => seen.has(key));
  if (environment !== ENVIRONMENT_KEYS.every((key) => seen.has(key))) throw new Error("environment record set is incomplete");
  const airKeys = [...seen].filter((key) => key.startsWith(ATMOSPHERE_PREFIX)).sort();
  if (airKeys.length && (!environment || airKeys.some((key, index) => key !== `${ATMOSPHERE_PREFIX}${String(index).padStart(4, "0")}`)))
    throw new Error("atmosphere record set is incomplete");
}
function decodeEntities(records) {
  const chunks = records.filter(({ key }) => key.startsWith(ENTITY_PREFIX)).sort((a, b) => Number(a.key.slice(-4)) - Number(b.key.slice(-4)));
  if (chunks.length === 0 || chunks.some(({ key }, index) => key !== `${ENTITY_PREFIX}${String(index).padStart(4, "0")}`)) throw new Error("entity chunks are incomplete");
  const total2 = chunks.reduce((sum, record) => sum + record.bytes.byteLength, 0);
  if (total2 > ENTITY_BYTES) throw new Error("entity records exceed 8MiB");
  const bytes = new Uint8Array(total2);
  let offset2 = 0;
  for (const chunk of chunks) {
    bytes.set(chunk.bytes, offset2);
    offset2 += chunk.bytes.byteLength;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("entity records are not JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("entity records are not an object");
  const value = parsed;
  if (value.format !== "hive-kernel" || value.version !== 7 || !isSafeRevision(value.revision) || !isFiniteTime(value.time) || !value.scene || value.scene.format !== "hive-game" || value.scene.version !== 1 || typeof value.scene.game !== "string" || !Array.isArray(value.scene.components) || !Array.isArray(value.scene.initial)) throw new Error("unsupported kernel entity snapshot");
  return { text, parsed: value };
}
function preflightRecords(records) {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) throw new Error("record count exceeds bound");
  const seen = /* @__PURE__ */ new Set();
  let total2 = 0;
  for (const record of records) {
    if (!record || typeof record.key !== "string" || !keyAllowed(record.key) || seen.has(record.key) || !(record.bytes instanceof Uint8Array) || record.bytes.byteLength > RECORD_BYTES || record.key === "kernel/header" && record.bytes.byteLength > 65568 || record.key === "kernel/environment/header" && record.bytes.byteLength > 65568 || record.key === "kernel/environment/definition" && record.bytes.byteLength > 128 * 1024) throw new Error("invalid kernel record");
    seen.add(record.key);
    total2 += record.bytes.byteLength;
  }
  if (total2 > TOTAL_BYTES) throw new Error("kernel record bytes exceed 9MiB");
  if (!seen.has("kernel/header")) throw new Error("missing native record header");
  const environment = ENVIRONMENT_KEYS.some((key) => seen.has(key));
  if (environment !== ENVIRONMENT_KEYS.every((key) => seen.has(key))) throw new Error("environment record set is incomplete");
  const airKeys = [...seen].filter((key) => key.startsWith(ATMOSPHERE_PREFIX)).sort();
  if (airKeys.length && (!environment || airKeys.some((key, index) => key !== `${ATMOSPHERE_PREFIX}${String(index).padStart(4, "0")}`)))
    throw new Error("atmosphere record set is incomplete");
  const definition = records.find((record) => record.key === ENVIRONMENT_KEYS[0]);
  if (definition) new TextDecoder("utf-8", { fatal: true }).decode(definition.bytes);
  const entities = decodeEntities(records);
  return entities.parsed;
}
function validateSnapshot(snapshot) {
  if (snapshot.format !== "hive-kernel-records" || snapshot.version !== 1 || !isSafeRevision(snapshot.revision) || !isFiniteTime(snapshot.time) || !Array.isArray(snapshot.records)) throw new Error("unsupported kernel record snapshot");
  const entities = preflightRecords(snapshot.records);
  if (entities.revision !== snapshot.revision || entities.time !== snapshot.time) throw new Error("record metadata does not match entity snapshot");
  return { entities };
}
function captureKernelRecords(binding) {
  const handle = binding.capture_records();
  try {
    let keys;
    try {
      keys = JSON.parse(handle.keys());
    } catch {
      throw new Error("native record keys are not JSON");
    }
    if (!Array.isArray(keys)) throw new Error("native record keys are not an array");
    validateKeyList(keys);
    const records = keys.map((key) => ({ key, bytes: handle.read(key) }));
    const provisional = { format: "hive-kernel-records", version: 1, revision: 0, time: 0, records };
    const entities = preflightRecords(records);
    const snapshot = { ...provisional, revision: entities.revision, time: entities.time };
    return snapshot;
  } finally {
    handle.free();
  }
}
function readKernelEntities(snapshot) {
  return validateSnapshot(snapshot).entities;
}
function restoreKernelRecords(binding, makeHandle, snapshot) {
  validateSnapshot(snapshot);
  const handle = makeHandle();
  try {
    for (const record of snapshot.records) handle.insert(record.key, record.bytes);
  } catch (error) {
    handle.free();
    throw error;
  }
  binding.restore_records(handle);
}
var RECORD_BYTES, ENTITY_BYTES, TOTAL_BYTES, MAX_RECORDS, MAX_KEY_BYTES, ENTITY_PREFIX, ATMOSPHERE_PREFIX, ENVIRONMENT_KEYS;
var init_kernel_records = __esm({
  "engine/src/runtime/kernel-records.ts"() {
    "use strict";
    RECORD_BYTES = 256 * 1024;
    ENTITY_BYTES = 8 * 1024 * 1024;
    TOTAL_BYTES = 9 * 1024 * 1024;
    MAX_RECORDS = 48;
    MAX_KEY_BYTES = 80;
    ENTITY_PREFIX = "kernel/entities/";
    ATMOSPHERE_PREFIX = "kernel/atmosphere/";
    ENVIRONMENT_KEYS = [
      "kernel/environment/definition",
      "kernel/environment/header",
      "kernel/environment/terrain",
      "kernel/environment/water",
      "kernel/environment/structures"
    ];
  }
});

// engine/src/sdk/assignment.ts
function checkedAssignments(candidates, maxEdges = ASSIGNMENT_MAX_EDGES) {
  if (!Array.isArray(candidates) || !Number.isSafeInteger(maxEdges) || maxEdges < 1 || maxEdges > ASSIGNMENT_MAX_EDGES || candidates.length > ASSIGNMENT_MAX_EDGES) {
    throw new Error("invalid assignment batch");
  }
  const detached = [];
  for (const candidate of candidates) {
    if (candidate === null || typeof candidate !== "object" || Object.keys(candidate).length !== 3 || !Object.hasOwn(candidate, "worker") || !Object.hasOwn(candidate, "task") || !Object.hasOwn(candidate, "cost")) {
      throw new Error("invalid assignment candidate");
    }
    const value = candidate;
    if (!validId(value.worker) || !validId(value.task) || typeof value.cost !== "number" || !Number.isFinite(value.cost) || value.cost < 0) {
      throw new Error("invalid assignment candidate");
    }
    detached.push({
      worker: value.worker,
      task: value.task,
      cost: value.cost
    });
  }
  const bytes = new TextEncoder().encode(
    JSON.stringify({ candidates: detached, max_edges: maxEdges })
  ).byteLength;
  if (bytes > ASSIGNMENT_MAX_BYTES) throw new Error("assignment batch too large");
  return detached;
}
var ASSIGNMENT_MAX_EDGES, ASSIGNMENT_MAX_BYTES, validId;
var init_assignment = __esm({
  "engine/src/sdk/assignment.ts"() {
    "use strict";
    ASSIGNMENT_MAX_EDGES = 64 * 256;
    ASSIGNMENT_MAX_BYTES = 8 * 1024 * 1024;
    validId = (value) => typeof value === "string" && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
  }
});

// engine/src/runtime/session.ts
var session_exports = {};
__export(session_exports, {
  GameSession: () => GameSession
});
function checkedAuthoredId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]+$/.test(value) || value.length > 128)
    throw new Error("invalid authored entity id");
  return value;
}
function finiteVec3(value) {
  return Boolean(value) && typeof value === "object" && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}
function checkedImpact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid physical impact");
  const impact = value;
  const allowed = /* @__PURE__ */ new Set([
    "id",
    "sequence",
    "projectileId",
    "sourceId",
    "targetId",
    "time",
    "point",
    "normal",
    "velocity"
  ]);
  if (Object.keys(impact).some((key) => !allowed.has(key)))
    throw new Error("invalid physical impact fields");
  for (const field of ["id", "sourceId", "targetId"])
    if (typeof impact[field] !== "string" || impact[field].length === 0 || impact[field].length > 160)
      throw new Error("invalid physical impact identity");
  if (impact.projectileId !== void 0 && (typeof impact.projectileId !== "string" || impact.projectileId.length === 0 || impact.projectileId.length > 160))
    throw new Error("invalid physical projectile identity");
  if (typeof impact.sequence !== "number" || !Number.isSafeInteger(impact.sequence) || impact.sequence < 1 || typeof impact.time !== "number" || !Number.isFinite(impact.time) || impact.time < 0 || !finiteVec3(impact.point) || !finiteVec3(impact.normal) || !finiteVec3(impact.velocity))
    throw new Error("invalid physical impact geometry");
  return structuredClone(value);
}
var DeterministicRandom, MAX_PENDING_IMPACTS, MAX_AUTHORED_RECORDS, MAX_AUTHORED_REMOVES, GameSession;
var init_session = __esm({
  "engine/src/runtime/session.ts"() {
    "use strict";
    init_visual_projection();
    init_terrain_presentation();
    init_whistle();
    init_presentation_cues();
    init_contracts();
    init_actions();
    init_kernel_records();
    init_common();
    init_assignment();
    DeterministicRandom = class {
      value;
      constructor(seed) {
        this.value = seed >>> 0;
      }
      next() {
        this.value = Math.imul(1664525, this.value) + 1013904223 | 0;
        return (this.value >>> 0) / 4294967296;
      }
      state() {
        return this.value >>> 0;
      }
      restore(value) {
        if (!Number.isInteger(value) || value < 0 || value > 4294967295)
          throw new Error("invalid random state");
        this.value = value >>> 0;
      }
    };
    MAX_PENDING_IMPACTS = 1024;
    MAX_AUTHORED_RECORDS = 256;
    MAX_AUTHORED_REMOVES = 256;
    GameSession = class {
      routeRequestsLastStep = 0;
      get lastStepMetrics() {
        return { routeRequests: this.routeRequestsLastStep, assignmentCost: null };
      }
      pack;
      port;
      random;
      seed;
      paused = false;
      now = 0;
      tick = 0;
      outcomes = [];
      pendingActions = [];
      pendingWrites = [];
      pendingCreates = [];
      pendingRemoves = [];
      pendingImpacts = [];
      impactHighWater = 0;
      cues = { sequence: 0, recent: [] };
      impactFrontiers = /* @__PURE__ */ new Map();
      poisoned = true;
      terrainPresentation;
      whistleProjection;
      constructor(options) {
        this.pack = options.pack;
        this.port = options.port;
        this.seed = (options.seed ?? 1) >>> 0;
        this.random = new DeterministicRandom(this.seed);
        this.whistleProjection = createWhistleObservationProjector(this.pack);
        const consumers = /* @__PURE__ */ new Set();
        for (const system2 of this.pack.systems) {
          if (consumers.has(system2.id))
            throw new Error("duplicate system identity");
          consumers.add(system2.id);
          if (system2.consumesImpacts) this.impactFrontiers.set(system2.id, null);
        }
        const writeOwners = /* @__PURE__ */ new Map();
        for (const system2 of this.pack.systems)
          for (const definition of system2.writes) {
            const owner = writeOwners.get(definition.id);
            if (owner !== void 0 && owner !== system2.id)
              throw new Error(
                `duplicate system write authority for ${definition.id}: ${owner} and ${system2.id}`
              );
            writeOwners.set(definition.id, system2.id);
          }
        for (const definition of Object.values(this.pack.commands ?? {})) {
          const commandWrites = new Set(
            definition.writes.map((component2) => component2.id)
          );
          if (this.pack.systems.some(
            (system2) => system2.writes.some((component2) => commandWrites.has(component2.id))
          ))
            throw new Error("command and system write ownership overlaps");
        }
      }
      start() {
        this.terrainPresentation = void 0;
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
          this.pack.systems.filter((system2) => system2.consumesImpacts).map((system2) => [system2.id, null])
        );
        this.port.load(this.pack.definition);
        if (this.pack.environmentDefinition)
          this.port.loadEnvironment(this.pack.environmentDefinition);
        if (this.pack.initialActions)
          this.pendingActions.push(...this.pack.initialActions);
        this.poisoned = false;
      }
      ensureLive() {
        if (this.poisoned) throw new Error("session-poisoned");
      }
      pause() {
        this.ensureLive();
        this.paused = true;
      }
      resume() {
        this.ensureLive();
        this.paused = false;
      }
      get isPaused() {
        this.ensureLive();
        return this.paused;
      }
      get simulationTime() {
        this.ensureLive();
        return this.now;
      }
      reset() {
        this.start();
      }
      whistleObservation(context) {
        this.ensureLive();
        return this.whistleProjection.project(context);
      }
      atmosphereSamples(cells) {
        this.ensureLive();
        return this.port.atmosphereSamples(cells);
      }
      constructionReadiness(sites) {
        this.ensureLive();
        return this.port.constructionReadiness(sites);
      }
      constructionAccess(sites) {
        this.ensureLive();
        return this.port.constructionAccess(sites);
      }
      environmentFacts() {
        this.ensureLive();
        return this.port.environmentFacts();
      }
      terrainSurfaces(columns) {
        this.ensureLive();
        return this.port.terrainSurfaces(columns);
      }
      waterContacts(centers) {
        this.ensureLive();
        return this.port.waterContacts(centers);
      }
      query(spec) {
        this.ensureLive();
        return this.port.query(spec);
      }
      assign(candidates, maxEdges = ASSIGNMENT_MAX_EDGES) {
        this.ensureLive();
        return this.port.assign(candidates, maxEdges);
      }
      worldPoses(entities, reads) {
        const declared = new Set(reads.map((component2) => component2.id));
        if (!declared.has(Position.id) || !declared.has(Support.id) || !declared.has(Surface.id))
          throw new Error(
            "world poses require hive.position, hive.support, and hive.surface reads"
          );
        if (entities.length === 0) throw new Error("world pose query requires an entity");
        const poses = [];
        for (let offset2 = 0; offset2 < entities.length; offset2 += 128)
          poses.push(...this.port.worldPoses(entities.slice(offset2, offset2 + 128)));
        return poses;
      }
      request(action) {
        this.ensureLive();
        if (this.pendingActions.length >= 128)
          throw new Error("pending action limit reached");
        this.pendingActions.push(checkedAction(action));
      }
      command(name, input) {
        this.ensureLive();
        const handler = this.pack.commands?.[name];
        if (!handler || !Object.hasOwn(this.pack.commands ?? {}, name))
          throw new Error("unknown game command");
        const reads = new Set(
          (handler.reads ?? []).map((component2) => component2.id)
        );
        const result = handler.invoke(
          {
            physicalContacts: (cells) => this.port.physicalContacts(cells),
            query: (spec) => {
              for (const component2 of spec.components)
                if (!reads.has(component2.id))
                  throw new Error(`command ${name} cannot read ${component2.id}`);
              return this.queryOverlay(spec, this.pendingWrites);
            }
          },
          structuredClone(input)
        );
        if (!result || !Array.isArray(result.actions) || !Array.isArray(result.writes) || result.creates !== void 0 && !Array.isArray(result.creates) || result.removes !== void 0 && !Array.isArray(result.removes))
          throw new Error("invalid command result");
        const actions = result.actions.map(checkedAction);
        const edits = this.validateAuthoredEdits(
          result.creates ?? [],
          result.removes ?? [],
          [...this.pendingWrites, ...result.writes],
          handler.lifecycle ?? [],
          this.pendingCreates,
          this.pendingRemoves
        );
        const writes = this.validateWrites(
          result.writes,
          handler.writes,
          edits.known
        );
        const { creates, removes } = edits;
        const merged = [...this.pendingWrites];
        for (const write of writes) {
          const index = merged.findIndex(
            (existing) => existing.entity === write.entity && existing.component === write.component
          );
          if (index >= 0) merged[index] = write;
          else merged.push(write);
        }
        if (this.pendingActions.length + actions.length > 128 || merged.length > 128 || this.pendingCreates.length + creates.length > MAX_AUTHORED_RECORDS || this.pendingRemoves.length + removes.length > MAX_AUTHORED_REMOVES)
          throw new Error("pending action limit reached");
        this.pendingActions.push(...actions);
        this.pendingWrites = merged;
        this.pendingCreates.push(...creates);
        this.pendingRemoves.push(...removes);
      }
      validateAuthoredEdits(creates, removes, writes, allowed, queuedCreates = [], queuedRemoves = [], incoming) {
        const allCreates = [...queuedCreates, ...creates];
        const allRemoves = [...queuedRemoves, ...removes].map(checkedAuthoredId);
        if (allCreates.length > MAX_AUTHORED_RECORDS || allRemoves.length > MAX_AUTHORED_REMOVES)
          throw new Error("authored edit budget exceeded");
        const removed = new Set(allRemoves);
        if (removed.size !== allRemoves.length)
          throw new Error("duplicate authored removal");
        const permitted = new Set(allowed.map((definition) => definition.id));
        const definitions = new Map(
          this.pack.components.map((definition) => [definition.id, definition])
        );
        const requested = new Set(allRemoves);
        const created = /* @__PURE__ */ new Set();
        const inspectValue = (name, value) => {
          const definition = definitions.get(name);
          if (!definition || !definition.validate(value))
            throw new Error(`invalid authored component ${name}`);
          for (const [field, kind] of Object.entries(definition.fields)) {
            const item = value[field];
            if ((kind === "entity" || kind === "nullable-entity") && item !== null)
              requested.add(checkedAuthoredId(item));
            if (typeof item === "string" && new TextEncoder().encode(item).length > 4096)
              throw new Error("authored string exceeds 4096 bytes");
          }
        };
        for (const record of allCreates) {
          const id3 = checkedAuthoredId(record?.id);
          if (created.has(id3) || removed.has(id3))
            throw new Error("conflicting authored identity edit");
          created.add(id3);
          requested.add(id3);
          if (!record.components || Array.isArray(record.components) || typeof record.components !== "object" || Object.keys(record.components).length === 0 || Object.keys(record.components).length > 32)
            throw new Error("invalid authored creation components");
          for (const [name, value] of Object.entries(record.components)) {
            if (isReservedComponent(name))
              throw new Error("physical authored creation");
            inspectValue(name, value);
          }
        }
        for (const record of creates)
          for (const name of Object.keys(record.components))
            if (!permitted.has(name))
              throw new Error(`undeclared authored creation ${name}`);
        for (const write of writes) {
          requested.add(checkedAuthoredId(write.entity));
          inspectValue(write.component, write.value);
        }
        const known = /* @__PURE__ */ new Set();
        const ids = [...requested];
        const incomingIds = incoming && new Set(incoming.map((record) => record.id));
        for (let offset2 = 0; offset2 < ids.length; offset2 += 128) {
          const batch = ids.slice(offset2, offset2 + 128);
          const membership = incomingIds ? batch.map((id3) => incomingIds.has(id3)) : this.port.entityMembership(batch);
          if (membership.length !== batch.length)
            throw new Error("invalid entity membership result");
          batch.forEach((id3, index) => {
            if (membership[index]) known.add(id3);
          });
        }
        for (const id3 of created) {
          if (known.has(id3)) throw new Error("authored creation already exists");
          known.add(id3);
        }
        for (const id3 of removed) {
          if (!known.delete(id3)) throw new Error("unknown authored removal");
        }
        for (const id3 of requested)
          if (!created.has(id3) && !removed.has(id3) && !known.has(id3))
            throw new Error(`unknown entity reference ${id3}`);
        const checkReferences = (name, value) => {
          const definition = definitions.get(name);
          for (const [field, kind] of Object.entries(definition.fields)) {
            const ref = value[field];
            if ((kind === "entity" || kind === "nullable-entity") && ref !== null && !known.has(ref))
              throw new Error(`unknown authored reference ${field}`);
          }
        };
        for (const record of allCreates)
          for (const [name, value] of Object.entries(record.components))
            checkReferences(name, value);
        for (const write of writes) {
          if (!known.has(write.entity))
            throw new Error("write targets removed entity");
          checkReferences(write.component, write.value);
        }
        if (removes.length) {
          const targets = new Set(removes);
          const owned = /* @__PURE__ */ new Set();
          for (const definition of this.pack.components) {
            const rows = incoming ? incoming.filter(
              (record) => Object.hasOwn(record.components, definition.id)
            ).map((record) => ({ id: record.id })) : this.port.query({ components: [definition] });
            for (const row2 of rows)
              if (targets.has(row2.id)) {
                if (isReservedComponent(definition.id) || !permitted.has(definition.id))
                  throw new Error("authored removal exceeds component ownership");
                owned.add(row2.id);
              }
          }
          if (removes.some((id3) => !owned.has(id3)))
            throw new Error("authored removal has no owned record");
        }
        return {
          creates: structuredClone([...creates]),
          removes: [...removes],
          known
        };
      }
      validateWrites(writes, allowed, knownTargets, knownMembership) {
        const definitions = new Map(
          this.pack.components.map((component2) => [component2.id, component2])
        );
        const permitted = new Set(allowed.map((component2) => component2.id));
        const referenced = /* @__PURE__ */ new Set();
        if (!knownTargets) {
          for (const write of writes) {
            const definition = definitions.get(write.component);
            if (!definition || typeof write.value !== "object" || write.value === null)
              continue;
            for (const [field, kind] of Object.entries(definition.fields)) {
              const value = write.value[field];
              if ((kind === "entity" || kind === "nullable-entity") && value !== null) {
                if (typeof value !== "string")
                  throw new Error(`unknown entity reference ${field}`);
                referenced.add(value);
              }
            }
          }
        }
        const referencedIds = [...referenced];
        const referenceMembership = /* @__PURE__ */ new Map();
        for (let offset2 = 0; offset2 < referencedIds.length; offset2 += 128) {
          const batch = referencedIds.slice(offset2, offset2 + 128);
          const membership = this.port.entityMembership(batch);
          batch.forEach(
            (id3, index) => referenceMembership.set(id3, membership[index] === true)
          );
        }
        return writes.map((write) => {
          if (!permitted.has(write.component) || isReservedComponent(write.component))
            throw new Error(`undeclared or physical write ${write.component}`);
          const definition = definitions.get(write.component);
          if (!definition || !definition.validate(write.value))
            throw new Error(`invalid component write ${write.component}`);
          if (typeof write.value === "object" && write.value !== null && Object.values(write.value).some(
            (value) => typeof value === "string" && new TextEncoder().encode(value).length > 4096
          ))
            throw new Error("authored string exceeds 4096 bytes");
          if (knownMembership ? !knownMembership.has(`${write.entity}|${write.component}`) : knownTargets ? !knownTargets.has(write.entity) : !this.port.query({ components: [definition] }).some((row2) => row2.id === write.entity))
            throw new Error(`unknown write target ${write.entity}`);
          for (const [field, kind] of Object.entries(definition.fields)) {
            const value = write.value[field];
            if ((kind === "entity" || kind === "nullable-entity") && value !== null) {
              const targetKnown = knownTargets ? knownTargets.has(value) : referenceMembership?.get(value) === true;
              if (typeof value !== "string" || !targetKnown)
                throw new Error(`unknown entity reference ${field}`);
            }
          }
          return structuredClone(write);
        });
      }
      queryOverlay(spec, pending, creates = this.pendingCreates, removes = this.pendingRemoves) {
        const rows = this.port.query(spec).filter((row2) => !removes.includes(row2.id));
        const createdRows = creates.filter(
          (record) => spec.components.every(
            (component2) => Object.hasOwn(record.components, component2.id)
          )
        ).map((record) => ({
          id: record.id,
          get: (definition) => structuredClone(record.components[definition.id])
        }));
        return [...rows, ...createdRows].map((row2) => ({
          id: row2.id,
          get: (definition) => {
            if (!spec.components.some((component2) => component2.id === definition.id))
              throw new Error(
                `query row ${row2.id} did not request ${definition.id}`
              );
            const intent = pending.find(
              (write) => write.entity === row2.id && write.component === definition.id
            );
            return structuredClone(
              intent ? intent.value : row2.get(definition)
            );
          }
        }));
      }
      impactsFor(systemId, frontiers) {
        const frontier = frontiers.get(systemId);
        if (frontier === void 0)
          throw new Error("missing impact consumer frontier");
        if (frontier === null) return structuredClone(this.pendingImpacts);
        return structuredClone(
          this.pendingImpacts.filter((impact) => impact.sequence > frontier)
        );
      }
      compactImpacts() {
        if (this.impactFrontiers.size === 0) {
          this.pendingImpacts = [];
          return;
        }
        if (this.pendingImpacts.length === 0) return;
        const frontiers = [];
        for (const frontier of this.impactFrontiers.values()) {
          if (frontier === null) return;
          frontiers.push(frontier);
        }
        const removeThrough = Math.min(...frontiers);
        this.pendingImpacts = this.pendingImpacts.filter(
          (impact) => impact.sequence > removeThrough
        );
      }
      step(delta) {
        if (delta < 0 || delta > 1 || !Number.isFinite(delta))
          throw new Error("delta must be finite and between zero and one second");
        this.ensureLive();
        if (this.paused) return [];
        try {
          this.routeRequestsLastStep = 0;
          this.compactImpacts();
          const clock2 = Object.freeze({
            now: this.now,
            delta,
            tick: this.tick
          });
          const queuedWrites = structuredClone(this.pendingWrites);
          this.pendingWrites = [];
          const queuedCreates = structuredClone(this.pendingCreates);
          this.pendingCreates = [];
          const queuedRemoves = structuredClone(this.pendingRemoves);
          this.pendingRemoves = [];
          const writes = [...queuedWrites];
          const actions = this.pendingActions.splice(0);
          const nextFrontiers = new Map(this.impactFrontiers);
          let systemActionCount = 0;
          let routeRequests = 0;
          let committedWorkMaterialFacts;
          let activeReads = [];
          const requireRouteReads = () => {
            if (!activeReads.some((definition) => definition.id === Position.id) || !activeReads.some((definition) => definition.id === Body.id))
              throw new Error(
                "route query requires declared position and body reads"
              );
          };
          const context = {
            clock: clock2,
            random: this.random,
            impacts: [],
            assign: (candidates, maxEdges) => this.assign(candidates, maxEdges),
            worldPoses: (entities) => this.worldPoses(entities, activeReads),
            physicalContacts: (cells) => this.port.physicalContacts(cells),
            environmentFacts: () => this.port.environmentFacts(),
            atmosphereSamples: (cells) => this.port.atmosphereSamples(cells),
            constructionReadiness: (sites) => this.port.constructionReadiness(sites),
            constructionAccess: (sites) => this.port.constructionAccess(sites),
            deconstructionAccess: (sites) => this.port.deconstructionAccess(sites),
            terrainMaterials: (cells) => this.port.terrainMaterials(cells),
            terrainSurfaces: (columns) => this.port.terrainSurfaces(columns),
            waterContacts: (centers) => this.port.waterContacts(centers),
            routeCosts: (requests) => {
              requireRouteReads();
              if (routeRequests + requests.length > 128)
                return requests.map((request) => ({
                  actor: request.actor,
                  status: "unavailable",
                  reason: "Route planning deferred"
                }));
              routeRequests += requests.length;
              return this.port.routeCosts(requests);
            },
            routeToAny: (request) => {
              requireRouteReads();
              if (routeRequests + 1 > 128)
                return {
                  actor: request.actor,
                  status: "unavailable",
                  reason: "Route planning deferred"
                };
              routeRequests++;
              return this.port.routeToAny(request);
            },
            outcomes: structuredClone(this.outcomes),
            query: (spec) => this.queryOverlay(spec, queuedWrites, queuedCreates, queuedRemoves),
            workMaterialFacts: () => {
              return committedWorkMaterialFacts ??= this.port.workMaterialFacts();
            },
            processRequirements: (definition, station) => this.port.processRequirements(definition, station),
            write: (definition, entity2, value) => {
              writes.push({ component: definition.id, entity: entity2, value });
            },
            action: (action) => {
              if (++systemActionCount > 128)
                throw new Error("game systems exceeded 128 actions per step");
              actions.push(checkedAction(action));
            },
            createAuthoredEntity: (record) => {
              if (queuedCreates.length >= MAX_AUTHORED_RECORDS)
                throw new Error("authored creation budget exceeded");
              queuedCreates.push(structuredClone(record));
            },
            removeAuthoredEntity: (id3) => {
              if (queuedRemoves.length >= MAX_AUTHORED_REMOVES)
                throw new Error("authored removal budget exceeded");
              queuedRemoves.push(checkedAuthoredId(id3));
            }
          };
          for (const definition of this.pack.systems) {
            if (definition.every !== void 0 && this.tick % definition.every !== 0)
              continue;
            const beforeWrites = writes.length;
            const beforeCreates = queuedCreates.length;
            const beforeRemoves = queuedRemoves.length;
            activeReads = definition.reads;
            const impacts = definition.consumesImpacts ? this.impactsFor(definition.id, nextFrontiers) : [];
            definition.run({
              ...context,
              impacts
            });
            if (definition.consumesImpacts && this.pendingImpacts.length > 0)
              nextFrontiers.set(
                definition.id,
                this.pendingImpacts[this.pendingImpacts.length - 1].sequence
              );
            const edits = this.validateAuthoredEdits(
              queuedCreates.slice(beforeCreates),
              queuedRemoves.slice(beforeRemoves),
              writes,
              definition.writes,
              queuedCreates.slice(0, beforeCreates),
              queuedRemoves.slice(0, beforeRemoves)
            );
            writes.push(
              ...this.validateWrites(
                writes.splice(beforeWrites),
                definition.writes,
                edits.known
              )
            );
          }
          const advanced = this.port.advance(
            delta,
            writes,
            actions,
            { creates: queuedCreates, removes: queuedRemoves }
          );
          if (advanced.results.length !== actions.length)
            throw new Error("kernel result count mismatch");
          const incoming = advanced.impacts.map(checkedImpact);
          const seen = new Set(
            this.pendingImpacts.map((impact) => impact.sequence)
          );
          let previousSequence = this.pendingImpacts.at(-1)?.sequence ?? this.impactHighWater;
          for (const impact of incoming) {
            if (seen.has(impact.sequence) || impact.sequence <= this.impactHighWater)
              throw new Error("duplicate physical impact sequence");
            if (impact.time < this.now - 1e-9 || impact.time > this.now + delta + 1e-9)
              throw new Error("physical impact outside committed step");
            if (impact.sequence <= previousSequence)
              throw new Error("physical impacts out of order");
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
            result: advanced.results[index]
          }));
          if (this.pack.presentation?.feedback)
            this.cues = appendPresentationCues(
              this.cues,
              this.now + delta,
              this.outcomes,
              incoming
            );
          this.now += delta;
          this.tick++;
          this.routeRequestsLastStep = routeRequests;
          return advanced.results;
        } catch (error) {
          this.poisoned = true;
          throw error;
        }
      }
      save() {
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
          impactFrontiers: [...this.impactFrontiers.entries()].map(
            ([system2, sequence]) => ({ system: system2, sequence })
          ),
          systems: this.pack.systems.map((system2) => ({
            id: system2.id,
            version: system2.version,
            consumesImpacts: system2.consumesImpacts === true
          }))
        };
      }
      restore(snapshot) {
        if (snapshot.format !== "hive-session" || snapshot.version !== 8 || snapshot.game !== this.pack.id || snapshot.gameVersion !== this.pack.version || typeof snapshot.paused !== "boolean" || snapshot.now < 0 || !Number.isFinite(snapshot.now) || !Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 || !Number.isInteger(snapshot.random) || snapshot.random < 0 || snapshot.random > 4294967295 || !Number.isSafeInteger(snapshot.impactHighWater) || snapshot.impactHighWater < 0)
          throw new Error("invalid session snapshot");
        if (!Array.isArray(snapshot.pendingActions) || snapshot.pendingActions.length > 128 || !Array.isArray(snapshot.pendingWrites) || snapshot.pendingWrites.length > 128 || !Array.isArray(snapshot.pendingCreates) || snapshot.pendingCreates.length > MAX_AUTHORED_RECORDS || !Array.isArray(snapshot.pendingRemoves) || snapshot.pendingRemoves.length > MAX_AUTHORED_REMOVES || !Array.isArray(snapshot.pendingImpacts) || snapshot.pendingImpacts.length > MAX_PENDING_IMPACTS || !Array.isArray(snapshot.impactFrontiers) || !Array.isArray(snapshot.systems))
          throw new Error("invalid session queues");
        const expectedEnvironment = this.pack.environmentDefinition;
        const savedEnvironment = snapshot.kernel.records?.find(
          (record) => record.key === "kernel/environment/definition"
        )?.bytes;
        if (Boolean(expectedEnvironment) !== Boolean(savedEnvironment) || expectedEnvironment && savedEnvironment && (expectedEnvironment.byteLength !== savedEnvironment.byteLength || expectedEnvironment.some(
          (byte, index) => byte !== savedEnvironment[index]
        )))
          throw new Error("snapshot environment definitions do not match");
        const cues = checkedCueSnapshot(snapshot.cues, snapshot.now);
        const pending = snapshot.pendingActions.map(checkedAction);
        let canonical;
        try {
          canonical = readKernelEntities(snapshot.kernel);
        } catch {
          throw new Error("invalid session snapshot");
        }
        const initialEntities = canonical.scene?.initial;
        if (!Array.isArray(initialEntities))
          throw new Error("invalid session entities");
        const incomingTargets = new Set(
          initialEntities.map((entity2) => entity2.id)
        );
        const incomingMembership = /* @__PURE__ */ new Set();
        for (const entity2 of initialEntities)
          for (const component2 of Object.keys(entity2.components ?? {}))
            incomingMembership.add(`${entity2.id}|${component2}`);
        const pendingKeys = /* @__PURE__ */ new Set();
        for (const write of snapshot.pendingWrites) {
          const key = `${write.entity}|${write.component}`;
          if (pendingKeys.has(key)) throw new Error("duplicate pending write");
          pendingKeys.add(key);
        }
        const authoredDefinitions = Object.values(this.pack.commands ?? {}).flatMap(
          (command2) => command2.writes
        );
        const edits = this.validateAuthoredEdits(
          snapshot.pendingCreates,
          snapshot.pendingRemoves,
          snapshot.pendingWrites,
          Object.values(this.pack.commands ?? {}).flatMap(
            (command2) => command2.lifecycle ?? []
          ),
          [],
          [],
          initialEntities
        );
        const pendingWrites = this.validateWrites(
          snapshot.pendingWrites,
          authoredDefinitions,
          edits.known
        );
        const pendingCreates = edits.creates;
        const pendingRemoves = edits.removes;
        const pendingImpacts = snapshot.pendingImpacts.map(checkedImpact);
        const impactIds = /* @__PURE__ */ new Set();
        const impactSequences = /* @__PURE__ */ new Set();
        let previousSequence = 0;
        for (const impact of pendingImpacts) {
          if (impactIds.has(impact.id)) throw new Error("duplicate pending impact");
          if (impactSequences.has(impact.sequence) || impact.sequence <= previousSequence || impact.sequence > snapshot.impactHighWater)
            throw new Error("invalid pending impact sequence");
          impactIds.add(impact.id);
          impactSequences.add(impact.sequence);
          previousSequence = impact.sequence;
        }
        const expectedConsumers = new Set(
          this.pack.systems.filter((system2) => system2.consumesImpacts).map((system2) => system2.id)
        );
        if (snapshot.impactFrontiers.length !== expectedConsumers.size)
          throw new Error("invalid impact frontiers");
        const frontiers = /* @__PURE__ */ new Map();
        for (const frontier of snapshot.impactFrontiers) {
          if (typeof frontier.system !== "string" || !expectedConsumers.has(frontier.system) || frontiers.has(frontier.system) || frontier.sequence !== null && (typeof frontier.sequence !== "number" || !Number.isSafeInteger(frontier.sequence) || frontier.sequence < 0 || frontier.sequence > snapshot.impactHighWater))
            throw new Error("invalid impact frontier");
          frontiers.set(frontier.system, frontier.sequence);
        }
        const minimum = Math.min(
          ...[...frontiers.values()].map((sequence) => sequence ?? 0)
        );
        if (pendingImpacts.some((impact) => impact.sequence <= minimum))
          throw new Error("uncompacted impact frontier");
        if (!Array.isArray(snapshot.outcomes) || snapshot.outcomes.length > 256)
          throw new Error("invalid action outcomes");
        const outcomes = snapshot.outcomes.map((outcome) => {
          if (!outcome.result || typeof outcome.result.accepted !== "boolean" || outcome.result.revision !== snapshot.kernel.revision || outcome.result.reason != null && typeof outcome.result.reason !== "string")
            throw new Error("invalid action result");
          return {
            action: checkedAction(outcome.action),
            result: structuredClone(outcome.result)
          };
        });
        const definition = JSON.parse(
          new TextDecoder().decode(this.pack.definition)
        );
        if (canonical.scene?.game !== this.pack.id || canonical.time !== snapshot.now || canonical.revision !== snapshot.kernel.revision || canonical.revision !== snapshot.tick)
          throw new Error("snapshot world does not match session");
        const schema = (items) => items.filter((item) => !isReservedComponent(item.id)).map(
          (item) => JSON.stringify([
            item.id,
            item.version,
            Object.entries(item.fields).sort()
          ])
        ).sort().join("\n");
        if (schema(canonical.scene.components) !== schema(definition.components))
          throw new Error("snapshot component versions do not match");
        const expected = this.pack.systems.map(
          (system2) => `${system2.id}@${system2.version}:${system2.consumesImpacts === true}`
        ).join(",");
        const actual = snapshot.systems.map(
          (system2) => `${system2.id}@${system2.version}:${system2.consumesImpacts === true}`
        ).join(",");
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
        this.terrainPresentation = void 0;
        this.poisoned = false;
      }
      terrainView() {
        this.ensureLive();
        if (!this.pack.environmentDefinition) return void 0;
        if (!this.terrainPresentation) {
          const definition = JSON.parse(
            new TextDecoder().decode(this.pack.environmentDefinition)
          );
          this.terrainPresentation = new TerrainPresentationOwner(
            this.port,
            definition,
            this.pack.presentationWindow
          );
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
        return appendVisualProjections(
          physical,
          project({ query: (spec) => this.query(spec), environmentFacts: () => this.port.environmentFacts() }),
          (ids) => this.port.entityMembership(ids),
          limit
        );
      }
    };
  }
});

// engine/src/runtime/terrain-surface.ts
import { z as z6 } from "zod";
var coordinate2, terrainSurfaceSchema;
var init_terrain_surface = __esm({
  "engine/src/runtime/terrain-surface.ts"() {
    "use strict";
    coordinate2 = z6.number().int().min(-2147483648).max(2147483647);
    terrainSurfaceSchema = z6.object({
      cell: z6.tuple([coordinate2, coordinate2, coordinate2]).readonly(),
      material: z6.number().int().min(0).max(65535),
      generatedTop: coordinate2
    }).readonly();
  }
});

// engine/src/runtime/physical-contact-query.ts
function physicalContactQuery(read, cells) {
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > 64 || cells.some((cell3) => !Array.isArray(cell3) || cell3.length !== 3 || cell3.some((value, axis2) => !Number.isSafeInteger(value) || axis2 === 1 && (value < -2147483648 || value > 2147483647))))
    throw new Error("physical contact query requires 1..64 valid cells");
  const result = JSON.parse(read(JSON.stringify(cells)));
  if (!Array.isArray(result) || result.length !== cells.length || result.some((value) => !value || typeof value !== "object" || Array.isArray(value) || typeof value.solid !== "boolean" || typeof value.sealedTop !== "boolean" || typeof value.outside !== "boolean" || value.outside && (value.solid || value.sealedTop)))
    throw new Error("invalid physical contact result");
  return result.map((value) => Object.freeze({ solid: value.solid, sealedTop: value.sealedTop, outside: value.outside }));
}
var init_physical_contact_query = __esm({
  "engine/src/runtime/physical-contact-query.ts"() {
    "use strict";
  }
});

// engine/src/runtime/wasm-kernel.ts
var wasm_kernel_exports = {};
__export(wasm_kernel_exports, {
  parseConstructionAccess: () => parseConstructionAccess,
  parseDeconstructionAccess: () => parseDeconstructionAccess,
  wasmKernelPort: () => wasmKernelPort
});
import { z as z7 } from "zod";
import { WasmKernelRecords } from "../../generated/hive_kernel.js";
function validateConstructionAccessSites(sites) {
  if (!Array.isArray(sites) || sites.length === 0 || sites.length > 256)
    throw new Error("construction access needs 1..256 sites");
  if (new Set(sites).size !== sites.length)
    throw new Error("duplicate construction access site");
}
function parseConstructionAccess(value, sites) {
  validateConstructionAccessSites(sites);
  const rows = constructionAccessSchema.parse(value);
  if (rows.length !== sites.length || rows.some((row2, index) => row2.site !== sites[index]))
    throw new Error("construction access result order mismatch");
  return rows;
}
function parseDeconstructionAccess(value, sites) {
  if (!Array.isArray(sites) || sites.length < 1 || sites.length > 128 || sites.some((site) => !entityIdWireSchema.safeParse(site).success) || new Set(sites).size !== sites.length) throw new Error("deconstruction access needs 1..128 unique valid sites");
  const rows = deconstructionAccessSchema.parse(value);
  if (rows.length !== sites.length || rows.some((row2, index) => row2.site !== sites[index])) throw new Error("deconstruction access result order mismatch");
  return rows.map((row2) => ({ site: row2.site, status: row2.removal, contacts: row2.contacts, salvageQuantity: row2.salvageQuantity, workSeconds: row2.workSeconds }));
}
function parseConstructionReadiness(value, sites) {
  if (!Array.isArray(value) || value.length !== sites.length)
    throw new Error("invalid construction readiness result");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new Error("invalid construction readiness row");
    const row2 = Object.fromEntries(Object.entries(entry));
    if (Object.keys(row2).some((key) => !["site", "status", "reason"].includes(key)))
      throw new Error("invalid construction readiness row");
    const site = row2.site;
    if (typeof site !== "string" || site !== sites[index])
      throw new Error("construction readiness result order mismatch");
    const statusValue = row2.status;
    if (statusValue !== "ready" && statusValue !== "waitingForSupport" && statusValue !== "unknown")
      throw new Error("invalid construction readiness status");
    const reason = row2.reason;
    if (reason !== void 0 && reason !== "missingStructuralSupport")
      throw new Error("invalid construction readiness reason");
    if (statusValue === "waitingForSupport" && reason !== "missingStructuralSupport")
      throw new Error("construction readiness is missing its waiting reason");
    const requestedSite = sites[index];
    if (reason === void 0) return { site: requestedSite, status: statusValue };
    return { site: requestedSite, status: statusValue, reason };
  });
}
function wasmKernelPort(binding) {
  return {
    routeCosts(requests) {
      if (!Array.isArray(requests) || requests.length < 1 || requests.length > 32)
        throw new Error("route costs need 1..32 requests");
      const result = JSON.parse(
        binding.route_costs(JSON.stringify(requests))
      );
      if (!Array.isArray(result) || result.length !== requests.length || result.some(
        (entry, index) => !entry || entry.actor !== requests[index].actor || (entry.status === "reachable" ? !Number.isFinite(entry.cost) || entry.cost < 0 : entry.status !== "unavailable" || typeof entry.reason !== "string")
      ))
        throw new Error("invalid route cost result");
      return result;
    },
    routeToAny(request) {
      if (!request || !Array.isArray(request.targets) || request.targets.length < 1 || request.targets.length > 32)
        throw new Error("route-to-any needs 1..32 targets");
      const result = routeToAnyResultSchema.parse(
        JSON.parse(binding.route_to_any(JSON.stringify(request)))
      );
      if (result.actor !== request.actor || result.status === "reachable" && result.targetIndex >= request.targets.length)
        throw new Error("invalid route-to-any result");
      return result;
    },
    dispose() {
      binding.free();
    },
    load(definition) {
      binding.load(new TextDecoder().decode(definition));
    },
    loadEnvironment(definition) {
      binding.load_environment(new TextDecoder().decode(definition));
    },
    environmentFacts() {
      return JSON.parse(binding.environment_facts());
    },
    atmosphereSamples(cells) {
      if (cells.length === 0 || cells.length > 64 || cells.some(
        (cell3) => !Array.isArray(cell3) || cell3.length !== 3 || cell3.some(
          (coordinate3) => !Number.isInteger(coordinate3) || coordinate3 < -2147483648 || coordinate3 > 2147483647
        )
      ))
        throw new Error(
          "atmosphere query must contain between 1 and 64 signed integer cells"
        );
      const value = JSON.parse(
        binding.atmosphere_samples(JSON.stringify(cells))
      );
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("invalid atmosphere sample result");
      const result = value;
      if (!Number.isSafeInteger(result.revision) || result.revision < 0 || !Number.isSafeInteger(result.geometryRevision) || result.geometryRevision < 0 || !Array.isArray(result.samples) || result.samples.length !== cells.length)
        throw new Error("invalid atmosphere sample result");
      const samples = result.samples.map(
        (sample) => {
          if (sample === null) return null;
          if (!sample || typeof sample !== "object" || Array.isArray(sample))
            throw new Error("invalid atmosphere sample");
          const entry = sample;
          if (typeof entry.volumeId !== "string" || entry.volumeId.length === 0 || entry.volumeId.length > 128 || !Number.isFinite(entry.temperatureC) || !Number.isFinite(entry.smokeKgM3) || entry.smokeKgM3 < 0)
            throw new Error("invalid atmosphere sample");
          return {
            volumeId: entry.volumeId,
            temperatureC: entry.temperatureC,
            smokeKgM3: entry.smokeKgM3
          };
        }
      );
      return {
        revision: result.revision,
        geometryRevision: result.geometryRevision,
        samples
      };
    },
    constructionReadiness(sites) {
      if (!Array.isArray(sites) || sites.length === 0 || sites.length > 256)
        throw new Error("construction readiness needs 1..256 sites");
      const value = JSON.parse(binding.construction_readiness(JSON.stringify(sites)));
      return parseConstructionReadiness(value, sites);
    },
    constructionAccess(sites) {
      validateConstructionAccessSites(sites);
      return parseConstructionAccess(JSON.parse(binding.construction_access(JSON.stringify(sites))), sites);
    },
    deconstructionAccess(sites) {
      const value = JSON.parse(binding.deconstruction_access(JSON.stringify(sites)));
      return parseDeconstructionAccess(value, sites);
    },
    physicalContacts(cells) {
      return physicalContactQuery(
        (json) => binding.physical_contacts(json),
        cells
      );
    },
    terrainMaterials(cells) {
      if (cells.length === 0 || cells.length > 256 || cells.some(
        (cell3) => !Array.isArray(cell3) || cell3.length !== 3 || cell3.some(
          (coordinate3) => !Number.isInteger(coordinate3) || coordinate3 < -2147483648 || coordinate3 > 2147483647
        )
      ))
        throw new Error(
          "terrain material query must contain between 1 and 256 signed integer cells"
        );
      const result = JSON.parse(
        binding.terrain_materials(JSON.stringify(cells))
      );
      if (!Array.isArray(result) || result.length !== cells.length || !result.every(
        (material) => Number.isInteger(material) && material >= 0 && material <= 65535
      ))
        throw new Error("invalid terrain material query result");
      return result;
    },
    terrainSurfaces(columns) {
      if (columns.length === 0 || columns.length > 64 || columns.some(
        (column) => !Array.isArray(column) || column.length !== 2 || column.some(
          (coordinate3) => !Number.isInteger(coordinate3) || coordinate3 < -2147483648 || coordinate3 > 2147483647
        )
      ))
        throw new Error(
          "terrain surface query must contain between 1 and 64 signed integer columns"
        );
      const result = surfaceResultsSchema.parse(
        JSON.parse(binding.terrain_surfaces(JSON.stringify(columns)))
      );
      if (result.length !== columns.length || result.some(
        (surface, index) => surface !== null && (surface.cell[0] !== columns[index][0] || surface.cell[2] !== columns[index][1])
      ))
        throw new Error(
          "terrain surface result does not match requested columns"
        );
      return result;
    },
    waterContacts(centers) {
      if (centers.length === 0 || centers.length > 16) throw new Error("water contact query exceeds center budget");
      return JSON.parse(binding.water_contacts(JSON.stringify(centers)));
    },
    structureSurfaces(columns) {
      if (columns.length === 0 || columns.length > 64 || columns.some(
        (column) => !Array.isArray(column) || column.length !== 2 || column.some(
          (coordinate3) => !Number.isInteger(coordinate3) || coordinate3 < -2147483648 || coordinate3 > 2147483647
        )
      ))
        throw new Error(
          "structure surface query must contain between 1 and 64 signed integer columns"
        );
      const result = JSON.parse(
        binding.structure_surfaces(JSON.stringify(columns))
      );
      if (!Array.isArray(result) || result.length !== columns.length || result.some((entry, index) => {
        if (!Array.isArray(entry)) return true;
        const seen = /* @__PURE__ */ new Set();
        return entry.some((surface) => {
          if (!surface || typeof surface !== "object" || Array.isArray(surface))
            return true;
          const cell3 = surface.cell;
          if (!Array.isArray(cell3) || cell3.length !== 3 || !cell3.every(
            (coordinate3) => Number.isInteger(coordinate3) && coordinate3 >= -2147483648 && coordinate3 <= 2147483647
          ) || cell3[0] !== columns[index][0] || cell3[2] !== columns[index][1])
            return true;
          const key = `${cell3[0]},${cell3[1]},${cell3[2]}`;
          if (seen.has(key)) return true;
          seen.add(key);
          return false;
        });
      }))
        throw new Error("invalid structure surface query result");
      return result;
    },
    terrainChanges(sinceRevision) {
      if (!Number.isSafeInteger(sinceRevision) || sinceRevision < 0)
        throw new Error(
          "terrain change revision must be a nonnegative safe integer"
        );
      const result = JSON.parse(
        binding.terrain_changes(JSON.stringify(sinceRevision))
      );
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw new Error("invalid terrain change result");
      const value = result;
      if (!Number.isSafeInteger(value.revision) || value.revision < 0)
        throw new Error("invalid terrain change result");
      if (value.kind === "full-reset" && (value.reason === "history" || value.reason === "restored" || value.reason === "stale"))
        return {
          kind: "full-reset",
          revision: value.revision,
          reason: value.reason
        };
      if (value.kind !== "changed-columns" || !Array.isArray(value.columns) || value.columns.length > 4096)
        throw new Error("invalid terrain change result");
      const seen = /* @__PURE__ */ new Set();
      const columns = value.columns.map((column) => {
        if (!Array.isArray(column) || column.length !== 2 || !column.every(
          (coordinate3) => Number.isInteger(coordinate3) && coordinate3 >= -2147483648 && coordinate3 <= 2147483647
        ))
          throw new Error("invalid terrain changed column");
        const parsed = [column[0], column[1]];
        const key = `${parsed[0]},${parsed[1]}`;
        if (seen.has(key)) throw new Error("duplicate terrain changed column");
        seen.add(key);
        return parsed;
      });
      return {
        kind: "changed-columns",
        revision: value.revision,
        columns
      };
    },
    query(spec) {
      const ids = spec.components.map((component2) => component2.id);
      return JSON.parse(binding.query(JSON.stringify(ids))).map((row2) => ({
        id: row2.id,
        get(definition) {
          const value = row2.components[definition.id];
          if (!value || typeof value !== "object")
            throw new Error(`query row ${row2.id} lacks ${definition.id}`);
          return value;
        }
      }));
    },
    workMaterialFacts() {
      const value = JSON.parse(binding.work_material_snapshot());
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("invalid work material facts");
      const result = value;
      if (result.version !== 1 || !Array.isArray(result.containers) || !Array.isArray(result.lots) || result.containers.length > 4096 || result.lots.length > 4096)
        throw new Error("invalid work material facts");
      const id3 = (entry) => {
        if (typeof entry !== "string" || entry.length === 0 || entry.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(entry))
          throw new Error("invalid work material entity");
        return entry;
      };
      const containers = result.containers.map(
        (entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry))
            throw new Error("invalid work material container");
          const row2 = entry;
          if (!Number.isSafeInteger(row2.capacity) || row2.capacity < 0 || row2.capacity > 4294967295 || typeof row2.sealed !== "boolean")
            throw new Error("invalid work material container");
          return {
            id: id3(row2.id),
            capacity: row2.capacity,
            sealed: row2.sealed
          };
        }
      );
      const lots = result.lots.map(
        (entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry))
            throw new Error("invalid work material lot");
          const row2 = entry;
          if (typeof row2.kind !== "string" || row2.kind.length === 0 || row2.kind.length > 128 || !Number.isSafeInteger(row2.quantity) || row2.quantity < 0 || row2.quantity > 4294967295)
            throw new Error("invalid work material lot");
          return {
            id: id3(row2.id),
            kind: row2.kind,
            quantity: row2.quantity,
            container: id3(row2.container)
          };
        }
      );
      return { version: 1, containers, lots };
    },
    processRequirements(definition, station) {
      if (!entityIdWireSchema.safeParse(definition).success || !entityIdWireSchema.safeParse(station).success)
        throw new Error("invalid process requirements identity");
      const row2 = processRequirementsSchema.parse(JSON.parse(binding.process_requirements(JSON.stringify({ definition, station }))));
      if (row2.definition !== definition) throw new Error("process requirements definition mismatch");
      return row2;
    },
    entityMembership(ids) {
      if (ids.length === 0 || ids.length > 128)
        throw new Error(
          "entity membership query must contain between 1 and 128 entities"
        );
      const result = JSON.parse(
        binding.entity_membership(JSON.stringify(ids))
      );
      if (!Array.isArray(result) || result.length !== ids.length || !result.every((value) => typeof value === "boolean"))
        throw new Error("invalid entity membership result");
      return result;
    },
    advance(delta, writes, actions, options) {
      const result = JSON.parse(
        binding.advance(
          JSON.stringify({
            delta,
            writes,
            actions,
            creates: options?.creates ?? [],
            removes: options?.removes ?? []
          })
        )
      );
      if (!Number.isSafeInteger(result.revision) || result.revision < 0 || !Array.isArray(result.results) || !Array.isArray(result.impacts))
        throw new Error("invalid kernel advance result");
      return result;
    },
    snapshot() {
      return captureKernelRecords(binding);
    },
    restore(snapshot) {
      restoreKernelRecords(binding, () => new WasmKernelRecords(), snapshot);
    },
    renderFacts(limit = 512) {
      return JSON.parse(binding.render_facts()).slice(
        0,
        limit
      );
    },
    worldPoses(entities) {
      if (entities.length === 0 || entities.length > 128)
        throw new Error(
          "world pose query must contain between 1 and 128 entities"
        );
      return JSON.parse(
        binding.world_pose(JSON.stringify(entities))
      );
    },
    assign(candidates, maxEdges = ASSIGNMENT_MAX_EDGES) {
      const checked = checkedAssignments(candidates, maxEdges);
      const result = JSON.parse(
        binding.assign(
          JSON.stringify({ candidates: checked, max_edges: maxEdges })
        )
      );
      return result.assignments;
    }
  };
}
var surfaceResultsSchema, entityIdWireSchema, routeToAnyResultSchema, processRequirementsSchema, constructionAccessSchema, deconstructionAccessSchema;
var init_wasm_kernel = __esm({
  "engine/src/runtime/wasm-kernel.ts"() {
    "use strict";
    init_terrain_surface();
    init_physical_contact_query();
    init_assignment();
    init_kernel_records();
    surfaceResultsSchema = z7.array(terrainSurfaceSchema.nullable()).max(64);
    entityIdWireSchema = z7.custom(
      (value) => typeof value === "string" && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value)
    );
    routeToAnyResultSchema = z7.discriminatedUnion("status", [
      z7.object({
        actor: entityIdWireSchema,
        status: z7.literal("reachable"),
        targetIndex: z7.number().int().nonnegative(),
        cost: z7.number().finite().nonnegative()
      }).strict(),
      z7.object({
        actor: entityIdWireSchema,
        status: z7.literal("unavailable"),
        reason: z7.string()
      }).strict()
    ]);
    processRequirementsSchema = z7.object({
      definition: entityIdWireSchema,
      version: z7.number().int().positive(),
      stationCatalog: entityIdWireSchema,
      inputs: z7.array(z7.object({
        role: entityIdWireSchema,
        port: entityIdWireSchema,
        material: entityIdWireSchema,
        quantity: z7.number().int().positive().max(4294967295),
        policy: z7.enum(["portion", "whole-lot"]),
        disposition: z7.enum(["consume", "retain", "emission-source"])
      }).strict()).min(1).max(32),
      stages: z7.array(z7.object({ id: entityIdWireSchema, mode: z7.enum(["attended", "elapsed"]), durationSeconds: z7.number().finite().positive() }).strict()).min(1).max(16),
      phase: z7.enum(["waiting", "working", "complete", "blocked"])
    }).strict();
    constructionAccessSchema = z7.array(z7.object({
      site: entityIdWireSchema,
      support: z7.enum(["ready", "waitingForSupport", "unknown"]),
      materialsReady: z7.boolean(),
      contacts: z7.array(z7.object({
        x: z7.number().finite(),
        y: z7.number().finite(),
        z: z7.number().finite(),
        frame: z7.null(),
        kind: z7.enum(["origin", "landing"])
      }).strict()).max(32)
    }).strict()).max(256);
    deconstructionAccessSchema = z7.array(z7.object({ site: entityIdWireSchema, removal: z7.enum(["ready", "occupiedPort", "structuralDependency", "invalidGeometry"]), salvageQuantity: z7.number().int().nonnegative(), workSeconds: z7.number().finite().nonnegative(), contacts: z7.array(z7.object({ x: z7.number().finite(), y: z7.number().finite(), z: z7.number().finite(), frame: z7.null(), kind: z7.enum(["origin", "landing"]) }).strict()).max(32) }).strict()).max(128);
  }
});

// engine/src/games/colony-work.test.ts
init_common();
init_authoring();
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

// engine/src/games/colony-construction-visuals.ts
init_authoring();

// engine/src/sdk/construction.ts
init_authoring();
var SealedContainer = component("hive.sealed-container", {
  version: 1,
  fields: {}
});
var ConstructionSite = component("hive.construction-site", {
  version: 1,
  fields: {
    catalog: "string",
    x: "number",
    y: "number",
    z: "number",
    orientation: "string",
    worker: "nullable-entity",
    seconds: "number",
    phase: "string"
  }
});
var planConstruction = (site, catalog, cell3, orientation) => ({
  kind: "plan-construction",
  site,
  catalog,
  x: cell3.x,
  y: cell3.y,
  z: cell3.z,
  orientation
});
var bindConstructionStage = (site, contact) => ({
  kind: "bind-construction-stage",
  site,
  contact: { x: contact.x, y: contact.y, z: contact.z, frame: null }
});
var attendConstruction = (worker, site, contact) => ({
  kind: "attend-construction",
  worker,
  site,
  contact: { x: contact.x, y: contact.y, z: contact.z, frame: null }
});
var deconstruct = (worker, site) => ({
  kind: "deconstruct",
  worker,
  site
});

// engine/src/sdk/grid-connections.ts
function gridConnectionMasks(entries) {
  const key = (x, y, z8) => `${x},${y},${z8}`;
  const occupied = new Set(entries.map(({ cell: [x, y, z8] }) => key(x, y, z8)));
  return new Map(entries.map(({ id: id3, cell: [x, y, z8] }) => [
    id3,
    (occupied.has(key(x + 1, y, z8)) ? 1 : 0) | (occupied.has(key(x, y, z8 + 1)) ? 2 : 0) | (occupied.has(key(x - 1, y, z8)) ? 4 : 0) | (occupied.has(key(x, y, z8 - 1)) ? 8 : 0)
  ]));
}

// engine/src/sdk/environment.ts
function validateEnvironmentDefinition(definition) {
  const maxStairGrade = 1.5;
  const maxSpanSteps = definition?.structures?.maxSpanSteps;
  if (!Number.isSafeInteger(maxSpanSteps) || maxSpanSteps < 1 || maxSpanSteps > 64) {
    throw new Error("structures.maxSpanSteps must be an integer from 1 through 64");
  }
  const catalog = definition?.structures?.catalog;
  if (!Array.isArray(catalog) || catalog.length > 64) {
    throw new Error("structures.catalog must contain at most 64 entries");
  }
  const ids = /* @__PURE__ */ new Set();
  for (const entry of catalog) {
    if (!entry || typeof entry.id !== "string" || entry.id.length === 0 || entry.id.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(entry.id) || ids.has(entry.id) || !Number.isFinite(entry.workSeconds) || entry.workSeconds <= 0 || entry.workSeconds > 86400 || !Number.isSafeInteger(entry.workReachBelowCells) || entry.workReachBelowCells < 0 || !Array.isArray(entry.materials) || entry.materials.length < 1 || entry.materials.length > 16) {
      throw new Error("invalid structure catalog entry");
    }
    ids.add(entry.id);
    const shape = entry.shape;
    if (!shape || shape.kind !== "floor" && shape.kind !== "cover" && shape.kind !== "fixture" && shape.kind !== "wall" && shape.kind !== "aperture" && shape.kind !== "stair" || shape.kind === "fixture" && (!Array.isArray(shape.footprint) || shape.footprint.length < 1 || shape.footprint.length > 16 || shape.footprint.some((cell3) => !Array.isArray(cell3) || cell3.length !== 2 || !Number.isSafeInteger(cell3[0]) || !Number.isSafeInteger(cell3[1]) || Math.abs(cell3[0]) > 8 || Math.abs(cell3[1]) > 8)) || shape.kind === "wall" && (!Number.isSafeInteger(shape.height) || shape.height < 1 || shape.height > 64) || shape.kind === "aperture" && (!Number.isSafeInteger(shape.height) || shape.height < 1 || shape.height > 64 || !Number.isSafeInteger(shape.openingBottom) || !Number.isSafeInteger(shape.openingHeight) || shape.openingHeight < 1 || shape.openingBottom < 0 || shape.openingBottom + shape.openingHeight >= shape.height) || shape.kind === "stair" && (!Number.isSafeInteger(shape.run) || !Number.isSafeInteger(shape.rise) || shape.run < 1 || shape.run > 64 || shape.rise < 1 || shape.rise > 64 || !Number.isFinite(definition.world.verticalMetres) || shape.rise * definition.world.verticalMetres / shape.run > maxStairGrade)) {
      throw new Error("invalid structure catalog shape");
    }
    if (shape.kind === "fixture" && new Set(shape.footprint.map(([x, z8]) => `${x},${z8}`)).size !== shape.footprint.length)
      throw new Error("invalid structure fixture footprint");
    const completion = entry.onComplete;
    if (completion !== void 0) {
      if (!completion || completion.components !== void 0 && (!Array.isArray(completion.components) || completion.components.length > 32) || completion.ports !== void 0 && (!Array.isArray(completion.ports) || completion.ports.length > 16))
        throw new Error("invalid structure completion recipe");
      const validateComponents = (components) => {
        const names = /* @__PURE__ */ new Set();
        for (const component2 of components) {
          if (!component2 || typeof component2.name !== "string" || !/^[A-Za-z0-9._:-]+$/.test(component2.name) || names.has(component2.name) || !component2.value || typeof component2.value !== "object" || Array.isArray(component2.value)) throw new Error("invalid completion component");
          names.add(component2.name);
        }
      };
      validateComponents(completion.components ?? []);
      const keys = /* @__PURE__ */ new Set();
      for (const port of completion.ports ?? []) {
        if (!port || typeof port.key !== "string" || !/^[A-Za-z0-9._:-]+$/.test(port.key) || keys.has(port.key) || !Array.isArray(port.components) || port.components.length > 32 || port.at !== void 0 && port.at !== "site-contact") throw new Error("invalid completion port");
        keys.add(port.key);
        validateComponents(port.components);
      }
    }
    const removal = entry.onRemove;
    if (removal !== void 0) {
      if (removal.salvage !== void 0 && (!Array.isArray(removal.salvage) || removal.salvage.length > 1) || removal.emptyPorts !== void 0 && (!Array.isArray(removal.emptyPorts) || removal.emptyPorts.length > 16)) throw new Error("invalid structure removal recipe");
      const inputKinds = new Map(entry.materials.map((material) => [material.kind, material.quantity]));
      const seenSalvage = /* @__PURE__ */ new Set();
      for (const salvage of removal.salvage ?? []) {
        if (!salvage || typeof salvage.kind !== "string" || !/^[A-Za-z0-9._:-]+$/.test(salvage.kind) || seenSalvage.has(salvage.kind) || !Number.isSafeInteger(salvage.quantity) || salvage.quantity <= 0 || salvage.quantity > (inputKinds.get(salvage.kind) ?? 0)) throw new Error("invalid structure removal salvage");
        seenSalvage.add(salvage.kind);
      }
      const portKeys = new Set((completion?.ports ?? []).map((port) => port.key));
      const emptyPorts = /* @__PURE__ */ new Set();
      for (const key of removal.emptyPorts ?? []) {
        if (typeof key !== "string" || !/^[A-Za-z0-9._:-]+$/.test(key) || emptyPorts.has(key) || !portKeys.has(key)) throw new Error("invalid structure removal empty port");
        emptyPorts.add(key);
      }
    }
    const endpointCount = shape.kind === "stair" ? 2 : 1;
    if (endpointCount * (4 + entry.workReachBelowCells * 5) > 32) {
      throw new Error("structure catalog entry exceeds 32 construction access contacts");
    }
    const kinds = /* @__PURE__ */ new Set();
    let totalQuantity = 0;
    for (const material of entry.materials) {
      if (!material || typeof material.kind !== "string" || material.kind.length === 0 || material.kind.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(material.kind) || kinds.has(material.kind) || !Number.isSafeInteger(material.quantity) || material.quantity <= 0 || material.quantity > 4294967295) {
        throw new Error("invalid structure required material");
      }
      kinds.add(material.kind);
      totalQuantity += material.quantity;
      if (!Number.isSafeInteger(totalQuantity) || totalQuantity > 4294967295) {
        throw new Error("structure material quantity exceeds capacity");
      }
    }
  }
  const resources = definition?.resourceSites ?? [];
  if (!Array.isArray(resources) || resources.length > 64) throw new Error("resource catalog exceeds 64 entries");
  const resourceIds = /* @__PURE__ */ new Set();
  for (const resource of resources) {
    if (!resource || typeof resource.id !== "string" || !/^[A-Za-z0-9._:-]+$/.test(resource.id) || resourceIds.has(resource.id) || typeof resource.outputKind !== "string" || !/^[A-Za-z0-9._:-]+$/.test(resource.outputKind) || !Number.isSafeInteger(resource.outputQuantity) || resource.outputQuantity < 1 || ![resource.sowSeconds, resource.tendSeconds, resource.harvestSeconds].every((value) => Number.isFinite(value) && value > 0) || !Array.isArray(resource.stages) || resource.stages.length < 1 || resource.stages.length > 64 || resource.stages.some((stage) => !stage || !Number.isFinite(stage.delaySeconds) || stage.delaySeconds <= 0 || !Number.isSafeInteger(stage.waterPortions) || stage.waterPortions < 1 || stage.waterPortions > 7)) {
      throw new Error("invalid resource definition");
    }
    resourceIds.add(resource.id);
  }
}
function encodeEnvironmentDefinition(definition) {
  validateEnvironmentDefinition(definition);
  return new TextEncoder().encode(JSON.stringify(definition));
}

// engine/src/games/colony-environment.ts
var colonyWorldBounds = Object.freeze({
  minX: -32,
  maxX: 32,
  minY: -32,
  maxY: 40,
  minZ: -32,
  maxZ: 32
});
var colonyEnvironment = {
  world: {
    seed: "colony-world-v1",
    identity: "colony",
    bounds: colonyWorldBounds,
    slots: { air: 0, soil: 1, stone: 2 },
    seaLevel: 12,
    verticalMetres: 0.54
  },
  // Smoke samples use the same full world bounds as terrain. Outside
  // this domain is unmodeled, never reported as smoke-free air.
  atmosphere: {
    regionId: "colony-village-air",
    min: { x: colonyWorldBounds.minX, y: colonyWorldBounds.minY, z: colonyWorldBounds.minZ },
    max: { x: colonyWorldBounds.maxX, y: colonyWorldBounds.maxY, z: colonyWorldBounds.maxZ },
    exterior: "WorldTop",
    ambientTemperatureC: 20,
    spreadPerSecond: 1,
    riseBias: 0.1,
    wind: [0, 0, 0],
    outdoorLossPerSecond: 0.1,
    heatCapacityJPerM3K: 1200
  },
  emissions: [{
    id: "wood-hearth",
    materialKind: "wood",
    quantity: 1,
    durationS: 30,
    smokeKg: 0.03,
    heatJ: 3e4
  }],
  processes: [{
    id: "herbal-ale-v1",
    version: 1,
    stationCatalog: "brew-station",
    inputs: [
      { role: "malt", port: "kettle", material: "malt", quantity: 2, policy: "portion", disposition: "consume" },
      { role: "water", port: "kettle", material: "water", quantity: 2, policy: "portion", disposition: "consume" },
      { role: "mugwort", port: "kettle", material: "mugwort", quantity: 1, policy: "whole-lot", disposition: "consume" },
      { role: "wood", port: "hearth", material: "wood", quantity: 1, policy: "portion", disposition: "emission-source" },
      { role: "barm", port: "barm", material: "barm", quantity: 1, policy: "whole-lot", disposition: "retain" },
      { role: "keg", port: "keg", material: "keg", quantity: 1, policy: "whole-lot", disposition: "retain" }
    ],
    stages: [
      { id: "prepare", mode: "attended", durationSeconds: 40, transition: { consumeRoles: ["malt", "water", "mugwort"], emission: { role: "wood", catalog: "wood-hearth" } } },
      { id: "ferment", mode: "elapsed", durationSeconds: 240, transition: {} },
      { id: "keg", mode: "attended", durationSeconds: 20, transition: { outputs: [
        { role: "ale", material: "ale", quantity: 4, destination: { kind: "retained-container", role: "keg" } },
        { role: "spent-grain", material: "spent-grain", quantity: 1, destination: { kind: "station-port", port: "tray" } }
      ] } }
    ]
  }],
  resourceSites: [{
    id: "mugwort",
    outputKind: "mugwort",
    outputQuantity: 1,
    sowSeconds: 2,
    tendSeconds: 2,
    harvestSeconds: 1,
    stages: [
      { delaySeconds: 20, waterPortions: 1 },
      { delaySeconds: 80, waterPortions: 1 },
      { delaySeconds: 240, waterPortions: 1 }
    ]
  }],
  structures: {
    maxSpanSteps: 6,
    catalog: [
      {
        id: "timber-floor",
        shape: { kind: "floor" },
        workReachBelowCells: 4,
        materials: [{ kind: "wood", quantity: 2 }],
        workSeconds: 2,
        onRemove: { salvage: [{ kind: "wood", quantity: 2 }] }
      },
      {
        id: "timber-wall",
        shape: { kind: "wall", height: 4 },
        workReachBelowCells: 0,
        materials: [{ kind: "wood", quantity: 4 }],
        workSeconds: 4,
        onRemove: { salvage: [{ kind: "wood", quantity: 4 }] }
      },
      {
        id: "timber-stair",
        shape: { kind: "stair", run: 2, rise: 4 },
        workReachBelowCells: 0,
        materials: [{ kind: "wood", quantity: 6 }],
        workSeconds: 6,
        onRemove: { salvage: [{ kind: "wood", quantity: 6 }] }
      },
      {
        id: "timber-roof",
        shape: { kind: "cover" },
        workReachBelowCells: 0,
        materials: [{ kind: "wood", quantity: 2 }],
        workSeconds: 3,
        onRemove: { salvage: [{ kind: "wood", quantity: 2 }] }
      },
      {
        id: "timber-bed",
        shape: { kind: "fixture", footprint: [[0, 0], [0, 1]] },
        workReachBelowCells: 0,
        materials: [{ kind: "wood", quantity: 2 }],
        workSeconds: 3,
        onRemove: { salvage: [{ kind: "wood", quantity: 2 }] }
      },
      {
        id: "timber-shelf",
        shape: { kind: "fixture", footprint: [[0, 0], [1, 0]] },
        workReachBelowCells: 0,
        materials: [{ kind: "wood", quantity: 3 }],
        workSeconds: 4,
        onComplete: { ports: [{ key: "storage", at: "site-contact", components: [{ name: "hive.container", value: { capacity: 12 } }, { name: "hive.stockpile-cell", value: { zone: "shelves", priority: 4, filterProfile: "materials" } }] }] },
        onRemove: { salvage: [{ kind: "wood", quantity: 3 }], emptyPorts: ["storage"] }
      },
      {
        id: "brew-station",
        shape: { kind: "fixture", footprint: [[0, 0], [1, 0], [0, 1], [1, 1]] },
        workReachBelowCells: 0,
        materials: [{ kind: "wood", quantity: 6 }],
        workSeconds: 12,
        onComplete: { ports: [
          { key: "kettle", at: "site-contact", components: [{ name: "hive.container", value: { capacity: 5 } }] },
          { key: "hearth", at: "site-contact", components: [
            { name: "hive.container", value: { capacity: 2 } },
            { name: "hive.emitter", value: { catalog: "wood-hearth" } }
          ] },
          { key: "barm", at: "site-contact", components: [{ name: "hive.container", value: { capacity: 1 } }] },
          { key: "keg", at: "site-contact", components: [{ name: "hive.container", value: { capacity: 1 } }] },
          { key: "tray", at: "site-contact", components: [{ name: "hive.container", value: { capacity: 1 } }] }
        ] },
        onRemove: { salvage: [{ kind: "wood", quantity: 3 }], emptyPorts: ["kettle", "hearth", "barm", "keg", "tray"] }
      }
    ]
  },
  materials: [
    {
      slot: 0,
      solid: false,
      diggable: false,
      water: { kind: "open" }
    },
    {
      slot: 1,
      solid: true,
      diggable: true,
      water: {
        kind: "porous",
        rule: {
          id: "soil",
          porosity: 0.4,
          retention: 0.1,
          absorbMPerS: 0.1,
          seepMPerS: 0.1
        }
      },
      excavation: {
        workSeconds: 2,
        outputKind: "soil-spoil",
        unitsPerCell: 3
      }
    },
    {
      slot: 2,
      solid: true,
      diggable: true,
      // Fractured stone stores groundwater too; soil is not the only reservoir.
      water: { kind: "porous", rule: {
        id: "fractured-stone",
        porosity: 0.05,
        retention: 0.01,
        absorbMPerS: 0.01,
        seepMPerS: 0.01
      } },
      excavation: {
        workSeconds: 4,
        outputKind: "stone-spoil",
        unitsPerCell: 3
      }
    }
  ],
  water: {
    id: "colony-water-v1",
    cells: Array.from({ length: 5 }, (_, x) => x - 2).flatMap(
      (x) => Array.from({ length: 5 }, (_, z8) => z8 - 2).flatMap(
        (z8) => Array.from({ length: 5 }, (_, y) => [x, y + 10, z8])
      )
    ),
    fallMPerS: 0.1,
    spreadMPerS: 0.1
  }
};
var colonyInitialPlacements = [
  { entity: "colony.worker.1", column: [0, 0] },
  { entity: "colony.worker.2", column: [0, 2] },
  { entity: "colony.cat.1", column: [1, 1] },
  { entity: "colony.guest.1", column: [3, 1] },
  { entity: "colony.pantry", column: [-2, 0] },
  { entity: "colony.lumber", column: [-3, 1] },
  { entity: "colony.tree.oak", column: [2, 2] },
  { entity: "colony.tree.pine", column: [-5, 4] },
  { entity: "colony.tree.willow", column: [4, -5] }
];
var colonyEnvironmentDefinition = encodeEnvironmentDefinition({
  ...colonyEnvironment,
  initialPlacements: colonyInitialPlacements
});

// engine/src/games/colony-placement.ts
var facing = Object.freeze({ south: 0, east: 1, north: 2, west: 3 });
var axialFacing = Object.freeze({ south: 0, east: 1, north: 0, west: 1 });
var colonyPlacement = {
  "timber-floor": { visual: "colony.floor.finished", alignment: "fixed", facing },
  "timber-wall": { visual: "colony.wall.finished", alignment: "stroke", facing },
  "timber-stair": { visual: "colony.stair.finished", alignment: "fixed", facing },
  "timber-roof": { visual: "colony.roof.finished", alignment: "fixed", facing: axialFacing },
  "timber-bed": { visual: "colony.bed.finished", alignment: "fixed", facing: axialFacing },
  "timber-shelf": { visual: "colony.shelf.finished", alignment: "fixed", facing: axialFacing },
  "brew-station": { visual: "colony.brew-station.finished", alignment: "fixed", facing: axialFacing }
};

// engine/src/games/colony-construction-visuals.ts
function visualGeometry(shape, y) {
  switch (shape.kind) {
    case "wall":
      return { top: y + shape.height - 1, surface: y - 0.5 };
    case "fixture":
      return { top: y, surface: y - 0.5 };
    case "stair":
      return { top: y + shape.rise, surface: y + 0.5 };
    default:
      return { top: y, surface: y + 0.5 };
  }
}
function colonyConstructionVisuals(context) {
  const sites = context.query(query(ConstructionSite)).map((row2) => {
    const site = row2.get(ConstructionSite);
    const definition = colonyEnvironment.structures.catalog.find((item) => item.id === site.catalog);
    if (!definition) throw new Error("Missing construction visual definition");
    return { id: row2.id, site, shape: definition.shape };
  });
  const masks = gridConnectionMasks(sites.filter(({ shape }) => shape.kind === "wall").map(({ id: id3, site }) => ({ id: id3, cell: [site.x, site.y, site.z] })));
  return sites.map(({ id: id3, site, shape }) => {
    const stage = site.phase === "finished" ? "finished" : site.seconds > 0 ? "frame" : "stakes";
    const facing2 = colonyPlacement[site.catalog].facing[site.orientation];
    const geometry = visualGeometry(shape, site.y);
    const mask = masks.get(id3) || (site.orientation === "east" || site.orientation === "west" ? 5 : 10);
    const visual = shape.kind === "wall" ? `colony.wall.${stage}.joint-${mask}` : colonyPlacement[site.catalog].visual.replace(".finished", `.${stage}`);
    return {
      id: id3,
      cutawayTop: geometry.top,
      visual,
      label: `${site.catalog} \xB7 ${site.phase}`,
      pose: { position: { x: site.x, y: geometry.surface * colonyEnvironment.world.verticalMetres, z: site.z }, facing: facing2 }
    };
  });
}

// engine/src/games/colony-brewing-presentation.ts
init_authoring();
init_common();
import { z } from "zod";

// engine/src/sdk/process-supply.ts
init_authoring();

// engine/src/sdk/site-supplies.ts
init_authoring();

// engine/src/sdk/delivery.ts
init_authoring();

// engine/src/sdk/ground-stock.ts
init_authoring();
var GroundStock = component("hive.ground-stock", {
  version: 1,
  fields: {}
});

// engine/src/sdk/work-system.ts
init_authoring();

// engine/src/sdk/work-allocation.ts
var ACCEPTED_DETOUR_RATIO = 1.5;
var ACCEPTED_DETOUR_METRES = 4;
var MAX_VALIDATED_ASSIGNMENTS_PER_STEP = 8;
var MAX_ROUTE_VALIDATIONS_PER_STEP = 32;
function materiallyWorse(bound, exact) {
  return exact > Math.max(bound * ACCEPTED_DETOUR_RATIO, bound + ACCEPTED_DETOUR_METRES);
}
function eligibleCandidates(claims, candidates, unavailableActors) {
  const tasks2 = /* @__PURE__ */ new Set();
  const occupied = /* @__PURE__ */ new Set();
  const claimedTasks = /* @__PURE__ */ new Set();
  for (const claim of claims) {
    if (tasks2.has(claim.task)) throw new Error("duplicate work task");
    tasks2.add(claim.task);
    if (claim.actor === null) continue;
    if (occupied.has(claim.actor))
      throw new Error("worker has competing work claims");
    occupied.add(claim.actor);
    claimedTasks.add(claim.task);
  }
  const pairs = /* @__PURE__ */ new Set();
  return candidates.filter((candidate) => {
    if (!tasks2.has(candidate.task))
      throw new Error("candidate references unknown work task");
    if (occupied.has(candidate.worker) || claimedTasks.has(candidate.task) || unavailableActors.has(candidate.worker))
      return false;
    const key = `${candidate.worker}\0${candidate.task}`;
    if (pairs.has(key)) throw new Error("duplicate work candidate pair");
    pairs.add(key);
    return true;
  });
}
function costStates(candidates, lowerBound) {
  return candidates.map((candidate) => {
    const bound = lowerBound(candidate);
    if (!Number.isFinite(bound) || bound < 0)
      throw new Error("invalid work candidate lower bound");
    return { candidate, bound, exact: void 0 };
  });
}
function proposedCosts(states) {
  return states.flatMap(
    ({ candidate, bound, exact }) => exact === null ? [] : [
      {
        worker: candidate.worker,
        task: candidate.task,
        cost: exact ?? bound
      }
    ]
  );
}
function selectedState(states, assignment) {
  const state = states.find(
    ({ candidate }) => candidate.worker === assignment.worker && candidate.task === assignment.task
  );
  if (!state) throw new Error("matcher returned unknown work candidate");
  return state;
}
function allocateWork(claims, candidates, lowerBound, estimate, match, unavailableActors = /* @__PURE__ */ new Set(), validationLimit = MAX_VALIDATED_ASSIGNMENTS_PER_STEP) {
  if (!Number.isSafeInteger(validationLimit) || validationLimit < 1)
    throw new Error("invalid work validation limit");
  const states = costStates(
    eligibleCandidates(claims, candidates, unavailableActors),
    lowerBound
  );
  const costed = proposedCosts(states);
  if (!costed.length) return [];
  let proposed = match(costed);
  let remainingRoutes = MAX_ROUTE_VALIDATIONS_PER_STEP;
  while (remainingRoutes > 0) {
    const exactSelected = proposed.filter((candidate) => {
      const exact2 = selectedState(states, candidate).exact;
      return exact2 !== void 0 && exact2 !== null;
    });
    if (exactSelected.length >= validationLimit) break;
    const assignment = proposed.find(
      (candidate) => selectedState(states, candidate).exact === void 0
    );
    if (!assignment) break;
    const state = selectedState(states, assignment);
    const exact = estimate(state.candidate);
    remainingRoutes--;
    if (exact !== null && (!Number.isFinite(exact) || exact < state.bound))
      throw new Error("invalid exact work candidate cost");
    state.exact = exact;
    if (exact === null || materiallyWorse(state.bound, exact)) {
      const corrected = proposedCosts(states);
      proposed = corrected.length ? [...match(corrected)] : [];
    }
  }
  return proposed.flatMap((assignment) => {
    const exact = selectedState(states, assignment).exact;
    return exact === void 0 || exact === null ? [] : [{ ...assignment, cost: exact }];
  }).slice(0, validationLimit);
}

// engine/src/sdk/work-control.ts
init_authoring();
var WorkParticipation = component(
  "hive.work-participation",
  { version: 1, fields: { automatic: "boolean" } }
);

// engine/src/sdk/work-system.ts
function createWorkSystem(options) {
  return system({
    id: options.id,
    version: options.version,
    reads: [.../* @__PURE__ */ new Set([...options.reads ?? [], WorkParticipation])],
    writes: options.writes,
    every: options.every,
    consumesImpacts: options.consumesImpacts,
    run(context) {
      for (const phase of options.phases ?? []) phase(context);
      const suspendedActors = new Set(
        context.query({ components: [WorkParticipation] }).flatMap(
          (row2) => row2.get(WorkParticipation).automatic ? [] : [row2.id]
        )
      );
      const prepared = options.providers.map((provider) => provider(context, suspendedActors));
      const claims = prepared.flatMap((provider) => provider.claims);
      const occupiedActors = new Set(prepared.flatMap((provider) => provider.occupiedActors ?? []));
      const candidates = prepared.flatMap(
        (provider, providerIndex) => provider.candidates.map((candidate) => ({
          providerIndex,
          ...candidate
        }))
      );
      const taskProviders = /* @__PURE__ */ new Map();
      prepared.forEach((provider, index) => {
        for (const claim of provider.claims) {
          if (taskProviders.has(claim.task)) throw new Error("work task belongs to competing providers");
          taskProviders.set(claim.task, index);
        }
      });
      for (const candidate of candidates)
        if (taskProviders.get(candidate.task) !== candidate.providerIndex)
          throw new Error("work candidate task belongs to another provider");
      const available = candidates.filter(
        (candidate) => !occupiedActors.has(candidate.worker) && !suspendedActors.has(candidate.worker)
      );
      const assignments = allocateWork(
        claims,
        available,
        (candidate) => prepared[candidate.providerIndex].lowerBound(candidate),
        (candidate) => prepared[candidate.providerIndex].estimate(candidate),
        (eligible) => {
          const matched = context.assign(eligible.map(({ worker, task, cost }) => ({ worker, task, cost })));
          return matched.map((assignment) => {
            const candidate = available.find(
              (item) => item.worker === assignment.worker && item.task === assignment.task
            );
            if (!candidate) throw new Error("native matcher returned unknown work assignment");
            return { ...assignment, providerIndex: candidate.providerIndex };
          });
        },
        /* @__PURE__ */ new Set([...occupiedActors, ...suspendedActors])
      );
      const assignmentsByProvider = prepared.map(
        (_, providerIndex) => assignments.filter((assignment) => taskProviders.get(assignment.task) === providerIndex)
      );
      prepared.forEach((provider, providerIndex) => {
        provider.apply(assignmentsByProvider[providerIndex]);
        provider.progress();
      });
    }
  });
}

// engine/src/sdk/delivery.ts
init_common();
function replacementLot(lots, source, material, quantity2, held) {
  let selected;
  for (const lot of lots) {
    if (lot.container !== source || lot.kind !== material || lot.quantity < quantity2 || held.has(lot.id)) continue;
    if (!selected || lot.id < selected.id) selected = lot;
  }
  return selected;
}
var DeliveryControl = component("hive.delivery-control", {
  version: 1,
  fields: { enabled: "boolean", quantity: "number" }
});
var DeliveryTask = component("hive.delivery-task", {
  version: 1,
  fields: {
    actor: "nullable-entity",
    sourceLot: "entity",
    source: "entity",
    destination: "entity",
    material: "string",
    quantity: "number",
    phase: "string"
  }
});
var distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function deliveryProvider(ctx, suspendedActors) {
  const tasks2 = ctx.query(query(DeliveryTask));
  const groundStocks = new Set(ctx.query(query(GroundStock)).map((row2) => row2.id));
  const materialFacts = ctx.workMaterialFacts();
  const sealed = new Set(materialFacts.containers.filter((row2) => row2.sealed).map((row2) => row2.id));
  const controls = ctx.query(query(DeliveryControl));
  const excavations = ctx.query(query(ExcavationWork));
  const positions = ctx.query(query(Position));
  const moving = new Set(ctx.query(query(Destination)).map((row2) => row2.id));
  const positionIds = new Set(positions.map((row2) => row2.id));
  const requestMove = (actor, target2) => {
    ctx.action(move(actor, target2));
  };
  const lots = materialFacts.lots;
  const lotsById = new Map(lots.map((lot) => [lot.id, lot]));
  const containers = new Map(materialFacts.containers.map((container) => [container.id, container]));
  const sourcePositionId = (source) => {
    let current = source;
    const seen = /* @__PURE__ */ new Set();
    for (let depth = 0; depth <= 16; depth++) {
      if (positionIds.has(current)) return current;
      if (seen.has(current)) return null;
      seen.add(current);
      const lot = lotsById.get(current);
      if (!lot || !containers.has(current)) return null;
      current = lot.container;
    }
    return null;
  };
  const bodies = new Map(ctx.query(query(Body)).map((row2) => [row2.id, row2.get(Body)]));
  const quantityByContainer = /* @__PURE__ */ new Map();
  const invalidLotContainers = /* @__PURE__ */ new Set();
  for (const lot of lots) {
    if (!Number.isSafeInteger(lot.quantity) || lot.quantity < 0 || lot.quantity > 4294967295)
      invalidLotContainers.add(lot.container);
    const quantity2 = (quantityByContainer.get(lot.container) ?? 0) + lot.quantity;
    if (!Number.isSafeInteger(quantity2)) invalidLotContainers.add(lot.container);
    quantityByContainer.set(lot.container, quantity2);
  }
  const quantityIn = (container) => {
    if (invalidLotContainers.has(container)) return null;
    return quantityByContainer.get(container) ?? 0;
  };
  const hasCapacity = (container, additional) => {
    const capacity = containers.get(container)?.capacity;
    const quantity2 = quantityIn(container);
    return typeof capacity === "number" && Number.isSafeInteger(capacity) && capacity >= 0 && capacity <= 4294967295 && quantity2 !== null && Number.isSafeInteger(quantity2 + additional) && quantity2 + additional <= capacity;
  };
  const occupiedActors = /* @__PURE__ */ new Set([
    ...excavations.map((row2) => row2.id),
    ...ctx.query(query(ConstructionSite)).flatMap((row2) => {
      const site = row2.get(ConstructionSite);
      return site.worker === null ? [] : [site.worker];
    })
  ]);
  const relevantIds = [
    .../* @__PURE__ */ new Set([
      ...controls.map((row2) => row2.id),
      ...tasks2.flatMap((row2) => {
        const task = row2.get(DeliveryTask);
        const source = sourcePositionId(task.source);
        return [task.actor, source, task.destination];
      })
    ])
  ].filter((id3) => id3 !== null && positionIds.has(id3));
  const poseRows = [];
  for (let offset2 = 0; offset2 < relevantIds.length; offset2 += 128)
    poseRows.push(...ctx.worldPoses(relevantIds.slice(offset2, offset2 + 128)));
  const poses = new Map(poseRows.map((pose) => [pose.id, pose]));
  const sameFrame = (a, b) => poses.get(a)?.support === poses.get(b)?.support;
  const idleTasks = tasks2.filter((row2) => {
    const task = row2.get(DeliveryTask);
    const lot = lotsById.get(task.sourceLot);
    return task.actor === null && task.phase === "idle" && lot?.container === task.source;
  });
  const heldLots = new Set(tasks2.flatMap((row2) => {
    const task = row2.get(DeliveryTask);
    return task.actor !== null && task.phase !== "complete" ? [task.sourceLot] : [];
  }));
  const candidates = controls.flatMap((controlRow) => {
    const control = controlRow.get(DeliveryControl);
    if (!control.enabled || sealed.has(controlRow.id)) return [];
    if (!Number.isSafeInteger(control.quantity) || control.quantity <= 0 || control.quantity > 4294967295 || !bodies.has(controlRow.id) || !Number.isFinite(bodies.get(controlRow.id)?.speed) || (bodies.get(controlRow.id)?.speed ?? 0) <= 0)
      return [];
    const actorPosition = poses.get(controlRow.id);
    if (!actorPosition) return [];
    return idleTasks.flatMap((taskRow) => {
      const task = taskRow.get(DeliveryTask);
      if (sealed.has(task.source) || sealed.has(task.destination) || task.source === task.destination || task.source === controlRow.id || task.destination === controlRow.id || !containers.has(task.source) || !containers.has(task.destination))
        return [];
      const lot = lotsById.get(task.sourceLot);
      const quantity2 = Math.min(control.quantity, task.quantity);
      if (!Number.isSafeInteger(task.quantity) || task.quantity <= 0 || task.quantity > 4294967295 || !lot || lot.container !== task.source || lot.kind !== task.material || !Number.isSafeInteger(lot.quantity) || lot.quantity > 4294967295 || lot.quantity < quantity2 || !hasCapacity(controlRow.id, quantity2) || !hasCapacity(task.destination, quantity2))
        return [];
      const sourceId = sourcePositionId(task.source);
      const sourcePosition = sourceId ? poses.get(sourceId) : void 0;
      const destinationPosition = poses.get(task.destination);
      if (!sourcePosition || !destinationPosition || !sourceId || sourceId !== task.source && bodies.has(sourceId) && sourceId !== controlRow.id || !sameFrame(controlRow.id, sourceId) || !sameFrame(controlRow.id, task.destination))
        return [];
      return [
        {
          worker: controlRow.id,
          task: taskRow.id,
          actorPosition: actorPosition.world,
          sourcePosition: sourcePosition.world,
          sourceTarget: { x: sourcePosition.local.x, y: sourcePosition.local.y, z: sourcePosition.local.z, frame: sourcePosition.support },
          destinationTarget: { x: destinationPosition.local.x, y: destinationPosition.local.y, z: destinationPosition.local.z, frame: destinationPosition.support }
        }
      ];
    });
  });
  const deliveryClaims = tasks2.map((row2) => ({
    task: row2.id,
    actor: row2.get(DeliveryTask).actor
  }));
  let assigned = /* @__PURE__ */ new Set();
  return {
    claims: deliveryClaims,
    occupiedActors: [...occupiedActors],
    candidates,
    lowerBound: (candidate) => distance(candidate.actorPosition, candidate.sourcePosition),
    estimate: (candidate) => {
      const [source, destination] = ctx.routeCosts([
        { actor: candidate.worker, target: candidate.sourceTarget },
        { actor: candidate.worker, target: candidate.destinationTarget }
      ]);
      return source.status === "reachable" && destination.status === "reachable" ? source.cost : null;
    },
    apply: (assignments) => {
      assigned = new Set(assignments.map((assignment) => assignment.task));
      for (const assignment of assignments) {
        const taskRow = idleTasks.find((row2) => row2.id === assignment.task);
        const control = controls.find((row2) => row2.id === assignment.worker)?.get(DeliveryControl);
        if (!taskRow || !control) continue;
        const task = taskRow.get(DeliveryTask);
        ctx.write(DeliveryTask, taskRow.id, {
          ...task,
          actor: assignment.worker,
          quantity: Math.min(control.quantity, task.quantity),
          phase: "to-source"
        });
      }
    },
    progress: () => {
      for (const task of tasks2) {
        const state = task.get(DeliveryTask);
        const selectedLot = lotsById.get(state.sourceLot);
        if (state.actor === null && (state.phase === "idle" || state.phase === "to-source") && selectedLot?.container !== state.source) {
          const replacement = replacementLot(lots, state.source, state.material, state.quantity, heldLots);
          if (replacement) ctx.write(DeliveryTask, task.id, { ...state, sourceLot: replacement.id });
          continue;
        }
        if (state.actor === null || assigned.has(task.id)) continue;
        if (suspendedActors.has(state.actor)) continue;
        if (occupiedActors.has(state.actor)) continue;
        const control = controls.find((row2) => row2.id === state.actor)?.get(DeliveryControl);
        const actor = positions.find((row2) => row2.id === state.actor);
        const sourceId = sourcePositionId(state.source);
        const source = sourceId && positions.find((row2) => row2.id === sourceId);
        const destination = positions.find((row2) => row2.id === state.destination);
        const actorPose = poses.get(state.actor);
        const sourcePose = sourceId ? poses.get(sourceId) : void 0;
        const destinationPose = poses.get(state.destination);
        if (!actor || !source || !destination || !actorPose || !sourcePose || !destinationPose)
          continue;
        if (!sourceId || sourceId !== state.source && bodies.has(sourceId) && sourceId !== state.actor || !sameFrame(state.actor, sourceId) || !sameFrame(state.actor, state.destination))
          continue;
        const lotState = lotsById.get(state.sourceLot);
        if ((state.phase === "idle" || state.phase === "to-source") && lotState?.container !== state.source && lotState?.container !== state.actor) {
          const replacement = replacementLot(lots, state.source, state.material, state.quantity, heldLots);
          if (replacement) {
            ctx.write(DeliveryTask, task.id, { ...state, sourceLot: replacement.id, actor: null, phase: "idle" });
          } else if (state.actor !== null) {
            ctx.write(DeliveryTask, task.id, { ...state, actor: null, phase: "idle" });
          }
          continue;
        }
        if (lotState?.container !== state.destination && (sealed.has(state.actor) || sealed.has(state.destination) || lotState?.container === state.source && sealed.has(state.source))) continue;
        const actorLotState = lotState?.container === state.actor ? lotState : void 0;
        if (state.phase === "putting-down") {
          if (lotState?.container === state.destination) {
            ctx.write(DeliveryTask, task.id, { ...state, actor: null, phase: "complete" });
          } else if (lotState && groundStocks.has(lotState.container) && lotState.container !== state.actor && lotState.container !== state.destination) {
            ctx.write(DeliveryTask, task.id, { ...state, source: lotState.container, actor: null, phase: "idle" });
          } else if (actorLotState) ctx.action(dropLot(state.actor, state.sourceLot));
          continue;
        }
        if (actorLotState && !hasCapacity(state.destination, state.quantity)) {
          ctx.write(DeliveryTask, task.id, { ...state, phase: "putting-down" });
          requestMove(state.actor, { ...actor.get(Position), frame: actorPose.support });
          ctx.action(dropLot(state.actor, state.sourceLot));
          continue;
        }
        if (state.phase === "to-source" && !actorLotState && !hasCapacity(state.destination, state.quantity)) {
          ctx.write(DeliveryTask, task.id, { ...state, actor: null, phase: "idle" });
          requestMove(state.actor, { ...actor.get(Position), frame: actorPose.support });
          continue;
        }
        if (!control?.enabled) {
          if (state.phase !== "idle" && state.phase !== "complete" && !moving.has(state.actor))
            requestMove(state.actor, {
              ...actor.get(Position),
              frame: actorPose.support
            });
          continue;
        }
        if (moving.has(state.actor)) continue;
        if (state.phase === "idle") {
          ctx.write(DeliveryTask, task.id, {
            ...state,
            quantity: Math.min(control.quantity, state.quantity),
            phase: "to-source"
          });
          continue;
        }
        if (state.phase === "to-source") {
          if (actorLotState) {
            ctx.write(DeliveryTask, task.id, { ...state, phase: "carrying" });
            requestMove(state.actor, {
              ...destination.get(Position),
              frame: destinationPose.support
            });
            continue;
          }
          if (distance(actorPose.world, sourcePose.world) <= 1) {
            if (lotState?.container === state.source)
              ctx.action(
                transfer(
                  state.sourceLot,
                  state.source,
                  state.actor,
                  state.quantity
                )
              );
          } else
            requestMove(state.actor, {
              ...source.get(Position),
              frame: sourcePose.support
            });
        } else if (state.phase === "carrying" && actorLotState) {
          ctx.write(DeliveryTask, task.id, { ...state, phase: "to-destination" });
          requestMove(state.actor, {
            ...destination.get(Position),
            frame: destinationPose.support
          });
        } else if (state.phase === "to-destination" && lotState?.container === state.destination) {
          ctx.write(DeliveryTask, task.id, { ...state, actor: null, phase: "complete" });
        } else if (state.phase === "to-destination" && actorLotState && distance(actorPose.world, destinationPose.world) <= 1) {
          if (actorLotState) {
            ctx.write(DeliveryTask, task.id, { ...state, phase: "putting-down" });
            ctx.action(
              transfer(
                actorLotState.id,
                state.actor,
                state.destination,
                state.quantity
              )
            );
          }
        } else if (state.phase === "to-destination" && actorLotState) {
          requestMove(state.actor, {
            ...destination.get(Position),
            frame: destinationPose.support
          });
        } else if (state.phase === "complete" && lotState?.container === state.destination) {
        }
      }
    }
  };
}
var deliverySystem = createWorkSystem({
  id: "hive.delivery",
  version: 1,
  reads: [
    DeliveryTask,
    GroundStock,
    Position,
    Destination,
    Body,
    Container,
    SealedContainer,
    ConstructionSite,
    Support,
    Surface,
    MaterialLot,
    ExcavationWork,
    DeliveryControl
  ],
  writes: [DeliveryTask],
  providers: [deliveryProvider]
});

// engine/src/sdk/site-supplies.ts
var MAX_REQUIREMENTS = 64;
var MAX_SOURCE_CONTAINERS = 128;
var MAX_QUANTITY = 4294967295;
var TASK_PREFIX = "site-supply.";
function validQuantity(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_QUANTITY;
}
function validLotQuantity(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_QUANTITY;
}
function validMaterial(value) {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}
function compareId(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function compareRequirement(left, right) {
  const destination = compareId(left.destination, right.destination);
  if (destination !== 0) return destination;
  return left.material < right.material ? -1 : left.material > right.material ? 1 : 0;
}
function taskId(destination, material, sourceLot, leg = 0) {
  const suffix = leg === 0 ? "" : `.${leg}`;
  const id3 = `${TASK_PREFIX}${destination.length}:${destination}${material.length}:${material}${sourceLot.length}:${sourceLot}${suffix}`;
  if (id3.length > 128)
    throw new Error("site supply task identity exceeds bound");
  return entity(id3);
}
function addChecked(map, key, quantity2) {
  const next = (map.get(key) ?? 0) + quantity2;
  if (!validQuantity(next)) throw new Error("site supply quantity overflow");
  map.set(key, next);
}
function planSiteSupplies(context, options) {
  if (!Array.isArray(options.requirements) || options.requirements.length > MAX_REQUIREMENTS)
    throw new Error("site supply requirement bound exceeded");
  if (!Array.isArray(options.sourceContainers) || options.sourceContainers.length > MAX_SOURCE_CONTAINERS)
    throw new Error("site supply source bound exceeded");
  const batchQuantity = options.batchQuantity ?? 1;
  if (!validQuantity(batchQuantity))
    throw new Error("invalid site supply batch quantity");
  for (const requirement of options.requirements) {
    if (!requirement || typeof requirement !== "object")
      throw new Error("invalid site supply requirement");
    entity(requirement.destination);
    if (!validMaterial(requirement.material) || !validQuantity(requirement.quantity))
      throw new Error("invalid site supply requirement");
  }
  const requirements = [...options.requirements].sort(compareRequirement);
  const seenRequirements = /* @__PURE__ */ new Set();
  for (const requirement of requirements) {
    const key = `${requirement.destination}\0${requirement.material}`;
    if (seenRequirements.has(key))
      throw new Error("duplicate site supply requirement");
    seenRequirements.add(key);
  }
  const sourceIds = [...new Set(options.sourceContainers)].sort(compareId);
  for (const source of sourceIds) entity(source);
  const materialFacts = context.workMaterialFacts();
  const sealed = new Set(materialFacts.containers.filter((row2) => row2.sealed).map((row2) => row2.id));
  const containers = new Map(materialFacts.containers.map((container) => [container.id, container]));
  const lots = materialFacts.lots;
  const tasks2 = context.query(query(DeliveryTask));
  const invalidContainers = /* @__PURE__ */ new Set();
  const quantityByContainer = /* @__PURE__ */ new Map();
  const quantityByDestinationMaterial = /* @__PURE__ */ new Map();
  for (const lot of lots) {
    if (!validLotQuantity(lot.quantity)) {
      invalidContainers.add(lot.container);
      continue;
    }
    if (lot.quantity === 0) continue;
    const total2 = (quantityByContainer.get(lot.container) ?? 0) + lot.quantity;
    if (!Number.isSafeInteger(total2) || total2 > MAX_QUANTITY)
      invalidContainers.add(lot.container);
    else quantityByContainer.set(lot.container, total2);
    const key = `${lot.container}\0${lot.kind}`;
    const materialTotal = (quantityByDestinationMaterial.get(key) ?? 0) + lot.quantity;
    if (!Number.isSafeInteger(materialTotal) || materialTotal > MAX_QUANTITY)
      invalidContainers.add(lot.container);
    else quantityByDestinationMaterial.set(key, materialTotal);
  }
  const reservedByLot = /* @__PURE__ */ new Map();
  const reservedBySourceMaterial = /* @__PURE__ */ new Map();
  const sourceMaterialTotals = /* @__PURE__ */ new Map();
  for (const lot of lots) {
    if (!validLotQuantity(lot.quantity)) continue;
    const key = `${lot.container}\0${lot.kind}`;
    if (lot.quantity > 0) addChecked(sourceMaterialTotals, key, lot.quantity);
  }
  const nextLegByLot = /* @__PURE__ */ new Map();
  const promisedByDestinationMaterial = /* @__PURE__ */ new Map();
  const promisedByDestination = /* @__PURE__ */ new Map();
  const removals = [];
  for (const row2 of tasks2) {
    const task = row2.get(DeliveryTask);
    if (task.phase === "complete") {
      if (row2.id.startsWith(TASK_PREFIX)) removals.push(row2.id);
      continue;
    }
    if (!entity(task.sourceLot) || !entity(task.source) || !entity(task.destination) || !validMaterial(task.material) || !validQuantity(task.quantity) || typeof task.phase !== "string")
      throw new Error("invalid active site supply task");
    addChecked(reservedByLot, task.sourceLot, task.quantity);
    addChecked(reservedBySourceMaterial, `${task.source}\0${task.material}`, task.quantity);
    if (validQuantity(task.quantity) && validMaterial(task.material)) {
      addChecked(
        promisedByDestinationMaterial,
        `${task.destination}\0${task.material}`,
        task.quantity
      );
      addChecked(promisedByDestination, task.destination, task.quantity);
    }
  }
  const availableSources = sourceIds.filter(
    (source) => containers.has(source) && !sealed.has(source) && !invalidContainers.has(source)
  );
  const sourceLots = lots.map((lot) => ({ id: lot.id, lot })).filter(({ lot }) => availableSources.includes(lot.container)).sort((left, right) => compareId(left.id, right.id));
  const created = [];
  const plannedIds = new Set(tasks2.map((row2) => row2.id));
  const plannedRecords = [];
  for (const requirement of requirements) {
    const destinationContainer = containers.get(requirement.destination);
    if (!destinationContainer || sealed.has(requirement.destination) || invalidContainers.has(requirement.destination) || !validQuantity(destinationContainer.capacity))
      continue;
    const destinationQuantity = quantityByContainer.get(requirement.destination) ?? 0;
    const key = `${requirement.destination}\0${requirement.material}`;
    const stocked = quantityByDestinationMaterial.get(key) ?? 0;
    let promised = promisedByDestinationMaterial.get(key) ?? 0;
    let remaining = requirement.quantity - stocked - promised;
    let freeCapacity = destinationContainer.capacity - destinationQuantity - (promisedByDestination.get(requirement.destination) ?? 0);
    if (remaining < 1 || freeCapacity < 1) continue;
    for (const source of sourceLots) {
      if (remaining < 1 || freeCapacity < 1) break;
      if (source.lot.kind !== requirement.material || invalidContainers.has(source.lot.container) || source.lot.container === requirement.destination)
        continue;
      let available = source.lot.quantity - (reservedByLot.get(source.id) ?? 0);
      const sourceKey = `${source.lot.container}\0${source.lot.kind}`;
      available = Math.min(available, (sourceMaterialTotals.get(sourceKey) ?? 0) - (reservedBySourceMaterial.get(sourceKey) ?? 0));
      if (available <= 0) continue;
      const legKey = `${requirement.destination}\0${requirement.material}\0${source.id}`;
      let leg = nextLegByLot.get(legKey) ?? 0;
      while (available > 0 && remaining > 0 && freeCapacity > 0) {
        const quantity2 = Math.min(batchQuantity, remaining, freeCapacity, available);
        if (!validQuantity(quantity2)) break;
        let id3 = taskId(requirement.destination, requirement.material, source.id, leg);
        while (plannedIds.has(id3)) {
          leg++;
          id3 = taskId(requirement.destination, requirement.material, source.id, leg);
        }
        const record = {
          id: id3,
          components: {
            [DeliveryTask.id]: {
              actor: null,
              sourceLot: source.id,
              source: source.lot.container,
              destination: requirement.destination,
              material: requirement.material,
              // This is a finite planning cap. The delivery provider must preserve
              // it when applying a worker's DeliveryControl quantity.
              quantity: quantity2,
              phase: "idle"
            }
          }
        };
        plannedRecords.push(record);
        plannedIds.add(id3);
        created.push(id3);
        reservedByLot.set(source.id, (reservedByLot.get(source.id) ?? 0) + quantity2);
        reservedBySourceMaterial.set(sourceKey, (reservedBySourceMaterial.get(sourceKey) ?? 0) + quantity2);
        remaining -= quantity2;
        freeCapacity -= quantity2;
        available -= quantity2;
        leg++;
        promised += quantity2;
        promisedByDestinationMaterial.set(key, promised);
        promisedByDestination.set(
          requirement.destination,
          (promisedByDestination.get(requirement.destination) ?? 0) + quantity2
        );
      }
      nextLegByLot.set(legKey, leg);
    }
  }
  for (const id3 of removals) context.removeAuthoredEntity(id3);
  for (const record of plannedRecords) context.createAuthoredEntity(record);
  return created;
}

// engine/src/sdk/process-supply.ts
var StagedProcess = component("hive.staged-process", { version: 1, fields: {
  version: "number",
  definition: "string",
  definitionVersion: "number",
  station: "entity",
  worker: "nullable-entity",
  stageIndex: "number",
  progressSeconds: "number",
  enteredTick: "number",
  phase: "string",
  blockedReason: "string"
} });
var requestProcess = (definition, station) => ({ kind: "request-process", definition, station });
var admitProcess = (process, definition, station) => ({ kind: "admit-process", process, definition, station });
var attendProcess = (worker, process) => ({ kind: "attend-process", worker, process });
function processSupplyPhase(ctx) {
  const facts = ctx.workMaterialFacts();
  const lots = facts.lots;
  const admitted = new Set(ctx.outcomes.flatMap(({ action, result }) => action.kind === "admit-process" && result.accepted ? [action.process] : []));
  const waiting = [];
  const rows = ctx.query(query(StagedProcess)).slice().sort((a, b) => a.id.localeCompare(b.id));
  const start = rows.length ? ctx.clock.tick * 4 % rows.length : 0;
  const window = Array.from({ length: Math.min(4, rows.length) }, (_, offset2) => rows[(start + offset2) % rows.length]);
  for (const row2 of window) {
    const process = row2.get(StagedProcess);
    if (process.phase !== "waiting" || admitted.has(row2.id)) continue;
    const requirements = ctx.processRequirements(process.definition, process.station);
    waiting.push({ row: row2, process, requirements });
  }
  const destinations = new Set(waiting.flatMap(({ process, requirements }) => requirements.inputs.map((input) => entity(`${process.station}:${input.port}`))));
  const eligibleSources = facts.containers.filter((container) => !container.sealed && !destinations.has(container.id)).map((container) => container.id).sort((a, b) => a.localeCompare(b));
  const sourceStart = eligibleSources.length ? Math.floor(ctx.clock.tick / 4) * 64 % eligibleSources.length : 0;
  const sourceIds = Array.from({ length: Math.min(64, eligibleSources.length) }, (_, offset2) => eligibleSources[(sourceStart + offset2) % eligibleSources.length]);
  const supply = waiting.flatMap(({ process, requirements }) => requirements.inputs.map((input) => ({ destination: entity(`${process.station}:${input.port}`), material: input.material, quantity: input.quantity })));
  if (supply.length) planSiteSupplies(ctx, { sourceContainers: sourceIds, batchQuantity: 1, requirements: supply });
  for (const { row: row2, process, requirements } of waiting) {
    const ready = requirements.inputs.every((input) => {
      const port = `${process.station}:${input.port}`;
      const matching = lots.filter((lot) => lot.container === port && lot.kind === input.material && lot.quantity > 0);
      return input.policy === "whole-lot" ? matching.some((lot) => lot.quantity === input.quantity) : matching.reduce((sum, lot) => sum + lot.quantity, 0) >= input.quantity;
    });
    if (ready) ctx.action(admitProcess(row2.id, process.definition, process.station));
  }
}

// engine/src/games/colony-brewing-presentation.ts
var emissionFactsSchema = z.object({
  emissions: z.array(
    z.object({
      source: z.string(),
      catalog: z.string(),
      elapsedS: z.number().finite().nonnegative()
    }).passthrough()
  )
}).passthrough();
var profiles = /* @__PURE__ */ new Set([
  "empty",
  "stock-w0-b0-k0",
  "stock-w1-b0-k0",
  "stock-w0-b1-k0",
  "stock-w1-b1-k0",
  "stock-w0-b0-k1",
  "stock-w1-b0-k1",
  "stock-w0-b1-k1",
  "stock-w1-b1-k1",
  "prepare",
  "prepare-attended",
  "ferment",
  "ferment-burning",
  "keg",
  "settled"
]);
function total(lots, container, kind) {
  return lots.reduce(
    (sum, lot) => sum + (lot.container === container && lot.kind === kind ? lot.quantity : 0),
    0
  );
}
function colonyBrewStationProfiles(context) {
  const lots = context.query(query(MaterialLot)).map((row2) => row2.get(MaterialLot));
  const processes = new Map(
    context.query(query(StagedProcess)).map((row2) => [row2.get(StagedProcess).station, row2.get(StagedProcess)])
  );
  const burning = new Set(
    emissionFactsSchema.parse(context.environmentFacts()).emissions.map((row2) => row2.source)
  );
  const result = /* @__PURE__ */ new Map();
  for (const row2 of context.query(query(ConstructionSite))) {
    const site = row2.get(ConstructionSite);
    if (site.catalog !== "brew-station" || site.phase !== "finished") continue;
    const process = processes.get(row2.id);
    let profile;
    if (total(lots, `${row2.id}:tray`, "spent-grain") > 0 || process?.phase === "complete")
      profile = "settled";
    else if (process?.stageIndex === 0)
      profile = process.phase === "working" ? "prepare-attended" : "prepare";
    else if (process?.stageIndex === 1)
      profile = burning.has(`${row2.id}:hearth`) ? "ferment-burning" : "ferment";
    else if (process?.stageIndex === 2) profile = "keg";
    else {
      const water = total(lots, `${row2.id}:kettle`, "water") > 0 ? 1 : 0;
      const barm = total(lots, `${row2.id}:barm`, "barm") > 0 ? 1 : 0;
      const keg = total(lots, `${row2.id}:keg`, "keg") > 0 ? 1 : 0;
      profile = water || barm || keg ? `stock-w${water}-b${barm}-k${keg}` : "empty";
    }
    if (!profiles.has(profile))
      throw new Error("Unknown retained brew-station profile");
    result.set(row2.id, profile);
  }
  return result;
}

// engine/src/games/colony-building.ts
init_authoring();

// engine/src/sdk/placement.ts
function placementOrientation(alignment, area3, explicit) {
  if (explicit) return explicit;
  if (alignment !== "stroke" || !area3) return "north";
  const dx = Math.abs(area3.end[0] - area3.start[0]);
  const dz = Math.abs(area3.end[2] - area3.start[2]);
  return dx >= dz ? "east" : "south";
}
function structureOriginCell(shape, support) {
  const [x, y, z8] = support;
  switch (shape.kind) {
    case "wall":
    case "aperture":
    case "fixture":
      return [x, y + 1, z8];
    case "floor":
    case "cover":
    case "stair":
      return support;
  }
}

// engine/src/games/colony-building.ts
import { z as z2 } from "zod";
var cell = z2.tuple([
  z2.number().int().min(-1e6).max(1e6),
  z2.number().int().min(-1e6).max(1e6),
  z2.number().int().min(-1e6).max(1e6)
]);
var area = z2.object({ start: cell, end: cell }).strict();
var target = z2.union([
  z2.object({ cell }).strict(),
  z2.object({ area }).strict()
]);
var buildInput = z2.object({
  catalog: z2.string().min(1).max(128),
  orientation: z2.enum(["north", "east", "south", "west"]).optional(),
  target
}).strict();
function areaCells(area3) {
  const start = area3.start, end = area3.end;
  if (start[1] !== end[1])
    throw new Error("Choose a same-level build area");
  const width = Math.abs(end[0] - start[0]) + 1;
  const depth = Math.abs(end[2] - start[2]) + 1;
  if (width * depth > 256) throw new Error("Build area exceeds 256 cells");
  const cells = [];
  for (let z8 = Math.min(start[2], end[2]); z8 <= Math.max(start[2], end[2]); z8++)
    for (let x = Math.min(start[0], end[0]); x <= Math.max(start[0], end[0]); x++) cells.push([x, start[1], z8]);
  return cells;
}
var colonyBuildCommand = command({
  title: "Build structure",
  category: "Construction",
  description: "Place a construction plan on a visible world surface.",
  localPresentation: { bindings: [
    ...["timber-floor", "timber-wall", "timber-roof", "timber-bed", "timber-shelf", "brew-station"].map((catalog) => ({
      id: catalog,
      label: `Build ${catalog.replace("timber-", "")}`,
      target: "world-surface",
      designation: catalog === "timber-wall" ? ["point", "line"] : catalog === "timber-floor" || catalog === "timber-roof" ? ["point", "rectangle"] : ["point"],
      preset: { catalog, ...catalog === "timber-floor" || catalog === "timber-roof" || catalog === "timber-bed" || catalog === "timber-shelf" || catalog === "brew-station" ? { orientation: "north" } : {} }
    })),
    ...["north", "east", "south", "west"].map((orientation) => ({ id: `stair-${orientation}`, label: `Stair ${orientation}`, target: "world-surface", designation: ["point"], preset: { catalog: "timber-stair", orientation } }))
  ] },
  input: buildInput,
  reads: [ConstructionSite],
  writes: [],
  run(context, input) {
    const definition = colonyEnvironment.structures.catalog.find((item) => item.id === input.catalog);
    if (!definition) throw new Error("Unknown building");
    const sites = context.query(query(ConstructionSite));
    const area3 = "area" in input.target ? input.target.area : void 0;
    const cells = "area" in input.target ? areaCells(input.target.area) : [input.target.cell];
    if (sites.length + cells.length > 128) throw new Error("Construction site limit reached");
    const actions = [];
    for (const cell3 of cells) {
      const orientation = placementOrientation(colonyPlacement[input.catalog]?.alignment ?? "fixed", area3, input.orientation);
      if (!["north", "east", "south", "west"].includes(orientation)) throw new Error("Choose a cardinal building orientation");
      const [x, y, z8] = structureOriginCell(definition.shape, cell3);
      const id3 = entity(`colony.build.${definition.id}.${x}.${y}.${z8}.${orientation}`);
      if (sites.some((site) => site.id === id3)) continue;
      actions.push(planConstruction(id3, definition.id, { x, y, z: z8 }, orientation));
    }
    return { writes: [], actions };
  }
});

// engine/src/sdk/construction-work.ts
init_authoring();
init_common();
var ConstructionApproach = component(
  "hive.construction-approach",
  { version: 2, fields: { site: "entity", worker: "entity", contactX: "number", contactY: "number", contactZ: "number" } }
);
var MAX_WORKERS = 256;
function distance2(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}
function validateOptions(options) {
  if (!Array.isArray(options.workers) || options.workers.length > MAX_WORKERS)
    throw new Error("construction worker bound exceeded");
  for (const worker of options.workers) {
    entity(worker);
  }
}
function approachIdFor(site) {
  const id3 = `construction-approach.${site.length}:${site}`;
  if (id3.length > 128) throw new Error("construction approach identity exceeds bound");
  return entity(id3);
}
function constructionWorkProvider(ctx, options, suspendedActors) {
  validateOptions(options);
  const workers2 = [...new Set(options.workers)];
  const workerSet = new Set(workers2);
  const sites = ctx.query(query(ConstructionSite));
  for (const row2 of sites) approachIdFor(row2.id);
  const approachRows = ctx.query(query(ConstructionApproach));
  const approaches = /* @__PURE__ */ new Map();
  for (const row2 of approachRows) {
    const state = row2.get(ConstructionApproach);
    if (approaches.has(state.site)) throw new Error("duplicate construction approach claim");
    approaches.set(state.site, { id: row2.id, state });
  }
  const siteIds = new Set(sites.map((row2) => row2.id));
  const access = new Map((siteIds.size === 0 ? [] : ctx.constructionAccess([...siteIds])).map((row2) => [row2.site, row2]));
  for (const row2 of approachRows) {
    if (!siteIds.has(row2.get(ConstructionApproach).site)) ctx.removeAuthoredEntity(row2.id);
  }
  const sealed = new Set(ctx.query(query(SealedContainer)).map((row2) => row2.id));
  const bodies = new Map(ctx.query(query(Body)).map((row2) => [row2.id, row2.get(Body)]));
  const containers = new Map(ctx.query(query(Container)).map((row2) => [row2.id, row2.get(Container)]));
  const traversals = new Map(ctx.query(query(Traversal)).map((row2) => [row2.id, row2.get(Traversal)]));
  const destinations = new Set(ctx.query(query(Destination)).map((row2) => row2.id));
  const supports = new Set(ctx.query(query(Support)).map((row2) => row2.id));
  const excavations = new Set(ctx.query(query(ExcavationWork)).map((row2) => row2.id));
  const positions = new Map(ctx.query(query(Position)).map((row2) => [row2.id, row2.get(Position)]));
  const relevant = workers2;
  const poses = /* @__PURE__ */ new Map();
  for (let offset2 = 0; offset2 < relevant.length; offset2 += 128) {
    for (const pose of ctx.worldPoses(relevant.slice(offset2, offset2 + 128))) poses.set(pose.id, pose);
  }
  const targetFor = (site, contact) => ({ x: contact.x, y: contact.y, z: contact.z, frame: null });
  const activeClaims = sites.flatMap((row2) => {
    const approach = approaches.get(row2.id);
    const state = row2.get(ConstructionSite);
    if (sealed.has(row2.id) || state.phase === "finished")
      return [];
    return [{ task: row2.id, actor: state.worker ?? approach?.state.worker ?? null }];
  });
  const occupiedActors = [...new Set(sites.flatMap((row2) => {
    const worker = row2.get(ConstructionSite).worker;
    return worker === null ? [] : [worker];
  }).concat([...approaches.values()].map(({ state }) => state.worker)))];
  const candidates = sites.flatMap((row2) => {
    const state = row2.get(ConstructionSite);
    if (sealed.has(row2.id) || state.phase === "finished" || state.worker !== null || !access.has(row2.id)) return [];
    const accessRow = access.get(row2.id);
    if (accessRow.support !== "ready" || accessRow.contacts.length === 0) return [];
    const mode = positions.has(row2.id) ? "work" : "bind";
    if (mode === "work" && (!accessRow.materialsReady || approaches.has(row2.id))) return [];
    const contacts = accessRow.contacts;
    if (contacts.length === 0) return [];
    return workers2.flatMap((worker) => {
      const body = bodies.get(worker);
      const pose = poses.get(worker);
      if (!body || !Number.isFinite(body.speed) || body.speed <= 0 || !containers.has(worker) || !traversals.has(worker) || supports.has(worker) || destinations.has(worker) || excavations.has(worker) || !pose) return [];
      return [{ worker, task: row2.id, contacts, mode }];
    });
  });
  const assigned = /* @__PURE__ */ new Set();
  const routed = /* @__PURE__ */ new Map();
  const requestMove = (worker, target2) => {
    ctx.action(move(worker, target2));
  };
  return {
    claims: activeClaims,
    occupiedActors,
    candidates,
    lowerBound: (candidate) => {
      const actor = poses.get(candidate.worker)?.local;
      return actor ? Math.min(...candidate.contacts.map((contact) => distance2(actor, contact))) : 0;
    },
    estimate: (candidate) => {
      const result = ctx.routeToAny({ actor: candidate.worker, targets: candidate.contacts.map((contact2) => targetFor(candidate.task, contact2)) });
      if (result.status !== "reachable") return null;
      const contact = candidate.contacts[result.targetIndex];
      if (!contact) return null;
      routed.set(`${candidate.worker}\0${candidate.task}\0${candidate.mode}`, { contact, target: targetFor(candidate.task, contact), cost: result.cost });
      return result.cost;
    },
    apply: (assignments) => {
      for (const assignment of assignments) {
        const target2 = candidates.find((candidate) => candidate.worker === assignment.worker && candidate.task === assignment.task);
        const mode = target2?.mode;
        const chosen = mode ? routed.get(`${assignment.worker}\0${assignment.task}\0${mode}`) : void 0;
        if (!target2 || !chosen) continue;
        if (mode === "bind") {
          ctx.action(bindConstructionStage(assignment.task, chosen.contact));
          continue;
        }
        ctx.createAuthoredEntity({
          id: approachIdFor(assignment.task),
          components: { [ConstructionApproach.id]: { site: assignment.task, worker: assignment.worker, contactX: chosen.contact.x, contactY: chosen.contact.y, contactZ: chosen.contact.z } }
        });
        assigned.add(assignment.task);
        requestMove(assignment.worker, chosen.target);
      }
    },
    progress: () => {
      for (const row2 of sites) {
        const state = row2.get(ConstructionSite);
        const approach = approaches.get(row2.id);
        if (!approach) continue;
        if (suspendedActors.has(approach.state.worker)) continue;
        if (sealed.has(row2.id) || state.phase === "finished" || state.worker !== null || access.get(row2.id)?.support !== "ready" || !access.get(row2.id)?.materialsReady) {
          ctx.removeAuthoredEntity(approach.id);
          continue;
        }
        if (assigned.has(row2.id)) continue;
        const accessRow = access.get(row2.id);
        const selected = accessRow?.contacts.find((contact) => contact.x === approach.state.contactX && contact.y === approach.state.contactY && contact.z === approach.state.contactZ);
        const target2 = selected ? targetFor(row2.id, selected) : null;
        const workerPose = poses.get(approach.state.worker);
        const workerBody = bodies.get(approach.state.worker);
        if (!workerSet.has(approach.state.worker) || !target2 || !workerPose || !workerBody || !Number.isFinite(workerBody.speed) || workerBody.speed <= 0 || !containers.has(approach.state.worker) || !traversals.has(approach.state.worker) || supports.has(approach.state.worker) || excavations.has(approach.state.worker)) {
          ctx.removeAuthoredEntity(approach.id);
          continue;
        }
        const rejected = ctx.outcomes.some(
          ({ action, result }) => !result.accepted && (action.kind === "move" && action.entity === approach.state.worker && action.destination.x === target2.x && action.destination.y === target2.y && action.destination.z === target2.z && action.destination.frame === target2.frame || action.kind === "attend-construction" && action.worker === approach.state.worker && action.site === row2.id)
        );
        if (rejected) {
          ctx.removeAuthoredEntity(approach.id);
          continue;
        }
        if (!destinations.has(approach.state.worker) && distance2(workerPose.world, { x: approach.state.contactX, y: approach.state.contactY, z: approach.state.contactZ }) <= 1e-7)
          ctx.action(attendConstruction(approach.state.worker, row2.id, { x: approach.state.contactX, y: approach.state.contactY, z: approach.state.contactZ }));
        else requestMove(approach.state.worker, target2);
      }
    }
  };
}

// engine/src/sdk/deconstruction-work.ts
init_authoring();
init_common();
var DeconstructionOrder = component(
  "hive.deconstruction-order",
  {
    version: 3,
    fields: {
      // The accepted physical action removes this target before its durable
      // receipt is reconciled on the following authored step.
      site: "string",
      actor: "nullable-entity",
      phase: "string",
      seconds: "number",
      contactX: "number",
      contactY: "number",
      contactZ: "number",
      reason: "string",
      retryKey: "string"
    }
  }
);
var DeconstructionApproach = component(
  "hive.deconstruction-approach",
  {
    version: 2,
    fields: {
      order: "entity",
      worker: "entity",
      contactX: "number",
      contactY: "number",
      contactZ: "number"
    }
  }
);
var distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
var approachId = (order) => entity(`deconstruction-approach.${order.length}:${order}`);
var queueDeconstruction = (site) => {
  const id3 = entity(`deconstruction-order.${site.length}:${site}`);
  return {
    id: id3,
    components: {
      [DeconstructionOrder.id]: {
        site,
        actor: null,
        phase: "queued",
        seconds: 0,
        contactX: 0,
        contactY: 0,
        contactZ: 0,
        reason: "",
        retryKey: ""
      }
    }
  };
};
function indexDeconstructionFacts(ctx, workers2, suspended) {
  const orders = [...ctx.query(query(DeconstructionOrder))].sort(
    (a, b) => a.id.localeCompare(b.id)
  );
  if (orders.length > 256)
    throw new Error("deconstruction order bound exceeded");
  const sites = new Map(
    ctx.query(query(ConstructionSite)).map((row2) => [row2.id, row2.get(ConstructionSite)])
  );
  const requestedSites = [
    ...new Set(orders.map((row2) => row2.get(DeconstructionOrder).site))
  ];
  const access = new Map(
    (requestedSites.length ? ctx.deconstructionAccess(requestedSites) : []).map(
      (row2) => [row2.site, row2]
    )
  );
  const approaches = new Map(
    ctx.query(query(DeconstructionApproach)).map(
      (row2) => [
        row2.get(DeconstructionApproach).order,
        { id: row2.id, state: row2.get(DeconstructionApproach) }
      ]
    )
  );
  const orderIds = new Set(orders.map((row2) => row2.id));
  for (const approach of approaches.values())
    if (!orderIds.has(approach.state.order))
      ctx.removeAuthoredEntity(approach.id);
  const bodies = new Map(
    ctx.query(query(Body)).map((row2) => [row2.id, row2.get(Body)])
  );
  const containers = new Map(
    ctx.query(query(Container)).map((row2) => [row2.id, row2.get(Container)])
  );
  const quantities = /* @__PURE__ */ new Map();
  for (const row2 of ctx.query(query(MaterialLot))) {
    const lot = row2.get(MaterialLot);
    quantities.set(
      lot.container,
      (quantities.get(lot.container) ?? 0) + lot.quantity
    );
  }
  const traversals = new Set(ctx.query(query(Traversal)).map((row2) => row2.id));
  const positions = new Map(
    workers2.flatMap(
      (_, index) => index % 128 === 0 ? ctx.worldPoses(workers2.slice(index, index + 128)) : []
    ).map((pose) => [pose.id, pose])
  );
  const occupied = /* @__PURE__ */ new Set([
    ...ctx.query(query(ExcavationWork)).map((row2) => row2.id),
    ...ctx.query(query(Destination)).map((row2) => row2.id),
    ...ctx.query(query(Support)).map((row2) => row2.id),
    ...ctx.query(query(ConstructionSite)).flatMap((row2) => {
      const worker = row2.get(ConstructionSite).worker;
      return worker === null ? [] : [worker];
    }),
    ...[...approaches.values()].map(({ state }) => state.worker)
  ]);
  return {
    orders,
    sites,
    access,
    approaches,
    bodies,
    containers,
    quantities,
    traversals,
    positions,
    occupied,
    workers: workers2,
    suspended
  };
}
function workerAvailability(facts, worker) {
  if (facts.suspended.has(worker)) return { kind: "suspended" };
  if (facts.occupied.has(worker)) return { kind: "occupied" };
  const body = facts.bodies.get(worker);
  const container = facts.containers.get(worker);
  if (!body || body.speed <= 0 || !container || !facts.traversals.has(worker)) return { kind: "unavailable" };
  return {
    kind: "eligible",
    capacity: container.capacity,
    quantity: facts.quantities.get(worker) ?? 0,
    pose: facts.positions.get(worker)
  };
}
function workerRetryKey(facts, worker) {
  const availability2 = workerAvailability(facts, worker);
  if (availability2.kind !== "eligible") return `${worker}:ineligible:${availability2.kind}`;
  const pose = availability2.pose?.world;
  const coordinates = pose ? `${pose.x},${pose.y},${pose.z}` : "?,?,?";
  return `${worker}:eligible:${availability2.quantity}:${availability2.capacity}:${coordinates}`;
}
function deconstructionRetryKey(facts, site, rowAccess) {
  const accessKey = rowAccess ? `${rowAccess.status}|${rowAccess.salvageQuantity}|${rowAccess.workSeconds}|${rowAccess.contacts.map((contact) => `${contact.x},${contact.y},${contact.z},${contact.kind}`).join(";")}` : "missing-access";
  const workerKey = facts.workers.map((worker) => workerRetryKey(facts, worker)).join("|");
  return `${site}|${accessKey}|${workerKey}`;
}
function deconstructionWorkProvider(ctx, workers2, suspended) {
  const facts = indexDeconstructionFacts(ctx, workers2, suspended);
  const { activeOrders, claims } = reconcileDeconstructionOrders(ctx, facts);
  const candidates = buildDeconstructionCandidates(facts, activeOrders);
  const assignment = beginDeconstructionAssignment(ctx, facts, candidates);
  return {
    claims,
    occupiedActors: [...facts.occupied],
    candidates,
    lowerBound: assignment.lowerBound,
    estimate: assignment.estimate,
    apply: assignment.apply,
    progress: () => progressDeconstruction(ctx, facts, activeOrders)
  };
}
function removeDeconstructionOrder(ctx, facts, order) {
  ctx.removeAuthoredEntity(order);
  const approach = facts.approaches.get(order);
  if (approach) ctx.removeAuthoredEntity(approach.id);
}
function removeDeconstructionApproach(ctx, facts, order) {
  const approach = facts.approaches.get(order);
  if (approach) ctx.removeAuthoredEntity(approach.id);
}
function settleDeconstructionOutcome(ctx, facts, row2) {
  const state = row2.get(DeconstructionOrder);
  const outcome = ctx.outcomes.find(
    ({ action }) => action.kind === "deconstruct" && action.worker === state.actor && action.site === state.site
  );
  if (!outcome) return false;
  if (outcome.result.accepted) {
    removeDeconstructionOrder(ctx, facts, row2.id);
  } else {
    removeDeconstructionApproach(ctx, facts, row2.id);
    ctx.write(DeconstructionOrder, row2.id, {
      ...state,
      actor: null,
      phase: "blocked",
      reason: (outcome.result.reason ?? "Deconstruction was rejected").slice(
        0,
        512
      ),
      retryKey: deconstructionRetryKey(
        facts,
        state.site,
        facts.access.get(state.site)
      )
    });
  }
  return true;
}
function reconcileDeconstructionOrders(ctx, facts) {
  const liveSites = /* @__PURE__ */ new Set();
  const removedOrders = /* @__PURE__ */ new Set();
  for (const row2 of facts.orders) {
    const state = row2.get(DeconstructionOrder);
    if (!facts.sites.has(state.site) || state.phase === "complete" || liveSites.has(state.site)) {
      removeDeconstructionOrder(ctx, facts, row2.id);
      removedOrders.add(row2.id);
      continue;
    }
    liveSites.add(state.site);
    if (settleDeconstructionOutcome(ctx, facts, row2)) {
      removedOrders.add(row2.id);
      continue;
    }
    if (state.actor !== null && !facts.approaches.has(row2.id))
      ctx.write(DeconstructionOrder, row2.id, {
        ...state,
        actor: null,
        phase: "queued",
        reason: "",
        retryKey: ""
      });
  }
  const activeOrders = facts.orders.filter((row2) => !removedOrders.has(row2.id));
  const claims = activeOrders.flatMap((row2) => {
    const state = row2.get(DeconstructionOrder);
    return facts.sites.has(state.site) && state.phase !== "complete" ? [{ task: row2.id, actor: state.actor }] : [];
  });
  return { activeOrders, claims };
}
function orderCanStart(facts, row2, access) {
  const state = row2.get(DeconstructionOrder);
  const site = facts.sites.get(state.site);
  if (!site || site.phase !== "finished" || state.actor !== null || facts.approaches.has(row2.id))
    return false;
  if (!access || access.status !== "ready" || access.contacts.length === 0)
    return false;
  return state.phase !== "blocked" || state.retryKey !== deconstructionRetryKey(facts, state.site, access);
}
function workerCanDeconstruct(facts, worker, salvageQuantity) {
  const availability2 = workerAvailability(facts, worker);
  return availability2.kind === "eligible" && availability2.pose !== void 0 && availability2.quantity + salvageQuantity <= availability2.capacity;
}
function buildDeconstructionCandidates(facts, orders) {
  return orders.flatMap((row2) => {
    const state = row2.get(DeconstructionOrder);
    const rowAccess = facts.access.get(state.site);
    if (!orderCanStart(facts, row2, rowAccess)) return [];
    return facts.workers.filter(
      (worker) => workerCanDeconstruct(facts, worker, rowAccess.salvageQuantity)
    ).map((worker) => ({
      worker,
      task: row2.id,
      order: row2.id,
      site: state.site,
      contacts: rowAccess.contacts
    }));
  });
}
function beginDeconstructionAssignment(ctx, facts, candidates) {
  const routed = /* @__PURE__ */ new Map();
  return {
    lowerBound: (candidate) => {
      const pose = facts.positions.get(candidate.worker)?.local;
      return pose ? Math.min(
        ...candidate.contacts.map((contact) => distance3(pose, contact))
      ) : 0;
    },
    estimate: (candidate) => {
      const result = ctx.routeToAny({
        actor: candidate.worker,
        targets: candidate.contacts.map((contact2) => ({
          x: contact2.x,
          y: contact2.y,
          z: contact2.z,
          frame: null
        }))
      });
      if (result.status !== "reachable") return null;
      const contact = candidate.contacts[result.targetIndex];
      if (!contact) return null;
      routed.set(`${candidate.worker}\0${candidate.task}`, {
        contact,
        cost: result.cost
      });
      return result.cost;
    },
    apply: (assignments) => {
      for (const assignment of assignments) {
        const candidate = candidates.find(
          (item) => item.worker === assignment.worker && item.task === assignment.task
        );
        const chosen = candidate && routed.get(`${assignment.worker}\0${assignment.task}`);
        if (!candidate || !chosen) continue;
        const state = facts.orders.find((row2) => row2.id === candidate.order)?.get(DeconstructionOrder);
        if (!state) continue;
        ctx.write(DeconstructionOrder, candidate.order, {
          ...state,
          actor: candidate.worker,
          phase: "approaching",
          contactX: chosen.contact.x,
          contactY: chosen.contact.y,
          contactZ: chosen.contact.z,
          reason: "",
          retryKey: ""
        });
        ctx.createAuthoredEntity({
          id: approachId(candidate.order),
          components: {
            [DeconstructionApproach.id]: {
              order: candidate.order,
              worker: candidate.worker,
              contactX: chosen.contact.x,
              contactY: chosen.contact.y,
              contactZ: chosen.contact.z
            }
          }
        });
        ctx.action(
          move(candidate.worker, {
            x: chosen.contact.x,
            y: chosen.contact.y,
            z: chosen.contact.z,
            frame: null
          })
        );
      }
    }
  };
}
function releaseDeconstructionApproach(ctx, facts, row2, approach, phase, reason) {
  const state = row2.get(DeconstructionOrder);
  ctx.removeAuthoredEntity(approach.id);
  ctx.write(DeconstructionOrder, row2.id, {
    ...state,
    actor: null,
    phase,
    reason,
    retryKey: phase === "blocked" ? deconstructionRetryKey(
      facts,
      state.site,
      facts.access.get(state.site)
    ) : ""
  });
}
function matchingRejectedMove(ctx, worker, target2) {
  return ctx.outcomes.find(
    ({ action, result }) => !result.accepted && action.kind === "move" && action.entity === worker && action.destination.x === target2.x && action.destination.y === target2.y && action.destination.z === target2.z && action.destination.frame === target2.frame
  );
}
function validApproachAccess(facts, siteId, approach, target2) {
  const site = facts.sites.get(siteId);
  const access = facts.access.get(siteId);
  if (!site || site.phase !== "finished" || !access || access.status !== "ready")
    return void 0;
  return access.contacts.some(
    (contact) => contact.x === target2.x && contact.y === target2.y && contact.z === target2.z
  ) ? access : void 0;
}
function progressApproach(ctx, facts, row2, approach) {
  if (facts.suspended.has(approach.state.worker)) {
    releaseDeconstructionApproach(ctx, facts, row2, approach, "queued", "");
    return;
  }
  const target2 = {
    x: approach.state.contactX,
    y: approach.state.contactY,
    z: approach.state.contactZ,
    frame: null
  };
  const pose = facts.positions.get(approach.state.worker);
  const state = row2.get(DeconstructionOrder);
  const access = validApproachAccess(facts, state.site, approach, target2);
  if (!pose || !access) {
    releaseDeconstructionApproach(
      ctx,
      facts,
      row2,
      approach,
      "blocked",
      "Waiting for reachable site"
    );
    return;
  }
  const rejectedMove = matchingRejectedMove(ctx, approach.state.worker, target2);
  if (rejectedMove) {
    const reason = (rejectedMove.result.reason ?? "Movement to deconstruction contact was rejected").slice(0, 512);
    releaseDeconstructionApproach(ctx, facts, row2, approach, "blocked", reason);
    return;
  }
  if (distance3(pose.world, target2) > 1e-7) {
    ctx.action(move(approach.state.worker, target2));
    return;
  }
  const seconds = Math.min(state.seconds + ctx.clock.delta, access.workSeconds);
  const phase = seconds >= access.workSeconds ? "submitting" : "working";
  ctx.write(DeconstructionOrder, row2.id, {
    ...state,
    actor: approach.state.worker,
    phase,
    seconds,
    reason: "",
    retryKey: ""
  });
  if (phase === "submitting")
    ctx.action(deconstruct(approach.state.worker, state.site));
}
function progressDeconstruction(ctx, facts, orders) {
  for (const row2 of orders) {
    const approach = facts.approaches.get(row2.id);
    if (approach && row2.get(DeconstructionOrder).phase !== "submitting")
      progressApproach(ctx, facts, row2, approach);
  }
}

// engine/src/games/colony.ts
init_authoring();
init_common();

// engine/src/sdk/process-attendance.ts
init_authoring();
init_common();
var ProcessAttendanceWork = component("hive.process-attendance", { version: 1, fields: { process: "entity", actor: "entity", contactX: "number", contactY: "number", contactZ: "number" } });
var CONTACT_DISTANCE = 1.5;
var MAX_PROCESSES = 64;
var MAX_WORKERS2 = 256;
function processAttendanceProvider(ctx, workers2, suspended) {
  if (workers2.length > MAX_WORKERS2) throw new Error("process worker bound exceeded");
  const rows = ctx.query(query(StagedProcess));
  if (rows.length > MAX_PROCESSES) throw new Error("staged process bound exceeded");
  const workerIds = [...new Set(workers2)];
  const processes = rows.map((row2) => ({ id: row2.id, state: row2.get(StagedProcess) }));
  const positions = new Map(ctx.query(query(Position)).map((row2) => {
    const p = row2.get(Position);
    return [row2.id, { x: p.x, y: p.y, z: p.z, frame: null }];
  }));
  const bodies = new Set(ctx.query(query(Body)).filter((row2) => row2.get(Body).speed > 0).map((row2) => row2.id));
  const containers = new Set(ctx.query(query(Container)).map((row2) => row2.id));
  const traversals = new Set(ctx.query(query(Traversal)).map((row2) => row2.id));
  const supports = new Set(ctx.query(query(Support)).map((row2) => row2.id));
  const destinations = new Set(ctx.query(query(Destination)).map((row2) => row2.id));
  const excavating = new Set(ctx.query(query(ExcavationWork)).map((row2) => row2.id));
  const targets = /* @__PURE__ */ new Map();
  for (const process of processes) {
    const contact = positions.get(process.state.station);
    if (contact) targets.set(process.id, contact);
  }
  const attendanceRows = ctx.query(query(ProcessAttendanceWork));
  const attendance = new Map(attendanceRows.map((row2) => [row2.get(ProcessAttendanceWork).process, { id: row2.id, state: row2.get(ProcessAttendanceWork) }]));
  const initialCandidates = processes.filter((process) => process.state.phase === "waiting" && process.state.stageIndex === 0 && !attendance.has(process.id));
  const facts = initialCandidates.length ? ctx.workMaterialFacts() : null;
  const readyForStage = (process) => {
    if (process.state.phase !== "waiting") return false;
    const requirements = ctx.processRequirements(process.state.definition, process.state.station);
    const stage = requirements.stages[process.state.stageIndex];
    if (!stage || stage.mode !== "attended") return false;
    if (process.state.stageIndex !== 0) return true;
    const lots = facts?.lots ?? [];
    return requirements.inputs.every((input) => {
      const matching = lots.filter((lot) => lot.container === `${process.state.station}:${input.port}` && lot.kind === input.material && lot.quantity > 0);
      return input.policy === "whole-lot" ? matching.some((lot) => lot.quantity === input.quantity) : matching.reduce((sum, lot) => sum + lot.quantity, 0) >= input.quantity;
    });
  };
  const eligibleWorkers = workerIds.filter((worker) => bodies.has(worker) && containers.has(worker) && traversals.has(worker) && positions.has(worker) && !supports.has(worker) && !destinations.has(worker) && !excavating.has(worker) && !suspended.has(worker));
  const discoverable = processes.filter(readyForStage).filter((process) => !attendance.has(process.id));
  const processStart = discoverable.length ? ctx.clock.tick * 4 % discoverable.length : 0;
  const active = Array.from({ length: Math.min(4, discoverable.length) }, (_, offset2) => discoverable[(processStart + offset2) % discoverable.length]);
  const claims = processes.map(({ id: id3, state }) => ({ task: id3, actor: state.phase === "working" ? state.worker : attendance.get(id3)?.state.actor ?? null }));
  const candidates = active.flatMap((process) => {
    const target2 = targets.get(process.id);
    const workerStart = eligibleWorkers.length ? ctx.clock.tick * 32 % eligibleWorkers.length : 0;
    const selectedWorkers2 = Array.from({ length: Math.min(32, eligibleWorkers.length) }, (_, offset2) => eligibleWorkers[(workerStart + offset2) % eligibleWorkers.length]);
    return target2 ? selectedWorkers2.map((worker) => ({ worker, task: process.id, target: target2 })) : [];
  });
  return {
    claims,
    candidates,
    lowerBound(candidate) {
      const pose = positions.get(candidate.worker);
      return pose ? Math.hypot(pose.x - candidate.target.x, pose.y - candidate.target.y, pose.z - candidate.target.z) : 0;
    },
    estimate(candidate) {
      const route = ctx.routeCosts([{ actor: candidate.worker, target: candidate.target }])[0];
      return route?.status === "reachable" ? route.cost : null;
    },
    apply(assignments) {
      for (const assignment of assignments) {
        const candidate = candidates.find((item) => item.worker === assignment.worker && item.task === assignment.task);
        if (!candidate) throw new Error("unknown process attendance assignment");
        const pose = positions.get(candidate.worker);
        const attendanceId = `process-attendance.${candidate.task}`;
        ctx.createAuthoredEntity({ id: attendanceId, components: { [ProcessAttendanceWork.id]: { process: candidate.task, actor: candidate.worker, contactX: candidate.target.x, contactY: candidate.target.y, contactZ: candidate.target.z } } });
        if (pose && Math.hypot(pose.x - candidate.target.x, pose.y - candidate.target.y, pose.z - candidate.target.z) <= CONTACT_DISTANCE) ctx.action(attendProcess(candidate.worker, candidate.task));
        else ctx.action(move(candidate.worker, candidate.target));
      }
    },
    progress() {
      for (const row2 of attendanceRows) {
        const work = row2.get(ProcessAttendanceWork);
        const process = processes.find((item) => item.id === work.process);
        const target2 = targets.get(work.process);
        const pose = positions.get(work.actor);
        const stage = process && ctx.processRequirements(process.state.definition, process.state.station).stages[process.state.stageIndex];
        if (!process || !target2 || !stage || stage.mode !== "attended" || process.state.phase === "blocked" || process.state.phase === "complete" || process.state.phase === "working" && process.state.worker !== work.actor) {
          ctx.removeAuthoredEntity(row2.id);
          continue;
        }
        const contact = { x: work.contactX, y: work.contactY, z: work.contactZ, frame: null };
        const rejected = ctx.outcomes.some(({ action, result }) => !result.accepted && (action.kind === "move" && action.entity === work.actor && action.destination.x === contact.x && action.destination.y === contact.y && action.destination.z === contact.z || action.kind === "attend-process" && action.worker === work.actor && action.process === work.process));
        if (rejected) {
          ctx.removeAuthoredEntity(row2.id);
          continue;
        }
        if (destinations.has(work.actor)) continue;
        if (process.state.phase === "working") {
          ctx.action(attendProcess(work.actor, work.process));
          continue;
        }
        if (pose && Math.hypot(pose.x - contact.x, pose.y - contact.y, pose.z - contact.z) <= CONTACT_DISTANCE) ctx.action(attendProcess(work.actor, work.process));
        else ctx.action(move(work.actor, contact));
      }
    }
  };
}

// engine/src/games/colony-cat.ts
init_authoring();
init_common();
var Cat = component("colony.cat", {
  version: 1,
  fields: {
    home: "entity",
    nextAt: "number",
    seed: "number",
    blockedUntil: "number"
  }
});
var WANDER_INTERVAL = 7;
var RETRY_INTERVAL = 1;
var WANDER_RADIUS = 4;
var MAX_SEED = 4294967295;
var catInitial = (id3, home, position, seed = 1) => ({
  id: id3,
  components: {
    [Position.id]: {
      x: position.x,
      y: position.y,
      z: position.z,
      facing: position.facing ?? 0
    },
    [Body.id]: { speed: 0.9 },
    [Traversal.id]: { clearanceCells: 1, maxStepCells: 1 },
    [Cat.id]: { home, nextAt: 0, seed, blockedUntil: 0 }
  }
});
function nextSeed(seed) {
  return Math.imul(seed >>> 0, 1664525) + 1013904223 >>> 0;
}
function offset(seed) {
  const angle = (seed >>> 0) / (MAX_SEED + 1) * Math.PI * 2;
  const radius = 1.5 + (seed >>> 8) % 250 / 250 * (WANDER_RADIUS - 1.5);
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}
function catRows(context) {
  return context.query(query(Cat, Position, Body, Traversal));
}
var colonyCatSystem = system({
  id: "colony.cat-wander",
  version: 1,
  every: 1,
  reads: [Cat, Position, Body, Traversal, Destination],
  writes: [Cat],
  run(context) {
    const now = context.clock.now;
    const destinations = new Set(
      context.query(query(Destination)).map((row2) => row2.id)
    );
    for (const row2 of catRows(context)) {
      const cat = row2.get(Cat);
      if (now < cat.nextAt || now < cat.blockedUntil) continue;
      const position = row2.get(Position);
      const home = context.query(query(Position)).find((candidate) => candidate.id === cat.home)?.get(Position);
      const seed = nextSeed(cat.seed);
      const previous = context.outcomes.find(
        ({ action }) => action.kind === "move" && action.entity === row2.id
      );
      if (previous && !previous.result.accepted) {
        context.write(Cat, row2.id, {
          ...cat,
          seed,
          nextAt: now + RETRY_INTERVAL,
          blockedUntil: now + RETRY_INTERVAL
        });
        continue;
      }
      if (!home || destinations.has(row2.id)) {
        context.write(Cat, row2.id, {
          ...cat,
          seed,
          nextAt: now + RETRY_INTERVAL
        });
        continue;
      }
      const delta = offset(seed);
      const x = Math.round(home.x + delta.x), z8 = Math.round(home.z + delta.z);
      const surface = context.terrainSurfaces([[x, z8]])[0];
      if (!surface) {
        context.write(Cat, row2.id, {
          ...cat,
          seed,
          nextAt: now + RETRY_INTERVAL,
          blockedUntil: now + RETRY_INTERVAL
        });
        continue;
      }
      const target2 = {
        x,
        y: (surface.cell[1] + 0.5) * colonyEnvironment.world.verticalMetres,
        z: z8,
        frame: null
      };
      const facing2 = Math.round(
        Math.atan2(target2.x - position.x, target2.z - position.z) / (Math.PI / 2)
      ) || 0;
      context.action(move(row2.id, target2, (facing2 % 4 + 4) % 4));
      context.write(Cat, row2.id, {
        ...cat,
        seed,
        nextAt: now + WANDER_INTERVAL,
        blockedUntil: 0
      });
    }
  }
});
var colonyCatComponents = Object.freeze([
  Cat,
  Position,
  Body,
  Traversal,
  Destination
]);

// engine/src/games/colony-water-work.ts
init_authoring();
init_common();

// engine/src/games/colony-components.ts
init_authoring();
var Worker = component("colony.worker", {
  version: 1,
  fields: { guest: "boolean" }
});

// engine/src/games/colony-water-work.ts
var WaterSupplyWork = component("colony.water-supply-work", { version: 1, fields: {
  request: "number",
  attempt: "number",
  phase: "string",
  actor: "nullable-entity",
  vessel: "nullable-entity",
  x: "number",
  y: "number",
  z: "number",
  approachX: "number",
  approachY: "number",
  approachZ: "number",
  reason: "string"
} });
var WaterSupplyOrder = component("colony.water-supply-order", {
  version: 2,
  fields: { revision: "number", process: "nullable-entity" }
});
var empty = (request) => ({ request, attempt: 0, phase: "queued", actor: null, vessel: null, x: 0, y: 0, z: 0, approachX: 0, approachY: 0, approachZ: 0, reason: "" });
var distance4 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function waterSupplyProvider(ctx, suspended) {
  const rows = [...ctx.query(query(WaterSupplyWork, WaterSupplyOrder))].sort((left, right) => left.id.localeCompare(right.id));
  const settle = (row2, state) => {
    if (state.phase === "complete") {
      ctx.removeAuthoredEntity(row2.id);
      return true;
    }
    if (state.phase !== "submitting" || !state.actor || !state.vessel) return false;
    const operation = `colony.water:${row2.id}:${state.request}:${state.attempt}`;
    const outcome = ctx.outcomes.find(({ action }) => action.kind === "exchange-field-water" && action.operation === operation);
    ctx.write(WaterSupplyWork, row2.id, { ...state, phase: outcome?.result.accepted ? "complete" : "queued", actor: null, vessel: null, reason: outcome?.result.reason ?? (outcome ? "Water exchange rejected" : "Missing saved water exchange outcome") });
    return true;
  };
  const queued = rows.filter((row2) => row2.get(WaterSupplyWork).phase === "queued");
  if (queued.length === 0) {
    const active = rows.filter((row2) => ["approaching", "submitting"].includes(row2.get(WaterSupplyWork).phase));
    const actors = active.flatMap((row2) => row2.get(WaterSupplyWork).actor ? [row2.get(WaterSupplyWork).actor] : []);
    const poses2 = actors.length ? new Map(ctx.worldPoses(actors).map((pose) => [pose.id, pose.world])) : /* @__PURE__ */ new Map();
    const moving2 = new Set(ctx.query(query(Destination)).map((row2) => row2.id));
    return { claims: active.map((row2) => ({ task: row2.id, actor: row2.get(WaterSupplyWork).actor })), candidates: [], lowerBound: () => 0, estimate: () => null, apply: () => {
    }, progress: () => {
      for (const row2 of rows) {
        const state = row2.get(WaterSupplyWork);
        if (settle(row2, state) || state.phase !== "approaching" || !state.actor || !state.vessel) continue;
        const pose = poses2.get(state.actor);
        const approach = { x: state.approachX, y: state.approachY, z: state.approachZ };
        const operation = `colony.water:${row2.id}:${state.request}:${state.attempt}`;
        if (!pose || moving2.has(state.actor) || distance4(pose, approach) > 1.5) continue;
        ctx.action(exchangeFieldWater(operation, state.actor, state.vessel, { x: state.x, y: state.y, z: state.z }));
        ctx.write(WaterSupplyWork, row2.id, { ...state, phase: "submitting" });
      }
    } };
  }
  const workers2 = ctx.query(query(Worker, Body, Position, Container)).filter((row2) => !row2.get(Worker).guest && !suspended.has(row2.id));
  const workerIds = new Set(workers2.map((worker) => worker.id));
  const materialFacts = ctx.workMaterialFacts();
  const lots = materialFacts.lots;
  const containers = new Map(materialFacts.containers.map((row2) => [row2.id, row2]));
  const contents = /* @__PURE__ */ new Map();
  for (const lot of lots) if (lot.kind !== "pail") {
    const current = contents.get(lot.container) ?? { quantity: 0, invalid: false };
    current.quantity += lot.quantity;
    current.invalid ||= lot.kind !== "water";
    contents.set(lot.container, current);
  }
  const pails = lots.filter((lot) => lot.kind === "pail" && lot.quantity === 1 && workerIds.has(lot.container)).filter((lot) => {
    const capacity = containers.get(lot.id)?.capacity ?? 0, current = contents.get(lot.id) ?? { quantity: 0, invalid: false };
    return capacity > 0 && !current.invalid && current.quantity < capacity;
  });
  pails.sort((left, right) => left.id.localeCompare(right.id));
  const pailWorkers = [...new Set(pails.map((pail) => pail.container))].sort().slice(0, 16);
  const poses = new Map(pailWorkers.length ? ctx.worldPoses(pailWorkers).map((pose) => [pose.id, pose.world]) : []);
  const eligibleWorkers = pailWorkers.filter((worker) => poses.has(worker));
  const activeActors = [...new Set(rows.flatMap((row2) => {
    const state = row2.get(WaterSupplyWork);
    return ["approaching", "submitting"].includes(state.phase) && state.actor ? [state.actor] : [];
  }))].sort();
  for (const pose of activeActors.length ? ctx.worldPoses(activeActors) : []) poses.set(pose.id, pose.world);
  const centers = eligibleWorkers.map((worker) => {
    const p = poses.get(worker);
    return [p.x, p.y, p.z];
  });
  const water = centers.length ? ctx.waterContacts(centers) : [];
  const moving = new Set(ctx.query(query(Destination)).map((row2) => row2.id));
  const queuedRows = [];
  for (const row2 of rows) {
    const order = row2.get(WaterSupplyOrder), prior = row2.get(WaterSupplyWork);
    if (order.revision < prior.request) throw new Error("invalid water supply request correspondence");
    if (order.revision !== prior.request) ctx.write(WaterSupplyWork, row2.id, empty(order.revision));
    const state = order.revision !== prior.request ? empty(order.revision) : prior;
    if (state.phase !== "queued") continue;
    queuedRows.push(row2.id);
  }
  const candidates = [];
  const rounds = Math.min(pails.length, Math.ceil(128 / Math.max(1, queuedRows.length)));
  for (let round = 0; round < rounds && candidates.length < 128; round++) {
    for (const [taskIndex, task] of queuedRows.entries()) {
      const pail = pails[(round + taskIndex) % pails.length];
      if (!pail || !eligibleWorkers.includes(pail.container) || moving.has(pail.container)) continue;
      const pose = poses.get(pail.container);
      const options = water.slice().sort((left, right) => {
        const cost = (option) => Math.min(...option.approaches.map((approach) => distance4(pose, approach)));
        return cost(left) - cost(right) || left.at[0] - right.at[0] || left.at[1] - right.at[1] || left.at[2] - right.at[2];
      }).slice(0, 8).map((option) => ({ cell: option.at, approaches: option.approaches }));
      if (!options.length) continue;
      candidates.push({ worker: pail.container, task, vessel: pail.id, options });
      if (candidates.length === 128) break;
    }
  }
  const boundedCandidates = candidates;
  const claims = rows.filter((row2) => {
    const state = row2.get(WaterSupplyWork), order = row2.get(WaterSupplyOrder);
    return order.revision !== state.request || state.phase === "queued" || state.phase === "approaching" || state.phase === "submitting";
  }).map((row2) => ({ task: row2.id, actor: row2.get(WaterSupplyWork).actor }));
  const chosen = /* @__PURE__ */ new Map();
  return {
    claims,
    candidates: boundedCandidates,
    lowerBound: (candidate) => {
      const pose = poses.get(candidate.worker);
      return pose ? Math.min(...candidate.options.flatMap((option) => option.approaches).map((a) => distance4(pose, a))) : Number.POSITIVE_INFINITY;
    },
    estimate: (candidate) => {
      const pose = poses.get(candidate.worker);
      if (!pose) return null;
      const targets = candidate.options.flatMap((option) => option.approaches.map((approach) => ({ option, approach })));
      const result = ctx.routeToAny({ actor: candidate.worker, targets: targets.map((target3) => target3.approach) });
      if (result.status !== "reachable") return null;
      const target2 = targets[result.targetIndex];
      if (!target2) return null;
      chosen.set(`${candidate.task}\0${candidate.worker}`, { candidate, cell: target2.option.cell, approach: target2.approach, cost: result.cost });
      return result.cost;
    },
    apply: (assignments) => {
      for (const assignment of assignments) {
        const pick = chosen.get(`${assignment.task}\0${assignment.worker}`);
        if (!pick || pick.candidate.worker !== assignment.worker) continue;
        const { candidate, cell: cell3, approach } = pick;
        const prior = rows.find((row2) => row2.id === assignment.task).get(WaterSupplyWork);
        ctx.write(WaterSupplyWork, assignment.task, { request: prior.request, attempt: prior.attempt + 1, phase: "approaching", actor: candidate.worker, vessel: candidate.vessel, x: cell3[0], y: cell3[1], z: cell3[2], approachX: approach.x, approachY: approach.y, approachZ: approach.z, reason: "" });
        ctx.action(move(candidate.worker, approach));
      }
    },
    progress: () => {
      for (const row2 of rows) {
        const state = row2.get(WaterSupplyWork);
        if (settle(row2, state) || state.phase !== "approaching" || !state.actor || !state.vessel) continue;
        const operation = `colony.water:${row2.id}:${state.request}:${state.attempt}`;
        const pose = poses.get(state.actor);
        const approach = { x: state.approachX, y: state.approachY, z: state.approachZ };
        const failedMove = ctx.outcomes.find((outcome) => outcome.action.kind === "move" && outcome.action.entity === state.actor && !outcome.result.accepted && outcome.action.destination.x === approach.x && outcome.action.destination.y === approach.y && outcome.action.destination.z === approach.z);
        if (failedMove) {
          ctx.write(WaterSupplyWork, row2.id, { ...state, phase: "queued", actor: null, vessel: null, reason: failedMove.result.reason ?? "Water approach unreachable" });
          continue;
        }
        if (!pose || moving.has(state.actor) || distance4(pose, approach) > 1.5) continue;
        ctx.action(exchangeFieldWater(operation, state.actor, state.vessel, { x: state.x, y: state.y, z: state.z }));
        ctx.write(WaterSupplyWork, row2.id, { ...state, phase: "submitting" });
      }
    }
  };
}

// engine/src/games/colony-work.ts
init_authoring();
init_common();

// engine/src/sdk/stockpile.ts
init_authoring();
init_common();
var MAX_CELLS = 256;
var MAX_QUANTITY2 = 4294967295;
var MAX_ID_LENGTH = 256;
var StockpileCell = component("hive.stockpile-cell", {
  version: 1,
  fields: { zone: "string", priority: "number", filterProfile: "string" }
});
function validText(value) {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}
function validInt(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_QUANTITY2;
}
function addChecked2(map, key, quantity2) {
  const total2 = (map.get(key) ?? 0) + quantity2;
  if (!Number.isSafeInteger(total2) || total2 > MAX_QUANTITY2) throw new Error("stockpile source reservation overflow");
  map.set(key, total2);
}
function compareId2(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
var designateStockpile = (zone, cells) => ({
  kind: "designate-stockpile",
  zone,
  cells: cells.map((cell3) => ({ ...cell3, filterProfile: cell3.filterProfile }))
});
var updateStockpile = (zone, filterProfile, priority) => ({
  kind: "update-stockpile",
  zone,
  filterProfile,
  priority
});
function taskId2(cell3, lot, leg = 0) {
  const suffix = leg === 0 ? "" : `.${leg}`;
  const id3 = `stockpile.delivery.${cell3.length}:${cell3}.${lot.length}:${lot}${suffix}`;
  if (id3.length > MAX_ID_LENGTH) throw new Error("stockpile delivery identity exceeds bound");
  return entity(id3);
}
function planStockpileDeliveries(context, options) {
  const cells = context.query(query(StockpileCell));
  if (cells.length > MAX_CELLS) throw new Error("stockpile cell bound exceeded");
  const cellIds = new Set(cells.map((row2) => row2.id));
  const containers = new Map(context.query(query(Container)).map((row2) => [row2.id, row2.get(Container)]));
  const positions = new Set(context.query(query(Position)).map((row2) => row2.id));
  const sealed = new Set(context.query(query(SealedContainer)).map((row2) => row2.id));
  const ground = new Set(context.query(query(GroundStock)).map((row2) => row2.id));
  const exhaustedFinite = new Set(context.query(query(FiniteResource)).filter((row2) => row2.get(FiniteResource).quantity === 0).map((row2) => row2.id));
  const lots = context.query(query(MaterialLot));
  const tasks2 = context.query(query(DeliveryTask));
  const sourceCell = new Map(cells.map((cell3) => [cell3.id, cell3.get(StockpileCell)]));
  const lotById = new Map(lots.map((row2) => [row2.id, row2.get(MaterialLot)]));
  const quantities = /* @__PURE__ */ new Map();
  for (const row2 of lots) {
    const lot = row2.get(MaterialLot);
    if (!validInt(lot.quantity)) continue;
    const total2 = (quantities.get(lot.container) ?? 0) + lot.quantity;
    if (total2 <= MAX_QUANTITY2) quantities.set(lot.container, total2);
  }
  const reservedByLot = /* @__PURE__ */ new Map();
  const reservedBySourceMaterial = /* @__PURE__ */ new Map();
  const sourceMaterialTotals = /* @__PURE__ */ new Map();
  for (const row2 of lots) {
    const lot = row2.get(MaterialLot);
    if (!validInt(lot.quantity) || lot.quantity <= 0) continue;
    const key = `${lot.container}\0${lot.kind}`;
    addChecked2(sourceMaterialTotals, key, lot.quantity);
  }
  const nextLegByLot = /* @__PURE__ */ new Map();
  const incomingByCell = /* @__PURE__ */ new Map();
  for (const row2 of tasks2) {
    const task = row2.get(DeliveryTask);
    if (task.phase === "complete") continue;
    if (validInt(task.quantity) && task.quantity > 0) {
      reservedByLot.set(task.sourceLot, (reservedByLot.get(task.sourceLot) ?? 0) + task.quantity);
      const key = `${task.source}\0${task.material}`;
      reservedBySourceMaterial.set(key, (reservedBySourceMaterial.get(key) ?? 0) + task.quantity);
    }
    if (cellIds.has(task.destination) && validInt(task.quantity) && task.quantity > 0) {
      const incoming = (incomingByCell.get(task.destination) ?? 0) + task.quantity;
      if (incoming <= MAX_QUANTITY2) incomingByCell.set(task.destination, incoming);
    }
  }
  const orderedCells = [...cells].sort((a, b) => {
    const left = a.get(StockpileCell), right = b.get(StockpileCell);
    return right.priority - left.priority || compareId2(a.id, b.id);
  });
  const created = [];
  const sourceLots = lots.map((row2) => ({ id: row2.id, lot: row2.get(MaterialLot) })).filter(({ id: id3, lot }) => (ground.has(lot.container) || sourceCell.has(lot.container) || exhaustedFinite.has(lot.container)) && lot.quantity > 0 && validInt(lot.quantity)).sort((a, b) => compareId2(a.id, b.id));
  for (const row2 of orderedCells) {
    if (sealed.has(row2.id) || !containers.has(row2.id) || !positions.has(row2.id)) continue;
    const policy = row2.get(StockpileCell);
    const profile = options.filterProfiles[policy.filterProfile];
    const container = containers.get(row2.id);
    if (!container || !profile || typeof profile !== "object" || !profile.materialCategories || typeof profile.materialCategories !== "object" || !Array.isArray(profile.allowedCategories) || profile.allowedCategories.length > 64 || profile.allowedMaterials !== void 0 && !Array.isArray(profile.allowedMaterials) || profile.deniedMaterials !== void 0 && !Array.isArray(profile.deniedMaterials) || !validText(policy.filterProfile) || !validInt(container.capacity) || container.capacity <= 0) continue;
    const categories = new Set(profile.allowedCategories.filter(validText));
    const allowedMaterials = new Set((profile.allowedMaterials ?? []).filter(validText));
    const deniedMaterials = new Set((profile.deniedMaterials ?? []).filter(validText));
    if (categories.size !== profile.allowedCategories.length || allowedMaterials.size !== (profile.allowedMaterials ?? []).length || deniedMaterials.size !== (profile.deniedMaterials ?? []).length) continue;
    if (!Object.entries(profile.materialCategories).every(([material, category]) => validText(material) && validText(category))) continue;
    const accepts = (material) => !deniedMaterials.has(material) && (allowedMaterials.has(material) || typeof profile.materialCategories?.[material] === "string" && categories.has(profile.materialCategories[material]));
    const used = quantities.get(row2.id) ?? 0;
    let free = container.capacity - used - (incomingByCell.get(row2.id) ?? 0);
    if (free <= 0) continue;
    for (const source of sourceLots) {
      if (free <= 0) break;
      if (!accepts(source.lot.kind) || sealed.has(source.lot.container) || source.lot.container === row2.id || (quantities.get(source.lot.container) ?? 0) > MAX_QUANTITY2) continue;
      const prior = sourceCell.get(source.lot.container);
      if (prior && policy.priority <= prior.priority) continue;
      const sourceContainer = source.lot.container;
      if (!containers.has(sourceContainer)) continue;
      let available = source.lot.quantity - (reservedByLot.get(source.id) ?? 0);
      const sourceKey = `${source.lot.container}\0${source.lot.kind}`;
      available = Math.min(available, (sourceMaterialTotals.get(sourceKey) ?? 0) - (reservedBySourceMaterial.get(sourceKey) ?? 0));
      if (available <= 0) continue;
      const legKey = `${row2.id}\0${source.id}`;
      let leg = nextLegByLot.get(legKey) ?? 0;
      const quantity2 = Math.min(available, free);
      if (!validInt(quantity2) || quantity2 <= 0) continue;
      let id3 = taskId2(row2.id, source.id, leg);
      while (tasks2.some((task) => task.id === id3)) {
        leg++;
        id3 = taskId2(row2.id, source.id, leg);
      }
      context.createAuthoredEntity({ id: id3, components: { [DeliveryTask.id]: {
        actor: null,
        sourceLot: source.id,
        source: sourceContainer,
        destination: row2.id,
        material: source.lot.kind,
        quantity: quantity2,
        phase: "idle"
      } } });
      created.push(id3);
      reservedByLot.set(source.id, (reservedByLot.get(source.id) ?? 0) + quantity2);
      reservedBySourceMaterial.set(sourceKey, (reservedBySourceMaterial.get(sourceKey) ?? 0) + quantity2);
      free -= quantity2;
      incomingByCell.set(row2.id, (incomingByCell.get(row2.id) ?? 0) + quantity2);
      nextLegByLot.set(legKey, leg + 1);
    }
  }
  return created;
}

// engine/src/games/colony-work.ts
var ColonyResourceOrder = component("colony.resource-order", { version: 1, fields: {
  definition: "string",
  cellX: "number",
  cellY: "number",
  cellZ: "number",
  site: "entity",
  actor: "nullable-entity",
  vessel: "nullable-entity",
  phase: "string",
  workSeconds: "number",
  reason: "string",
  approachX: "number",
  approachY: "number",
  approachZ: "number",
  attempt: "number",
  operation: "string"
} });
function resourceWorkProvider(ctx, suspendedActors) {
  const orders = ctx.query(query(ColonyResourceOrder));
  const workers2 = ctx.query(query(Worker, Body, Position)).filter((row2) => !row2.get(Worker).guest && !suspendedActors.has(row2.id));
  const sites = new Map(ctx.query(query(ResourceSite)).map((row2) => [row2.id, row2.get(ResourceSite)]));
  const definitions = new Map(colonyEnvironment.resourceSites?.map((definition) => [definition.id, definition]) ?? []);
  const materialFacts = ctx.workMaterialFacts();
  const heldPails = /* @__PURE__ */ new Map();
  for (const pail of materialFacts.lots.filter((lot) => lot.kind === "pail" && workers2.some((worker) => worker.id === lot.container))) {
    const water = materialFacts.lots.filter((lot) => lot.kind === "water" && lot.container === pail.id).reduce((sum, lot) => sum + lot.quantity, 0);
    if (water > 0) heldPails.set(pail.container, { vessel: pail.id, water });
  }
  for (const row2 of orders) {
    const state = row2.get(ColonyResourceOrder);
    if (state.actor && ["sow", "tend", "harvest"].includes(state.phase)) {
      const failedMove = ctx.outcomes.find((outcome2) => outcome2.action.kind === "move" && outcome2.action.entity === state.actor && !outcome2.result.accepted && outcome2.action.destination.x === state.approachX && outcome2.action.destination.y === state.approachY && outcome2.action.destination.z === state.approachZ);
      if (failedMove) {
        ctx.write(ColonyResourceOrder, row2.id, { ...state, actor: null, workSeconds: 0, reason: failedMove.result.reason ?? "resource approach rejected" });
        continue;
      }
    }
    if (!state.phase.startsWith("submitting-")) continue;
    const outcome = ctx.outcomes.find((candidate) => candidate.action.kind === (state.phase === "submitting-sow" ? "establish-resource-site" : state.phase === "submitting-tend" ? "tend-resource-site" : "extract-resource") && (candidate.action.kind === "extract-resource" && candidate.action.source === state.site || candidate.action.kind !== "extract-resource" && candidate.action.site === state.site && candidate.action.operation === state.operation));
    if (!outcome) continue;
    if (!outcome.result.accepted) ctx.write(ColonyResourceOrder, row2.id, { ...state, actor: null, phase: state.phase === "submitting-sow" ? "sow" : state.phase === "submitting-tend" ? "tend" : "harvest", reason: outcome.result.reason ?? "physical action rejected", workSeconds: 0 });
    else if (state.phase === "submitting-sow" || state.phase === "submitting-tend") ctx.write(ColonyResourceOrder, row2.id, { ...state, actor: null, vessel: state.phase === "submitting-tend" ? state.vessel : null, phase: "waiting", reason: "", workSeconds: 0 });
    else ctx.write(ColonyResourceOrder, row2.id, { ...state, actor: null, phase: "complete", reason: "", workSeconds: 0 });
  }
  for (const row2 of orders) {
    const state = row2.get(ColonyResourceOrder);
    const site = sites.get(state.site);
    const definition = definitions.get(state.definition);
    if (state.phase === "waiting" && site && definition && ctx.clock.now >= site.nextDue) {
      const required = site.stage < definition.stages.length ? definition.stages[site.stage].waterPortions : 0;
      const enough = [...heldPails.values()].some((pail) => pail.water >= required);
      if (!enough && site.stage < definition.stages.length) {
        const supplyId = entity(`colony.resource-water.${row2.id}`);
        if (!ctx.query(query(WaterSupplyOrder)).some((candidate) => candidate.id === supplyId)) {
          ctx.createAuthoredEntity({ id: supplyId, components: { [WaterSupplyOrder.id]: { revision: ctx.clock.tick + 1, process: null }, [WaterSupplyWork.id]: { request: ctx.clock.tick + 1, attempt: 0, phase: "queued", actor: null, vessel: null, x: state.cellX, y: state.cellY, z: state.cellZ, approachX: state.cellX, approachY: state.cellY, approachZ: state.cellZ, reason: "" } } });
        }
      }
      ctx.write(ColonyResourceOrder, row2.id, { ...state, phase: site.stage >= definition.stages.length ? "harvest" : "tend", actor: null, reason: "", workSeconds: 0 });
    }
  }
  const claims = orders.filter((row2) => row2.get(ColonyResourceOrder).phase !== "complete").map((row2) => ({ task: row2.id, actor: row2.get(ColonyResourceOrder).actor }));
  const poses = new Map(ctx.worldPoses(workers2.map((row2) => row2.id)).map((p) => [p.id, p]));
  const candidates = orders.flatMap((row2) => {
    const state = row2.get(ColonyResourceOrder);
    const site = sites.get(state.site);
    const definition = definitions.get(state.definition);
    return ["sow", "harvest"].includes(state.phase) || state.phase === "tend" && site && definition && heldPails.size > 0 ? workers2.filter((worker) => state.phase !== "tend" || site && definition && (heldPails.get(worker.id)?.water ?? 0) >= definition.stages[site.stage]?.waterPortions).map((worker) => ({ worker: worker.id, task: row2.id, vessel: heldPails.get(worker.id)?.vessel, approaches: [{ x: state.cellX + 1, y: state.cellY + 0.5, z: state.cellZ, frame: null }] })) : [];
  });
  const selected = /* @__PURE__ */ new Map();
  return { claims, candidates, lowerBound: (candidate) => {
    const p = poses.get(candidate.worker)?.local;
    return p ? Math.hypot(p.x - candidate.approaches[0].x, p.z - candidate.approaches[0].z) : 0;
  }, estimate: (candidate) => {
    const result = ctx.routeToAny({ actor: candidate.worker, targets: candidate.approaches });
    if (result.status !== "reachable") return null;
    selected.set(`${candidate.worker}\0${candidate.task}`, candidate.approaches[result.targetIndex]);
    return result.cost;
  }, apply: (assignments) => {
    for (const assignment of assignments) {
      const row2 = orders.find((item) => item.id === assignment.task);
      if (!row2) continue;
      const state = row2.get(ColonyResourceOrder);
      const definition = definitions.get(state.definition);
      if (!definition) continue;
      const approach = selected.get(`${assignment.worker}\0${assignment.task}`) ?? candidates.find((c) => c.worker === assignment.worker && c.task === assignment.task)?.approaches[0];
      if (!approach) continue;
      const pose = poses.get(assignment.worker)?.local;
      const arrived = pose && Math.hypot(pose.x - approach.x, pose.z - approach.z) < 0.1 && Math.abs(pose.y - approach.y) < 0.2;
      if (!arrived) {
        ctx.action(move(assignment.worker, approach));
        ctx.write(ColonyResourceOrder, row2.id, { ...state, actor: assignment.worker, approachX: approach.x, approachY: approach.y, approachZ: approach.z, attempt: state.attempt + 1 });
        continue;
      }
      const site = sites.get(state.site);
      const worker = assignment.worker;
      const work = state.workSeconds + ctx.clock.delta;
      if (state.phase === "sow" && work >= definition.sowSeconds) {
        const operation = `${row2.id}:sow:${state.attempt + 1}`;
        ctx.action(establishResourceSite(operation, worker, state.site, state.definition, { x: state.cellX, y: state.cellY, z: state.cellZ }));
        ctx.write(ColonyResourceOrder, row2.id, { ...state, operation, actor: worker, phase: "submitting-sow", workSeconds: work, reason: "", attempt: state.attempt + 1 });
      } else if (state.phase === "tend" && work >= definition.tendSeconds && (state.vessel ?? candidates.find((candidate) => candidate.worker === worker && candidate.task === row2.id)?.vessel)) {
        const vessel = state.vessel ?? candidates.find((candidate) => candidate.worker === worker && candidate.task === row2.id)?.vessel;
        const operation = `${row2.id}:tend:${state.attempt + 1}`;
        ctx.action(tendResourceSite(operation, worker, state.site, vessel));
        ctx.write(ColonyResourceOrder, row2.id, { ...state, operation, actor: worker, vessel, phase: "submitting-tend", workSeconds: work, reason: "", attempt: state.attempt + 1 });
      } else if (state.phase === "harvest" && work >= definition.harvestSeconds) {
        const operation = `${row2.id}:harvest:${state.attempt + 1}`;
        ctx.action(extractResource(operation, worker, state.site));
        ctx.write(ColonyResourceOrder, row2.id, { ...state, operation, actor: worker, phase: "submitting-harvest", workSeconds: work, reason: "", attempt: state.attempt + 1 });
      } else ctx.write(ColonyResourceOrder, row2.id, { ...state, actor: worker, workSeconds: work });
      void site;
    }
  }, progress: () => {
    for (const row2 of orders) {
      const state = row2.get(ColonyResourceOrder);
      if (!state.actor || !["sow", "tend", "harvest"].includes(state.phase)) continue;
      const definition = definitions.get(state.definition);
      if (!definition) continue;
      const pose = ctx.worldPoses([state.actor])[0]?.local;
      if (!pose || Math.hypot(pose.x - state.approachX, pose.z - state.approachZ) > 0.1 || Math.abs(pose.y - state.approachY) > 0.2) continue;
      const work = state.workSeconds + ctx.clock.delta;
      if (state.phase === "sow" && work >= definition.sowSeconds) {
        const operation = `${row2.id}:sow:${state.attempt + 1}`;
        ctx.action(establishResourceSite(operation, state.actor, state.site, state.definition, { x: state.cellX, y: state.cellY, z: state.cellZ }));
        ctx.write(ColonyResourceOrder, row2.id, { ...state, operation, phase: "submitting-sow", workSeconds: work, attempt: state.attempt + 1 });
      } else if (state.phase === "tend" && work >= definition.tendSeconds && state.vessel) {
        const operation = `${row2.id}:tend:${state.attempt + 1}`;
        ctx.action(tendResourceSite(operation, state.actor, state.site, state.vessel));
        ctx.write(ColonyResourceOrder, row2.id, { ...state, operation, phase: "submitting-tend", workSeconds: work, attempt: state.attempt + 1 });
      } else if (state.phase === "harvest" && work >= definition.harvestSeconds) {
        const operation = `${row2.id}:harvest:${state.attempt + 1}`;
        ctx.action(extractResource(operation, state.actor, state.site));
        ctx.write(ColonyResourceOrder, row2.id, { ...state, operation, phase: "submitting-harvest", workSeconds: work, attempt: state.attempt + 1 });
      } else ctx.write(ColonyResourceOrder, row2.id, { ...state, workSeconds: work });
    }
  } };
}
function colonyProcessWaterPhase(ctx) {
  const facts = ctx.workMaterialFacts();
  const lots = facts.lots;
  const orders = ctx.query(query(WaterSupplyOrder, WaterSupplyWork));
  const deliveries = ctx.query(query(DeliveryTask)).map((row2) => row2.get(DeliveryTask));
  const ordersByProcess = /* @__PURE__ */ new Map();
  for (const order of orders) {
    const process = order.get(WaterSupplyOrder).process;
    if (process) ordersByProcess.set(process, [...ordersByProcess.get(process) ?? [], order]);
  }
  const revision = orders.reduce((max, row2) => Math.max(max, row2.get(WaterSupplyOrder).revision), 0);
  const processes = ctx.query(query(StagedProcess)).slice().sort((a, b) => a.id.localeCompare(b.id));
  let nextRevision = revision;
  for (const row2 of processes) {
    const process = row2.get(StagedProcess);
    if (process.phase !== "waiting") continue;
    const requirements = ctx.processRequirements(process.definition, process.station);
    const water = requirements.inputs.find((input) => input.material === "water");
    if (!water) continue;
    const destination = `${process.station}:${water.port}`;
    const quantity2 = lots.filter((lot) => lot.container === destination && lot.kind === "water" && lot.quantity > 0).reduce((sum, lot) => sum + lot.quantity, 0);
    const inFlight = deliveries.filter(
      (task) => task.phase !== "complete" && task.destination === destination && task.material === "water"
    ).reduce((sum, task) => sum + task.quantity, 0);
    const existing = ordersByProcess.get(row2.id) ?? [];
    if (quantity2 + inFlight >= water.quantity) {
      for (const order of existing)
        if (order.get(WaterSupplyWork).phase === "queued") ctx.removeAuthoredEntity(order.id);
      continue;
    }
    if (existing.length) continue;
    if (orders.length >= 256 || nextRevision >= 4294967295) throw new Error("water demand capacity exhausted");
    nextRevision += 1;
    const id3 = entity(`colony.water-process.${row2.id}.${quantity2 + inFlight}`);
    ctx.createAuthoredEntity({ id: id3, components: {
      [WaterSupplyOrder.id]: { revision: nextRevision, process: row2.id },
      [WaterSupplyWork.id]: { request: nextRevision, attempt: 0, phase: "queued", actor: null, vessel: null, x: 0, y: 0, z: 0, approachX: 0, approachY: 0, approachZ: 0, reason: "" }
    } });
    ordersByProcess.set(row2.id, []);
  }
}
var ColonyTree = component("colony.tree", {
  version: 1,
  fields: { phase: "string" }
});
var ColonyTreeOrder = component("colony.tree-order", {
  version: 2,
  fields: {
    tree: "entity",
    actor: "nullable-entity",
    phase: "string",
    stage: "string",
    seconds: "number",
    approachX: "number",
    approachY: "number",
    approachZ: "number",
    reason: "string"
  }
});
var ColonyTreePolicy = component(
  "colony.tree-policy",
  { version: 1, fields: { designated: "boolean" } }
);
var ColonyDigOrder = component("colony.dig-order", {
  version: 1,
  fields: {
    cellX: "number",
    cellY: "number",
    cellZ: "number",
    expected: "number",
    actor: "nullable-entity",
    phase: "string",
    reason: "string",
    approachX: "number",
    approachY: "number",
    approachZ: "number"
  }
});
var verticalMetres = colonyEnvironment.world.verticalMetres;
var air = colonyEnvironment.world.slots.air;
var spoilKinds = /* @__PURE__ */ new Set(["soil-spoil", "stone-spoil"]);
var colonyStockpileProfiles = {
  wood: {
    materialCategories: { wood: "building" },
    allowedCategories: ["building"]
  },
  food: {
    materialCategories: { bread: "food" },
    allowedCategories: ["food"],
    allowedMaterials: ["bread"]
  }
};
var distance5 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function orderPoint(order) {
  return {
    x: order.approachX,
    y: order.approachY,
    z: order.approachZ,
    frame: null
  };
}
var treeWorkProvider = (ctx, suspendedActors) => {
  const workers2 = ctx.query(query(Worker)).filter((row2) => !row2.get(Worker).guest).map((row2) => row2.id);
  const trees2 = ctx.query(
    query(ColonyTree, Position, Container, FiniteResource)
  );
  const orders = ctx.query(query(ColonyTreeOrder));
  const policies = new Map(
    ctx.query(query(ColonyTreePolicy)).map((row2) => [row2.id, row2.get(ColonyTreePolicy)])
  );
  for (const orderRow of orders) {
    const state = orderRow.get(ColonyTreeOrder), policy = policies.get(state.tree);
    if (!policy || state.phase === "complete") continue;
    if (policy.designated) {
      if (state.phase === "blocked" && state.reason === "Not designated")
        ctx.write(ColonyTreeOrder, orderRow.id, {
          ...state,
          actor: null,
          phase: "queued",
          reason: "Designated"
        });
      continue;
    }
    if (state.actor !== null) ctx.action(cancelWork(state.actor));
    if (state.phase !== "blocked" || state.reason !== "Not designated")
      ctx.write(ColonyTreeOrder, orderRow.id, {
        ...state,
        actor: null,
        phase: "blocked",
        reason: "Not designated"
      });
  }
  const positions = new Map(
    ctx.query(query(Position)).map((row2) => [row2.id, row2.get(Position)])
  );
  const destinations = new Set(
    ctx.query(query(Destination)).map((row2) => row2.id)
  );
  const active = new Map(
    orders.map((row2) => [
      row2.get(ColonyTreeOrder).tree,
      { id: row2.id, state: row2.get(ColonyTreeOrder) }
    ])
  );
  const poses = new Map(
    ctx.worldPoses([.../* @__PURE__ */ new Set([...workers2, ...trees2.map((row2) => row2.id)])]).map((p) => [p.id, p])
  );
  const candidates = trees2.flatMap((row2) => {
    const tree = row2.get(ColonyTree), order = active.get(row2.id);
    if (!order || !policies.get(row2.id)?.designated || order.state.phase !== "queued" || order.state.stage === "fell" && tree.phase !== "standing" || order.state.stage === "chop" && tree.phase !== "felled")
      return [];
    const pose = poses.get(row2.id), position = positions.get(row2.id);
    if (!pose || !position) return [];
    const approaches = [
      { x: position.x + 1, y: position.y, z: position.z },
      { x: position.x - 1, y: position.y, z: position.z },
      { x: position.x, y: position.y, z: position.z + 1 },
      { x: position.x, y: position.y, z: position.z - 1 }
    ];
    return workers2.filter(
      (worker) => !suspendedActors.has(worker) && poses.get(worker)?.support === pose.support
    ).flatMap((worker) => {
      const targets = approaches.map((target2) => ({
        ...target2,
        frame: pose.support
      }));
      return [
        {
          worker,
          task: order.id,
          tree: row2.id,
          target: targets[0],
          approaches: targets
        }
      ];
    });
  });
  const occupiedActors = orders.flatMap((row2) => {
    const state = row2.get(ColonyTreeOrder);
    return state.phase === "working" && state.actor ? [state.actor] : [];
  });
  const claimed = orders.map((row2) => ({
    task: row2.id,
    actor: row2.get(ColonyTreeOrder).actor
  }));
  const assigned = /* @__PURE__ */ new Set();
  const selectedApproaches = /* @__PURE__ */ new Map();
  return {
    claims: claimed,
    occupiedActors,
    candidates,
    lowerBound: (candidate) => {
      const actor = poses.get(candidate.worker)?.local;
      return actor ? Math.min(
        ...candidate.approaches.map((target2) => distance5(actor, target2))
      ) : 0;
    },
    estimate: (candidate) => {
      const result = ctx.routeToAny({
        actor: candidate.worker,
        targets: candidate.approaches
      });
      if (result.status !== "reachable") return null;
      selectedApproaches.set(
        `${candidate.worker}\0${candidate.task}`,
        candidate.approaches[result.targetIndex]
      );
      return result.cost;
    },
    apply: (assignments) => {
      for (const assignment of assignments) {
        const candidate = candidates.find(
          (item) => item.worker === assignment.worker && item.task === assignment.task
        );
        if (!candidate) continue;
        assigned.add(assignment.task);
        const target2 = selectedApproaches.get(`${candidate.worker}\0${candidate.task}`) ?? candidate.target;
        ctx.write(ColonyTreeOrder, candidate.task, {
          tree: candidate.tree,
          actor: candidate.worker,
          phase: "working",
          stage: active.get(candidate.tree).state.stage,
          seconds: 0,
          approachX: target2.x,
          approachY: target2.y,
          approachZ: target2.z,
          reason: ""
        });
        ctx.action(move(candidate.worker, target2));
      }
    },
    progress: () => {
      for (const row2 of orders) {
        const order = row2.get(ColonyTreeOrder), treeRow = trees2.find((tree) => tree.id === order.tree);
        if (!treeRow) {
          if (order.actor !== null)
            ctx.write(ColonyTreeOrder, row2.id, {
              ...order,
              actor: null,
              phase: "blocked",
              reason: "Tree unavailable"
            });
          continue;
        }
        if (order.actor === null || assigned.has(row2.id)) continue;
        if (order.phase === "blocked" && order.reason === "Extracting") {
          const accepted = ctx.outcomes.find(
            (outcome) => outcome.action.kind === "extract-resource" && outcome.action.operation === `colony.tree:${row2.id}:${order.stage}` && outcome.action.source === order.tree
          );
          if (accepted?.result.accepted || treeRow.get(FiniteResource).quantity === 0) {
            ctx.write(ColonyTree, treeRow.id, { phase: "chopped" });
            ctx.write(ColonyTreeOrder, row2.id, {
              ...order,
              actor: null,
              phase: "complete",
              reason: ""
            });
          } else if (accepted && !accepted.result.accepted) {
            ctx.write(ColonyTreeOrder, row2.id, {
              ...order,
              actor: null,
              reason: accepted.result.reason ?? "Extraction refused"
            });
          }
          continue;
        }
        if (order.phase !== "working") continue;
        const rejected = ctx.outcomes.some(
          (outcome) => outcome.action.kind === "move" && outcome.action.entity === order.actor && outcome.action.destination.x === order.approachX && outcome.action.destination.z === order.approachZ && !outcome.result.accepted
        );
        if (rejected) {
          ctx.write(ColonyTreeOrder, row2.id, {
            ...order,
            actor: null,
            phase: "blocked",
            reason: "Adjacent approach unreachable"
          });
          continue;
        }
        const position = positions.get(order.tree), pose = poses.get(order.tree), actorPose = poses.get(order.actor);
        if (!position || !pose || !actorPose) {
          ctx.write(ColonyTreeOrder, row2.id, {
            ...order,
            actor: null,
            phase: "blocked",
            reason: "Tree contact unavailable"
          });
          continue;
        }
        if (destinations.has(order.actor)) continue;
        if (Math.hypot(
          actorPose.world.x - position.x,
          actorPose.world.z - position.z
        ) > 1.5) {
          ctx.action(
            move(order.actor, {
              x: order.approachX,
              y: order.approachY,
              z: order.approachZ,
              frame: pose.support
            })
          );
          continue;
        }
        const total2 = order.stage === "fell" ? 3 : 2;
        const next = Math.min(
          total2,
          order.seconds + Math.max(0, ctx.clock.delta)
        );
        if (next < total2) {
          ctx.write(ColonyTreeOrder, row2.id, { ...order, seconds: next });
          continue;
        }
        if (order.stage === "fell") {
          ctx.write(ColonyTree, treeRow.id, { phase: "felled" });
          ctx.write(ColonyTreeOrder, row2.id, {
            ...order,
            actor: null,
            phase: "queued",
            stage: "chop",
            seconds: 0,
            reason: "Ready to chop"
          });
          continue;
        }
        ctx.action(extractResource(`colony.tree:${row2.id}:${order.stage}`, order.actor, treeRow.id));
        ctx.write(ColonyTreeOrder, row2.id, {
          ...order,
          phase: "blocked",
          reason: "Extracting"
        });
      }
    }
  };
};
function progressClaimedDig(ctx, id3, state, position) {
  if (state.actor === null) return;
  if (state.phase === "approaching") {
    const failedMove = ctx.outcomes.find((outcome) => {
      if (outcome.action.kind !== "move" || outcome.action.entity !== state.actor || outcome.result.accepted)
        return false;
      const destination = outcome.action.destination;
      return destination.x === state.approachX && destination.y === state.approachY && destination.z === state.approachZ;
    });
    if (failedMove) {
      ctx.write(ColonyDigOrder, id3, {
        ...state,
        actor: null,
        phase: "blocked",
        reason: failedMove.result.reason ?? "movement did not complete"
      });
      return;
    }
    if (distance5(position, orderPoint(state)) <= 0.05) {
      ctx.write(ColonyDigOrder, id3, {
        ...state,
        phase: "excavating",
        reason: ""
      });
      ctx.action(
        excavate(
          state.actor,
          { x: state.cellX, y: state.cellY, z: state.cellZ },
          state.expected,
          air
        )
      );
    } else {
      const supportY = Math.round(state.approachY / verticalMetres - 0.5);
      const [support, clearance] = ctx.terrainMaterials([
        [Math.round(state.approachX), supportY, Math.round(state.approachZ)],
        [
          Math.round(state.approachX),
          supportY + 1,
          Math.round(state.approachZ)
        ]
      ]);
      if (support === air || clearance !== air) {
        ctx.write(ColonyDigOrder, id3, {
          ...state,
          actor: null,
          phase: "queued",
          reason: "Approach changed"
        });
        return;
      }
      ctx.action(move(state.actor, orderPoint(state)));
    }
  } else if (state.phase === "excavating") {
    if (ctx.query(query(ExcavationWork)).some((item) => item.id === state.actor))
      return;
    const material = ctx.terrainMaterials([
      [state.cellX, state.cellY, state.cellZ]
    ])[0];
    if (material !== air) {
      const failed = ctx.outcomes.find(
        (outcome) => outcome.action.kind === "excavate" && outcome.action.entity === state.actor && outcome.action.x === state.cellX && outcome.action.y === state.cellY && outcome.action.z === state.cellZ && !outcome.result.accepted
      );
      ctx.write(ColonyDigOrder, id3, {
        ...state,
        actor: null,
        phase: "blocked",
        reason: failed?.result.reason ?? "excavation did not complete"
      });
      return;
    }
    ctx.removeAuthoredEntity(id3);
  }
}
function digApproaches(state, designatedCells) {
  const horizontal = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ];
  const vertical = [-2, -1, 0, 1];
  return horizontal.flatMap(
    ([dx, dz]) => vertical.flatMap((dy) => {
      const x = state.cellX + dx;
      const y = state.cellY + dy;
      const z8 = state.cellZ + dz;
      return designatedCells.has(`${x},${y},${z8}`) ? [] : [{ x, y: (y + 0.5) * verticalMetres, z: z8, frame: null }];
    })
  );
}
function candidatesForDigOrder(order, state, material, facts) {
  const cellKey = `${state.cellX},${state.cellY},${state.cellZ}`;
  if (state.actor !== null || facts.standingCells.has(cellKey) || material === void 0 || material === air)
    return [];
  const expected = state.expected >= 0 ? state.expected : material;
  if (material !== expected) return [];
  const approaches = digApproaches(state, facts.designatedCells);
  if (!approaches.length) return [];
  return [...facts.workers].filter(
    (worker) => !facts.occupied.has(worker) && facts.positions.has(worker) && facts.bodies.has(worker)
  ).map((worker) => ({
    worker,
    task: order,
    order,
    cell: { x: state.cellX, y: state.cellY, z: state.cellZ },
    expected,
    approaches,
    cost: Number.POSITIVE_INFINITY
  }));
}
function digProvider(ctx, suspendedActors) {
  const orders = ctx.query(query(ColonyDigOrder));
  const workers2 = new Set(
    ctx.query(query(Worker)).filter((row2) => !row2.get(Worker).guest).map((row2) => row2.id)
  );
  const bodies = new Set(ctx.query(query(Body)).map((row2) => row2.id));
  const positions = new Map(
    ctx.worldPoses([...bodies.keys()]).map((pose) => [pose.id, pose])
  );
  const supported = new Set(ctx.query(query(Support)).map((row2) => row2.id));
  const standingCells = new Set(
    [...positions.values()].filter((pose) => !supported.has(pose.id) && !workers2.has(pose.id)).map(
      (pose) => `${Math.round(pose.world.x)},${Math.round(pose.world.y / verticalMetres - 0.5)},${Math.round(pose.world.z)}`
    )
  );
  const obstructed = (state) => standingCells.has(`${state.cellX},${state.cellY},${state.cellZ}`);
  const excavating = new Set(
    ctx.query(query(ExcavationWork)).map((row2) => row2.id)
  );
  const deliveries = ctx.query(query(DeliveryTask)).map((row2) => row2.get(DeliveryTask));
  const occupied = /* @__PURE__ */ new Set([
    ...excavating,
    ...ctx.query(query(ConstructionSite)).flatMap((row2) => {
      const site = row2.get(ConstructionSite);
      return site.worker === null ? [] : [site.worker];
    }),
    ...deliveries.flatMap((task) => task.actor ? [task.actor] : [])
  ]);
  const claims = orders.map((row2) => ({
    task: row2.id,
    actor: row2.get(ColonyDigOrder).actor
  }));
  const windowSize = Math.min(128, orders.length);
  const windowStart = orders.length ? ctx.clock.tick * 32 % orders.length : 0;
  const activeOrders = orders.length ? Array.from(
    { length: windowSize },
    (_, index) => orders[(windowStart + index) % orders.length]
  ) : [];
  const cells = activeOrders.map((row2) => {
    const state = row2.get(ColonyDigOrder);
    return [state.cellX, state.cellY, state.cellZ];
  });
  const materials = cells.length ? ctx.terrainMaterials(cells) : [];
  const currentMaterial = new Map(
    activeOrders.map((row2, index) => [row2.id, materials[index]])
  );
  const designatedCells = new Set(
    activeOrders.map((row2) => {
      const state = row2.get(ColonyDigOrder);
      return `${state.cellX},${state.cellY},${state.cellZ}`;
    })
  );
  const candidateFacts = {
    workers: workers2,
    bodies,
    positions,
    occupied,
    designatedCells,
    standingCells
  };
  const candidates = activeOrders.flatMap(
    (row2) => candidatesForDigOrder(
      row2.id,
      row2.get(ColonyDigOrder),
      currentMaterial.get(row2.id),
      candidateFacts
    )
  );
  const claimByTask = new Map(claims.map((claim) => [claim.task, claim.actor]));
  const prepared = candidates.filter(
    (candidate) => !occupied.has(candidate.worker) && claimByTask.get(candidate.task) === null
  );
  const best = /* @__PURE__ */ new Map();
  const evaluated = /* @__PURE__ */ new Set();
  const ensureCosts = (candidate) => {
    const key = `${candidate.worker}\0${candidate.task}`;
    if (evaluated.has(key)) return;
    evaluated.add(key);
    const result = ctx.routeToAny({
      actor: candidate.worker,
      targets: candidate.approaches,
      excavationTarget: [candidate.cell.x, candidate.cell.y, candidate.cell.z]
    });
    if (result.status === "reachable")
      best.set(key, {
        approach: candidate.approaches[result.targetIndex],
        cost: result.cost
      });
  };
  let assigned = /* @__PURE__ */ new Set();
  return {
    claims,
    candidates: prepared,
    occupiedActors: [...occupied],
    lowerBound: (candidate) => {
      const actor = positions.get(candidate.worker)?.world;
      return actor ? Math.min(
        ...candidate.approaches.map(
          (approach) => distance5(actor, approach)
        )
      ) : 0;
    },
    estimate: (candidate) => {
      ensureCosts(candidate);
      return best.get(`${candidate.worker}\0${candidate.task}`)?.cost ?? null;
    },
    apply(assignments) {
      assigned = new Set(assignments.map((assignment) => assignment.task));
      for (const assignment of assignments) {
        const candidate = prepared.find(
          (item) => item.worker === assignment.worker && item.task === assignment.task
        );
        if (candidate) ensureCosts(candidate);
        const approach = best.get(
          `${assignment.worker}\0${assignment.task}`
        )?.approach;
        if (!candidate || !approach) continue;
        const state = orders.find((row2) => row2.id === candidate.order)?.get(ColonyDigOrder);
        if (!state) continue;
        ctx.write(ColonyDigOrder, candidate.order, {
          ...state,
          expected: candidate.expected,
          actor: candidate.worker,
          phase: "approaching",
          reason: "",
          approachX: approach.x,
          approachY: approach.y,
          approachZ: approach.z
        });
        ctx.action(move(candidate.worker, approach));
      }
    },
    progress() {
      for (const row2 of activeOrders) {
        const state = row2.get(ColonyDigOrder);
        if (state.actor !== null && suspendedActors.has(state.actor)) continue;
        if (obstructed(state)) {
          if (state.actor && excavating.has(state.actor))
            ctx.action(cancelWork(state.actor));
          if (state.actor !== null || state.phase !== "blocked" || state.reason !== "Someone is standing on this tile") {
            ctx.write(ColonyDigOrder, row2.id, {
              ...state,
              actor: null,
              phase: "blocked",
              reason: "Someone is standing on this tile"
            });
          }
          continue;
        }
        if (assigned.has(row2.id)) continue;
        if (!state.actor) continue;
        const pose = positions.get(state.actor);
        if (!pose) continue;
        progressClaimedDig(ctx, row2.id, state, pose.world);
      }
    }
  };
}
function planGroundStockDeliveries(ctx) {
  const pantry = entity("colony.pantry");
  const stockContainers = new Set(
    ctx.query(query(GroundStock)).map((row2) => row2.id)
  );
  const tasks2 = ctx.query(query(DeliveryTask));
  const existing = new Set(tasks2.map((row2) => row2.get(DeliveryTask).sourceLot));
  const taskIds = new Set(tasks2.map((row2) => row2.id));
  for (const row2 of ctx.query(query(MaterialLot))) {
    const lot = row2.get(MaterialLot);
    if (!stockContainers.has(lot.container) || !spoilKinds.has(lot.kind) || lot.quantity <= 0 || existing.has(row2.id))
      continue;
    const source = lot.container;
    const taskId3 = entity(`${row2.id}.delivery`);
    if (taskIds.has(taskId3)) continue;
    ctx.createAuthoredEntity({
      id: taskId3,
      components: {
        [DeliveryTask.id]: {
          actor: null,
          sourceLot: row2.id,
          source,
          destination: pantry,
          material: lot.kind,
          quantity: lot.quantity,
          phase: "idle"
        }
      }
    });
    existing.add(row2.id);
    taskIds.add(taskId3);
  }
}
function colonyGroundStockPhase(ctx) {
  const stockContainers = new Set(
    ctx.query(query(GroundStock)).map((row2) => row2.id)
  );
  for (const row2 of ctx.query(query(DeliveryTask))) {
    const task = row2.get(DeliveryTask);
    if (task.phase === "complete" && stockContainers.has(task.source))
      ctx.removeAuthoredEntity(row2.id);
  }
  planGroundStockDeliveries(ctx);
}
function colonySiteSuppliesPhase(ctx) {
  const sites = ctx.query(query(ConstructionSite));
  const start = sites.length ? ctx.clock.tick * 4 % sites.length : 0;
  const active = Array.from(
    { length: Math.min(3, sites.length) },
    (_, offset2) => sites[(start + offset2) % sites.length]
  );
  planSiteSupplies(ctx, {
    sourceContainers: [entity("colony.lumber"), entity("colony.pantry")],
    batchQuantity: 3,
    requirements: [
      ...active.flatMap((row2) => {
        const site = row2.get(ConstructionSite);
        const definition = colonyEnvironment.structures.catalog.find(
          (item) => item.id === site.catalog
        );
        return definition ? definition.materials.map(({ kind: material, quantity: quantity2 }) => ({
          destination: row2.id,
          material,
          quantity: quantity2
        })) : [];
      })
    ]
  });
}
var colonyWorkSystem = createWorkSystem({
  id: "colony.work",
  version: 1,
  reads: [
    GroundStock,
    StockpileCell,
    ColonyDigOrder,
    ColonyTree,
    ColonyTreeOrder,
    ColonyTreePolicy,
    FiniteResource,
    ResourceSite,
    Worker,
    Body,
    Traversal,
    Position,
    Container,
    SealedContainer,
    ConstructionSite,
    ConstructionApproach,
    DeconstructionApproach,
    DeconstructionOrder,
    LotWater,
    Destination,
    Support,
    Surface,
    MaterialLot,
    StagedProcess,
    ProcessAttendanceWork,
    ColonyResourceOrder,
    ExcavationWork,
    DeliveryTask,
    DeliveryControl,
    WaterSupplyOrder,
    WaterSupplyWork
  ],
  writes: [
    ColonyDigOrder,
    ColonyTree,
    ColonyTreeOrder,
    MaterialLot,
    DeliveryTask,
    ConstructionApproach,
    DeconstructionApproach,
    DeconstructionOrder,
    WaterSupplyOrder,
    WaterSupplyWork,
    ProcessAttendanceWork,
    ColonyResourceOrder
  ],
  phases: [
    processSupplyPhase,
    colonyProcessWaterPhase,
    colonySiteSuppliesPhase,
    colonyGroundStockPhase,
    (ctx) => planStockpileDeliveries(ctx, { filterProfiles: colonyStockpileProfiles })
  ],
  providers: [
    deliveryProvider,
    digProvider,
    (ctx, suspendedActors) => treeWorkProvider(ctx, suspendedActors),
    (ctx, suspendedActors) => constructionWorkProvider(
      ctx,
      {
        workers: ctx.query(query(Worker)).filter((row2) => !row2.get(Worker).guest).map((row2) => row2.id)
      },
      suspendedActors
    ),
    (ctx, suspendedActors) => deconstructionWorkProvider(ctx, ctx.query(query(Worker)).filter((row2) => !row2.get(Worker).guest).map((row2) => row2.id), suspendedActors),
    (ctx, suspendedActors) => waterSupplyProvider(ctx, suspendedActors),
    resourceWorkProvider,
    (ctx, suspendedActors) => processAttendanceProvider(ctx, ctx.query(query(Worker)).filter((row2) => !row2.get(Worker).guest).map((row2) => row2.id), suspendedActors)
  ]
});

// engine/src/games/colony-stockpile-command.ts
init_authoring();
import { z as z3 } from "zod";
var cell2 = z3.tuple([
  z3.number().int().min(-1e6).max(1e6),
  z3.number().int().min(-1e6).max(1e6),
  z3.number().int().min(-1e6).max(1e6)
]);
var area2 = z3.object({ start: cell2, end: cell2 }).strict();
var colonyStockpileInputSchema = z3.object({
  area: area2,
  filterProfile: z3.enum(["wood", "food"]),
  priority: z3.number().int().min(1).max(100)
}).strict();
var colonyStockpilePolicyInputSchema = z3.object({ zone: z3.string().min(1).max(128), filterProfile: z3.enum(["wood", "food"]), priority: z3.number().int().min(1).max(100) }).strict();
var STOCKPILE_CAPACITY = 6;
function cellsFor(areaValue) {
  const [startX, y, startZ] = areaValue.start;
  const [endX, endY, endZ] = areaValue.end;
  if (y !== endY) throw new Error("Stockpile area must stay on one level");
  const cells = [];
  for (let z8 = Math.min(startZ, endZ); z8 <= Math.max(startZ, endZ); z8++)
    for (let x = Math.min(startX, endX); x <= Math.max(startX, endX); x++)
      cells.push({ x, y, z: z8 });
  if (cells.length > 256) throw new Error("Stockpile area exceeds 256 cells");
  return cells;
}
function zoneFor(areaValue) {
  const x0 = Math.min(areaValue.start[0], areaValue.end[0]);
  const x1 = Math.max(areaValue.start[0], areaValue.end[0]);
  const z0 = Math.min(areaValue.start[2], areaValue.end[2]);
  const z1 = Math.max(areaValue.start[2], areaValue.end[2]);
  return entity(`colony.stockpile.${x0}.${areaValue.start[1]}.${z0}.${x1}.${z1}`);
}
var colonyStockpileCommand = command({
  title: "Designate stockpile",
  category: "Storage",
  description: "Designate a floor area for physical material storage.",
  localPresentation: { bindings: [{ id: "designate-stockpile", label: "Designate stockpile", target: "terrain-area", designation: ["rectangle"], preset: { filterProfile: "wood", priority: 50 } }] },
  input: colonyStockpileInputSchema,
  reads: [],
  writes: [],
  run: (_context, value) => ({
    writes: [],
    actions: [designateStockpile(zoneFor(value.area), cellsFor(value.area).map((cell3) => ({
      ...cell3,
      priority: value.priority,
      filterProfile: value.filterProfile,
      capacity: STOCKPILE_CAPACITY
    })))]
  })
});
var colonyStockpilePolicyCommand = command({
  title: "Update stockpile",
  category: "Storage",
  description: "Change a stockpile's material profile and priority.",
  input: colonyStockpilePolicyInputSchema,
  reads: [],
  writes: [],
  run: (_context, value) => ({ writes: [], actions: [updateStockpile(entity(value.zone), value.filterProfile, value.priority)] })
});

// engine/src/games/colony.ts
import { z as z4 } from "zod";
var Guest = component("colony.guest", {
  version: 1,
  fields: { hungry: "boolean" }
});
var workerOne = entity("colony.worker.1");
var workerTwo = entity("colony.worker.2");
var workers = [workerOne, workerTwo];
var workerVisuals = [
  { sprite: "colony.rowan", label: "Rowan" },
  { sprite: "colony.sedge", label: "Sedge" }
];
var guestId = entity("colony.guest.1");
var pantryId = entity("colony.pantry");
var colonyLumberId = entity("colony.lumber");
var lotOne = entity("colony.food.1");
var lotTwo = entity("colony.food.2");
var taskOne = entity("colony.delivery.1");
var taskTwo = entity("colony.delivery.2");
var tasks = [taskOne, taskTwo];
var catId = entity("colony.cat.1");
var trees = [
  { id: entity("colony.tree.oak"), x: 2, z: 2 },
  { id: entity("colony.tree.pine"), x: -5, z: 4 },
  { id: entity("colony.tree.willow"), x: 4, z: -5 }
];
var TREE_CONTACT_TOLERANCE = 0.05;
function treeWorkerAtApproach(actor, order) {
  return Math.hypot(actor.x - order.approachX, actor.y - order.approachY, actor.z - order.approachZ) <= TREE_CONTACT_TOLERANCE;
}
function treeWorkProgress(order) {
  return Math.max(0, Math.min(1, order.seconds / (order.stage === "fell" ? 3 : 2)));
}
function constructionStatusLabel(phase, readiness) {
  if (phase === "finished") return "Finished";
  if (phase === "working") return "Building";
  if (readiness === "waitingForSupport") return "Waiting for structural support";
  if (readiness === "unknown") return "Construction state unavailable";
  return "Waiting for materials or a free worker";
}
var catRecord = catInitial(catId, workerOne, { x: 1, y: 0, z: 1 });
var colonyInitial = [
  { ...catRecord, components: { ...catRecord.components, "hive.visual": { sprite: "colony.cat", label: "Mallow" } } },
  ...workers.map((id3, index) => ({
    id: id3,
    components: {
      "hive.position": { x: 0, y: 0, z: index * 2, facing: 0 },
      "hive.body": { speed: 2 },
      "hive.container": { capacity: 4 },
      "hive.traversal": { clearanceCells: 1, maxStepCells: 1 },
      "hive.visual": workerVisuals[index],
      "colony.worker": { guest: false },
      "hive.work-participation": { automatic: true },
      "hive.delivery-control": { enabled: true, quantity: 3 }
    }
  })),
  ...workers.map((worker, index) => ({ id: entity(`colony.pail.${index + 1}`), components: {
    "hive.lot": { quantity: 1, kind: "pail", container: worker },
    "hive.container": { capacity: 7 },
    "hive.visual": { sprite: "pail", label: "Pail" }
  } })),
  {
    id: guestId,
    components: {
      "hive.position": { x: 3, y: 0, z: 1, facing: 0 },
      "hive.body": { speed: 1 },
      "hive.container": { capacity: 4 },
      "hive.traversal": { clearanceCells: 1, maxStepCells: 1 },
      "hive.visual": { sprite: "goblin.guest", label: "Guest" },
      "colony.guest": { hungry: true }
    }
  },
  {
    id: pantryId,
    components: {
      "hive.position": { x: -2, y: 0, z: 0, facing: 0 },
      "hive.container": { capacity: 20 },
      "hive.visual": { sprite: "crate", label: "Pantry" }
    }
  },
  {
    id: colonyLumberId,
    components: {
      "hive.position": { x: -3, y: 0, z: 1, facing: 0 },
      "hive.container": { capacity: 48 },
      "hive.visual": { sprite: "crate", label: "Starter lumber" }
    }
  },
  {
    id: entity("colony.lumber.initial"),
    components: {
      "hive.lot": { quantity: 48, kind: "wood", container: colonyLumberId }
    }
  },
  ...[lotOne, lotTwo].map((id3) => ({
    id: id3,
    components: {
      "hive.lot": { quantity: 3, kind: "bread", container: pantryId }
    }
  })),
  { id: entity("colony.brew.malt"), components: { "hive.lot": { quantity: 4, kind: "malt", container: pantryId } } },
  { id: entity("colony.brew.mugwort"), components: { "hive.lot": { quantity: 1, kind: "mugwort", container: pantryId } } },
  { id: entity("colony.brew.barm"), components: { "hive.lot": { quantity: 1, kind: "barm", container: pantryId }, "hive.container": { capacity: 1 } } },
  { id: entity("colony.brew.keg"), components: { "hive.lot": { quantity: 1, kind: "keg", container: pantryId }, "hive.container": { capacity: 4 } } },
  ...[taskOne, taskTwo].map((id3, index) => ({
    id: id3,
    components: {
      "hive.delivery-task": {
        actor: null,
        sourceLot: index === 0 ? lotOne : lotTwo,
        source: pantryId,
        destination: guestId,
        material: "bread",
        quantity: 2,
        phase: "idle"
      }
    }
  })),
  ...trees.flatMap(({ id: id3, x, z: z8 }) => [{ id: id3, components: {
    "hive.position": { x, y: 0, z: z8, facing: 0 },
    "hive.container": { capacity: 6 },
    "colony.tree": { phase: "standing" },
    [FiniteResource.id]: { kind: "wood", quantity: 6 },
    "colony.tree-policy": { designated: false }
  } }, { id: entity(`${id3}.order`), components: {
    "colony.tree-order": { tree: id3, actor: null, phase: "blocked", stage: "fell", seconds: 0, approachX: 0, approachY: 0, approachZ: 0, reason: "Not designated" }
  } }])
];
var goInput = z4.object({
  entities: z4.array(z4.string().min(1).max(128).transform(entity)).min(1).max(workers.length),
  destination: z4.object({
    x: z4.number().finite().min(-1e6).max(1e6),
    y: z4.number().finite().min(-1e6).max(1e6),
    z: z4.number().finite().min(-1e6).max(1e6),
    frame: z4.string().transform(entity).nullable()
  }).strict()
}).strict();
var stationInput = z4.object({ station: z4.string().min(1).max(128).transform(entity) }).strict();
function finishedBrewStations(context) {
  return context.query(query(ConstructionSite)).filter((row2) => {
    const site = row2.get(ConstructionSite);
    return site.catalog === "brew-station" && site.phase === "finished";
  });
}
function availableBrewStations(context) {
  const active = new Set(context.query(query(StagedProcess)).filter((row2) => row2.get(StagedProcess).phase !== "complete").map((row2) => row2.get(StagedProcess).station));
  return finishedBrewStations(context).filter((row2) => !active.has(row2.id));
}
var workerSelectionInput = z4.object({
  entities: z4.array(z4.string().min(1).max(128).transform(entity)).min(1).max(workers.length)
}).strict();
var deliveryInput = z4.object({
  entities: z4.array(z4.string().min(1).max(128).transform(entity)).min(1).max(workers.length),
  quantity: z4.number().int().positive().max(4294967295).optional()
}).strict();
var pointInput = z4.tuple([
  z4.number().int().min(-1e6).max(1e6),
  z4.number().int().min(-1e6).max(1e6),
  z4.number().int().min(-1e6).max(1e6)
]);
var areaInput = z4.object({ start: pointInput, end: pointInput }).strict();
var emptyInput = z4.object({}).strict();
var digInput = z4.object({ area: areaInput }).strict();
var treeSelectionInput = z4.object({ entities: z4.array(z4.string().min(1).max(128).transform(entity)).min(1).max(32) }).strict();
var cancelDigInput = z4.object({
  entities: z4.array(z4.string().min(1).max(128).transform(entity)).min(1).max(workers.length).optional(),
  area: areaInput.optional()
}).strict().refine((value) => value.entities !== void 0 || value.area !== void 0, "cancel dig requires workers or an area");
var depositInput = z4.object({ entities: z4.array(z4.string().min(1).max(128).transform(entity)).length(1) }).strict();
function selectedWorkers(context, raw) {
  const selected = [...new Set(raw)];
  if (selected.length !== raw.length || selected.some((id3) => !workers.includes(id3)))
    throw new Error("selection must contain distinct colony workers");
  const rows = context.query(query(Worker));
  for (const id3 of selected) {
    const worker = rows.find((row2) => row2.id === id3)?.get(Worker);
    if (!worker || worker.guest) throw new Error("guests cannot deliver");
  }
  return selected;
}
function activeTaskFor(context, actor) {
  return context.query(query(DeliveryTask)).map((row2) => row2.get(DeliveryTask)).find((task) => task.actor === actor);
}
function deliveryWrites(context, input, enabled, preserveCurrentQuantity = false) {
  const selected = selectedWorkers(context, input.entities);
  const quantity2 = input.quantity;
  if (enabled && !preserveCurrentQuantity && quantity2 !== void 0) {
    for (const worker of selected) {
      const capacity = context.query(query(Container)).find((row2) => row2.id === worker)?.get(Container).capacity;
      if (typeof capacity !== "number" || !Number.isSafeInteger(capacity) || quantity2 > capacity) throw new Error("delivery quantity exceeds worker capacity");
    }
  }
  return selected.map((worker) => {
    const active = activeTaskFor(context, worker);
    if (active?.phase === "complete") throw new Error("completed delivery cannot be restarted");
    const current = context.query(query(DeliveryControl)).find((row2) => row2.id === worker)?.get(DeliveryControl);
    if (enabled && active && current && quantity2 !== void 0 && current.quantity !== quantity2)
      throw new Error("cannot change quantity during active delivery");
    const nextQuantity = preserveCurrentQuantity ? current?.quantity ?? 1 : quantity2 ?? 1;
    return {
      component: DeliveryControl.id,
      entity: worker,
      value: { enabled, quantity: enabled ? nextQuantity : current?.quantity ?? 1 }
    };
  });
}
function selectedDigWorker(context, input) {
  const worker = input.entities[0];
  if (!workers.includes(worker)) throw new Error("selection must contain a colony worker");
  const workerState = context.query(query(Worker)).find((row2) => row2.id === worker)?.get(Worker);
  if (!workerState || workerState.guest) throw new Error("guests cannot act");
  return worker;
}
function depositActions(context, input) {
  const worker = selectedDigWorker(context, input);
  const lots = context.query(query(MaterialLot)).map((row2) => ({
    id: row2.id,
    ...row2.get(MaterialLot)
  }));
  const reservedLots = new Set(
    context.query(query(DeliveryTask)).map((row2) => row2.get(DeliveryTask)).filter((task) => task.phase !== "complete").map((task) => task.sourceLot)
  );
  const carried = lots.filter((lot) => lot.container === worker);
  if (carried.some((lot) => reservedLots.has(lot.id)))
    throw new Error("worker cargo is reserved by delivery");
  if (!carried.length) throw new Error("worker has no carried goods");
  if (carried.some((lot) => !Number.isSafeInteger(lot.quantity) || lot.quantity <= 0 || lot.quantity > 4294967295))
    throw new Error("worker cargo is invalid");
  const pantry = context.query(query(Container)).find((row2) => row2.id === pantryId)?.get(Container);
  if (!pantry) throw new Error("pantry is unavailable");
  const pantryQuantity = lots.filter((lot) => lot.container === pantryId).reduce((sum, lot) => sum + lot.quantity, 0);
  const carriedQuantity = carried.reduce((sum, lot) => sum + lot.quantity, 0);
  if (!Number.isSafeInteger(pantryQuantity) || !Number.isSafeInteger(carriedQuantity) || carriedQuantity > pantry.capacity - pantryQuantity)
    throw new Error("pantry lacks capacity");
  return carried.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map((lot) => transfer(lot.id, worker, pantryId, lot.quantity));
}
var colonyComponents = [
  Position,
  Emitter,
  Body,
  Container,
  Traversal,
  MaterialLot,
  StagedProcess,
  ProcessAttendanceWork,
  ExcavationWork,
  Destination,
  Worker,
  Guest,
  DeliveryTask,
  DeliveryControl,
  ColonyDigOrder,
  ColonyTree,
  ColonyTreeOrder,
  ColonyTreePolicy,
  FiniteResource,
  Cat,
  ConstructionApproach,
  DeconstructionApproach,
  DeconstructionOrder,
  WorkParticipation,
  StockpileCell,
  WaterSupplyOrder,
  WaterSupplyWork
];
function digArea(context, input) {
  const area3 = input.area;
  const [startX, y, startZ] = area3.start, [endX, endY, endZ] = area3.end;
  if (y !== endY) throw new Error("dig area must stay on one level");
  const minX = Math.min(startX, endX), maxX = Math.max(startX, endX), minZ = Math.min(startZ, endZ), maxZ = Math.max(startZ, endZ);
  const count = (maxX - minX + 1) * (maxZ - minZ + 1);
  if (!Number.isSafeInteger(count) || count < 1 || count > 256) throw new Error("dig area exceeds 256 cells");
  const existing = new Set(context.query(query(ColonyDigOrder)).map((row2) => row2.id));
  const creates = [];
  for (let x = minX; x <= maxX; x++) for (let z8 = minZ; z8 <= maxZ; z8++) {
    const id3 = `colony.dig.${x}.${y}.${z8}`;
    if (existing.has(id3)) continue;
    creates.push({ id: id3, components: { [ColonyDigOrder.id]: {
      cellX: x,
      cellY: y,
      cellZ: z8,
      expected: -1,
      actor: null,
      phase: "queued",
      reason: "",
      approachX: 0,
      approachY: 0,
      approachZ: 0
    } } });
  }
  if (existing.size + creates.length > 256) throw new Error("Finish or cancel existing dig orders before adding more than 256");
  return creates;
}
var colonyPack = {
  id: "colony",
  version: 6,
  components: colonyComponents,
  systems: [colonyWorkSystem, colonyCatSystem],
  environmentDefinition: colonyEnvironmentDefinition,
  commands: {
    build: colonyBuildCommand,
    deconstruct: command({
      title: "Deconstruct",
      localPresentation: { bindings: [{ id: "deconstruct", label: "Deconstruct", selection: { field: "site", cardinality: "one" }, designation: ["entities"] }] },
      category: "Construction",
      description: "Queue teardown of a finished construction site and recover its salvage.",
      availability: (context) => context.query(query(ConstructionSite)).some((row2) => row2.get(ConstructionSite).phase === "finished") ? { status: "available" } : { status: "unavailable", reason: "No finished construction is available to deconstruct." },
      subjects: (context) => context.query(query(ConstructionSite)).filter((row2) => row2.get(ConstructionSite).phase === "finished").map((row2) => row2.id),
      input: z4.object({ site: z4.string().min(1).max(128) }).strict(),
      reads: [ConstructionSite, DeconstructionOrder],
      writes: [],
      lifecycle: [DeconstructionOrder],
      run(context, input) {
        const site = context.query(query(ConstructionSite)).find((row2) => row2.id === input.site);
        if (!site) throw new Error("Unknown construction site");
        if (site.get(ConstructionSite).phase !== "finished") throw new Error("Construction site is not finished");
        if (context.query(query(DeconstructionOrder)).some((row2) => row2.get(DeconstructionOrder).site === input.site)) return { creates: [], actions: [], writes: [] };
        return { creates: [queueDeconstruction(entity(input.site))], actions: [], writes: [] };
      }
    }),
    designateStockpile: colonyStockpileCommand,
    updateStockpile: colonyStockpilePolicyCommand,
    requestWater: command({
      title: "Fetch water",
      category: "Colony",
      description: "Request one portion of water from the clearing.",
      input: emptyInput,
      reads: [WaterSupplyOrder],
      writes: [],
      lifecycle: [WaterSupplyOrder, WaterSupplyWork],
      run(context) {
        const orders = context.query(query(WaterSupplyOrder));
        if (orders.length >= 256) throw new Error("water demand capacity exhausted");
        const revision = orders.reduce((max, row2) => Math.max(max, row2.get(WaterSupplyOrder).revision), 0) + 1;
        const id3 = entity(`colony.water-demand.${revision}`);
        return { actions: [], writes: [], creates: [{ id: id3, components: {
          [WaterSupplyOrder.id]: { revision, process: null },
          [WaterSupplyWork.id]: { request: revision, attempt: 0, phase: "queued", actor: null, vessel: null, x: 0, y: 0, z: 0, approachX: 0, approachY: 0, approachZ: 0, reason: "" }
        } }] };
      }
    }),
    sowMugwort: command({
      title: "Sow mugwort",
      category: "Colony",
      description: "Designate a reachable soil cell for tended mugwort.",
      input: z4.object({ target: z4.object({ cell: z4.tuple([z4.number().int(), z4.number().int(), z4.number().int()]) }).strict() }).strict(),
      reads: [ColonyResourceOrder],
      writes: [],
      lifecycle: [ColonyResourceOrder],
      run: (_context, input) => {
        const [x, y, z8] = input.target.cell;
        const id3 = entity(`colony.resource.mugwort.${x}.${y}.${z8}`);
        return { actions: [], writes: [], creates: [{ id: id3, components: { [ColonyResourceOrder.id]: { definition: "mugwort", cellX: x, cellY: y, cellZ: z8, site: id3, actor: null, vessel: null, phase: "sow", workSeconds: 0, reason: "", approachX: 0, approachY: 0, approachZ: 0, attempt: 0, operation: "" } } }] };
      }
    }),
    requestBrew: command({
      title: "Brew herbal ale",
      category: "Colony",
      description: "Request one herbal ale process at a finished brew station.",
      localPresentation: { bindings: [{ id: "brew-process", label: "Brew herbal ale", selection: { field: "station", cardinality: "one" } }] },
      availability: (context) => availableBrewStations(context).length > 0 ? { status: "available" } : { status: "unavailable", reason: "Build a free brew station before requesting ale." },
      subjects: (context) => availableBrewStations(context).map((row2) => row2.id),
      input: stationInput,
      reads: [ConstructionSite, StagedProcess],
      writes: [],
      run(context, input) {
        if (!availableBrewStations(context).some((row2) => row2.id === input.station)) throw new Error("This brew station already has an active brew process");
        return { actions: [requestProcess("herbal-ale-v1", input.station)], writes: [] };
      }
    }),
    deliver: command({
      title: "Deliver goods",
      category: "Colony",
      description: "Enable delivery work for selected workers.",
      input: deliveryInput,
      reads: [Worker, Container, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, true) })
    }),
    pauseDelivery: command({
      title: "Pause delivery",
      category: "Colony",
      description: "Pause delivery work for selected workers.",
      input: deliveryInput,
      reads: [Worker, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, false) })
    }),
    resumeDelivery: command({
      title: "Resume delivery",
      category: "Colony",
      description: "Resume delivery work for selected workers.",
      input: deliveryInput,
      reads: [Worker, DeliveryTask, DeliveryControl],
      writes: [DeliveryControl],
      run: (context, input) => ({ actions: [], writes: deliveryWrites(context, input, true, true) })
    }),
    go: command({
      title: "Move workers",
      category: "Colony",
      description: "Move selected workers to a destination under manual control.",
      input: goInput,
      reads: [Worker, Position, WorkParticipation, ExcavationWork, ConstructionSite],
      writes: [WorkParticipation],
      run: (context, input) => {
        const parsed = input;
        const selected = selectedWorkers(context, parsed.entities);
        const positions = new Map(context.query(query(Position)).map((row2) => [row2.id, row2.get(Position)]));
        const excavating = new Set(context.query(query(ExcavationWork)).map((row2) => row2.id));
        const building = new Set(context.query(query(ConstructionSite)).flatMap((row2) => {
          const worker = row2.get(ConstructionSite).worker;
          return worker === null ? [] : [worker];
        }));
        return {
          actions: selected.flatMap((worker) => excavating.has(worker) || building.has(worker) ? [cancelWork(worker)] : []).concat(selected.map((worker) => {
            const position = positions.get(worker);
            if (!position) throw new Error("selected worker position is unavailable");
            return move(worker, parsed.destination, position.facing);
          })),
          writes: selected.map((worker) => ({ component: WorkParticipation.id, entity: worker, value: { automatic: false } }))
        };
      }
    }),
    resumeWork: command({
      title: "Resume automatic work",
      category: "Colony",
      description: "Return selected workers to automatic work assignment.",
      localPresentation: { bindings: [{ id: "resume-work", label: "Resume work", selection: "entities" }] },
      subjects: () => workers,
      input: workerSelectionInput,
      reads: [Worker, WorkParticipation],
      writes: [WorkParticipation],
      run: (context, input) => {
        const selected = selectedWorkers(context, input.entities);
        return { actions: [], writes: selected.map((worker) => ({ component: WorkParticipation.id, entity: worker, value: { automatic: true } })) };
      }
    }),
    dig: command({
      title: "Dig area",
      category: "Excavation",
      description: "Queue excavation for a same-level area.",
      localPresentation: { bindings: [{ id: "dig", label: "Dig area", target: "terrain-area", designation: ["rectangle"] }] },
      input: digInput,
      reads: [ColonyDigOrder],
      writes: [],
      lifecycle: [ColonyDigOrder],
      run: (context, input) => ({ actions: [], writes: [], creates: digArea(context, input) })
    }),
    designateTrees: command({
      title: "Fell selected trees",
      category: "Colony",
      description: "Designate standing trees for felling and chopping.",
      localPresentation: { bindings: [{ id: "designate-trees", label: "Fell selected trees", selection: "entities" }] },
      subjects: (context) => context.query(query(ColonyTree)).filter((row2) => row2.get(ColonyTree).phase === "standing").map((row2) => row2.id),
      input: treeSelectionInput,
      reads: [ColonyTree],
      writes: [ColonyTreePolicy],
      run(context, input) {
        const selected = new Set(input.entities);
        const trees2 = new Map(context.query(query(ColonyTree)).map((row2) => [row2.id, row2.get(ColonyTree)]));
        const writes = context.query(query(ColonyTree)).filter((row2) => selected.has(row2.id) && trees2.get(row2.id)?.phase === "standing").map((row2) => ({ component: ColonyTreePolicy.id, entity: row2.id, value: { designated: true } }));
        if (!writes.length) throw new Error("no standing trees selected");
        return { actions: [], writes };
      }
    }),
    cancelTrees: command({
      title: "Cancel tree work",
      category: "Colony",
      description: "Remove the felling designation from selected trees.",
      localPresentation: { bindings: [{ id: "cancel-trees", label: "Cancel tree work", selection: "entities" }] },
      subjects: (context) => context.query(query(ColonyTree, ColonyTreePolicy)).filter((row2) => row2.get(ColonyTreePolicy).designated && row2.get(ColonyTree).phase !== "chopped").map((row2) => row2.id),
      input: treeSelectionInput,
      reads: [ColonyTree, ColonyTreePolicy],
      writes: [ColonyTreePolicy],
      run(context, input) {
        const selected = new Set(input.entities);
        const rows = context.query(query(ColonyTree)).filter((row2) => selected.has(row2.id));
        if (!rows.length) throw new Error("no matching tree");
        return { actions: [], writes: rows.map((row2) => ({ component: ColonyTreePolicy.id, entity: row2.id, value: { designated: false } })) };
      }
    }),
    cancelDig: command({
      title: "Cancel excavation",
      category: "Excavation",
      description: "Cancel queued excavation orders in an area or for workers.",
      localPresentation: { bindings: [{ id: "cancel-dig", label: "Cancel dig area", target: "terrain-area", designation: ["rectangle"] }] },
      input: cancelDigInput,
      reads: [ColonyDigOrder, ExcavationWork],
      writes: [],
      lifecycle: [ColonyDigOrder],
      run: (context, input) => {
        const selected = input.entities ? new Set(input.entities) : null;
        let area3 = null;
        if (input.area) {
          const [startX, y, startZ] = input.area.start;
          const [endX, endY, endZ] = input.area.end;
          if (y !== endY) throw new Error("cancel dig area must stay on one level");
          area3 = { minX: Math.min(startX, endX), maxX: Math.max(startX, endX), minZ: Math.min(startZ, endZ), maxZ: Math.max(startZ, endZ), y };
        }
        if (selected === null && area3 === null) throw new Error("cancel dig requires workers or an area");
        const orders = context.query(query(ColonyDigOrder));
        const work = new Set(context.query(query(ExcavationWork)).map((row2) => row2.id));
        const removes = orders.filter((row2) => {
          const state = row2.get(ColonyDigOrder);
          const byWorker = selected !== null && state.actor !== null && selected.has(state.actor);
          const byArea = area3 !== null && state.cellY === area3.y && state.cellX >= area3.minX && state.cellX <= area3.maxX && state.cellZ >= area3.minZ && state.cellZ <= area3.maxZ;
          return byWorker || byArea;
        }).map((row2) => row2.id);
        if (!removes.length) throw new Error("no matching excavation order");
        const actions = orders.filter((row2) => removes.includes(row2.id) && row2.get(ColonyDigOrder).actor && work.has(row2.get(ColonyDigOrder).actor)).map((row2) => cancelWork(row2.get(ColonyDigOrder).actor));
        return { actions, writes: [], removes };
      }
    }),
    deposit: command({
      title: "Deposit carried goods",
      category: "Colony",
      description: "Deposit carried materials into their assigned destination.",
      localPresentation: { bindings: [{ id: "deposit", label: "Deposit carried goods", selection: "entities" }] },
      subjects: () => workers,
      input: depositInput,
      reads: [Worker, Body, Container, DeliveryTask, ExcavationWork, MaterialLot],
      writes: [],
      run: (context, input) => ({ actions: depositActions(context, input), writes: [] })
    })
  },
  presentation: {
    activities: (context) => {
      const positions = new Map(context.query(query(Position)).map((row2) => [row2.id, row2.get(Position)]));
      const trees2 = context.query(query(ColonyTreeOrder)).flatMap((row2) => {
        const order = row2.get(ColonyTreeOrder), position = positions.get(order.tree);
        const actorPosition = order.actor === null ? void 0 : positions.get(order.actor);
        return order.phase === "working" && order.actor !== null && position && actorPosition && treeWorkerAtApproach(actorPosition, order) ? [{ actor: order.actor, kind: "chop", target: [position.x, position.z], progress: treeWorkProgress(order) }] : [];
      });
      const excavation = context.query(query(ExcavationWork)).flatMap((row2) => {
        const work = row2.get(ExcavationWork);
        const definition = colonyEnvironment.materials.find((slot) => slot.slot === work.expected)?.excavation;
        return definition ? [{ actor: row2.id, kind: "dig", target: [work.x, work.z], progress: Math.max(0, Math.min(1, work.seconds / definition.workSeconds)) }] : [];
      });
      const construction = context.query(query(ConstructionSite)).flatMap((row2) => {
        const site = row2.get(ConstructionSite);
        if (site.phase !== "working" || site.worker === null) return [];
        const definition = colonyEnvironment.structures.catalog.find((item) => item.id === site.catalog);
        return definition ? [{ actor: site.worker, kind: "build", target: [site.x, site.z], progress: Math.max(0, Math.min(1, site.seconds / definition.workSeconds)) }] : [];
      });
      return [...trees2, ...excavation, ...construction];
    },
    visuals: (context) => {
      const stationProfiles = colonyBrewStationProfiles(context);
      return [
        ...context.query(query(ColonyTree, Position)).map((row2) => {
          const tree = row2.get(ColonyTree), position = row2.get(Position);
          const visual = tree.phase === "standing" ? "colony.tree" : tree.phase === "felled" ? "colony.tree.felled" : "colony.tree.stump";
          return { id: row2.id, visual, label: `Tree \xB7 ${tree.phase}`, pose: { position: { x: position.x, y: position.y, z: position.z }, facing: position.facing } };
        }),
        ...colonyConstructionVisuals(context).map((visual) => {
          const profile = stationProfiles.get(visual.id);
          return profile ? { ...visual, visual: `colony.brew-station.profile.${profile}` } : visual;
        }),
        ...(() => {
          const lotsByContainer = /* @__PURE__ */ new Map();
          for (const row2 of context.query(query(MaterialLot))) {
            const lot = row2.get(MaterialLot);
            if (lot.quantity > 0 && (lot.kind === "soil-spoil" || lot.kind === "stone-spoil"))
              lotsByContainer.set(lot.container, lot);
          }
          return context.query(query(GroundStock, Position)).flatMap((row2) => {
            const position = row2.get(Position);
            const lot = lotsByContainer.get(row2.id);
            if (!lot) return [];
            const visual = lot.kind === "soil-spoil" ? "soil" : "stone";
            return [{
              id: row2.id,
              visual,
              label: `${lot.kind} \xB7 ${lot.quantity}`,
              pose: { position: { x: position.x, y: position.y, z: position.z }, facing: position.facing }
            }];
          });
        })()
      ];
    },
    terrainMarks: (context) => [
      ...context.query(query(ColonyDigOrder)).map((row2) => {
        const order = row2.get(ColonyDigOrder);
        return {
          id: row2.id,
          cell: [order.cellX, order.cellY, order.cellZ],
          status: order.phase === "blocked" ? "blocked" : order.actor ? "working" : "queued"
        };
      }),
      ...context.query(query(StockpileCell, Position)).map((row2) => ({
        id: `stockpile-mark-${row2.id}`,
        cell: [Math.round(row2.get(Position).x), Math.floor(row2.get(Position).y / colonyEnvironment.world.verticalMetres), Math.round(row2.get(Position).z)],
        status: "queued",
        kind: "stockpile",
        subjects: [row2.id]
      }))
    ],
    inspect: (context) => {
      const lots = context.query(query(MaterialLot)).map((row2) => row2.get(MaterialLot));
      const constructionSites = context.query(query(ConstructionSite));
      const unfinishedConstruction = constructionSites.filter((row2) => row2.get(ConstructionSite).phase !== "finished").map((row2) => row2.id);
      const constructionReadiness = new Map(
        unfinishedConstruction.length === 0 ? [] : context.constructionReadiness(unfinishedConstruction).map((row2) => [row2.site, row2.status])
      );
      const constructionSubjects = /* @__PURE__ */ new Map();
      for (const row2 of constructionSites) {
        const site = row2.get(ConstructionSite);
        const label = constructionStatusLabel(site.phase, constructionReadiness.get(row2.id) ?? "unknown");
        const subjects = constructionSubjects.get(label) ?? [];
        subjects.push(row2.id);
        constructionSubjects.set(label, subjects);
      }
      const lotTotals = /* @__PURE__ */ new Map();
      for (const lot of lots) lotTotals.set(lot.container, (lotTotals.get(lot.container) ?? 0) + lot.quantity);
      const total2 = (container) => lotTotals.get(container) ?? 0;
      const taskRows = context.query(query(DeliveryTask));
      const stationFacts = finishedBrewStations(context).slice(0, 8).map((site) => {
        const hearth = entity(`${site.id}:hearth`);
        const stationAir = context.atmosphereSamples([[
          Math.floor(site.get(ConstructionSite).x + 0.5),
          site.get(ConstructionSite).y + 1,
          Math.floor(site.get(ConstructionSite).z + 0.5)
        ]]).samples[0];
        const process = context.query(query(StagedProcess)).find((row2) => row2.get(StagedProcess).station === site.id)?.get(StagedProcess);
        const phase = process?.phase === "complete" ? "Complete" : process ? `Stage ${process.stageIndex + 1}` : "No process";
        return { id: `station-${site.id}`, subjects: [site.id], label: "Brew station", value: `${stationAir ? `${stationAir.temperatureC.toFixed(1)} \xB0C, ${(stationAir.smokeKgM3 * 1e6).toFixed(1)} mg/m\xB3` : "air not modeled"} \xB7 ${total2(hearth)} wood \xB7 ${phase}` };
      });
      return [
        ...[...constructionSubjects.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([status, subjects], index) => ({
          id: `construction-status-${index + 1}`,
          subjects,
          label: "Construction",
          value: status
        })),
        ...(() => {
          const grouped = /* @__PURE__ */ new Map();
          for (const row2 of context.query(query(StockpileCell, Container, Position))) {
            const cell3 = row2.get(StockpileCell), container = row2.get(Container);
            const current = grouped.get(cell3.zone) ?? { profile: cell3.filterProfile, priority: cell3.priority, contents: 0, capacity: 0, cells: [] };
            current.contents += total2(row2.id);
            current.capacity += container.capacity;
            current.cells.push(row2.id);
            grouped.set(cell3.zone, current);
          }
          return [...grouped.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).slice(0, 32).map(([zone, value], index) => ({
            id: `stockpile-zone-${index}`,
            label: "Stockpile",
            value: `${value.profile} \xB7 priority ${value.priority} \xB7 ${value.contents}/${value.capacity}`,
            subjects: value.cells
          }));
        })(),
        ...(() => {
          const trees2 = new Map(context.query(query(ColonyTree)).map((row2) => [row2.id, row2.get(ColonyTree)]));
          return context.query(query(ColonyTreeOrder)).flatMap((row2) => {
            const order = row2.get(ColonyTreeOrder), tree = trees2.get(order.tree);
            return tree ? [{ id: `tree-${order.tree}`, subjects: [order.tree], label: "Tree work", value: `${tree.phase} \xB7 ${order.stage} \xB7 ${order.phase}` }] : [];
          });
        })(),
        { id: "pantry-quantity", subjects: [pantryId], label: "Pantry", value: total2(pantryId) },
        { id: "lumber-quantity", subjects: [colonyLumberId], label: "Starter lumber", value: total2(colonyLumberId) },
        ...stationFacts,
        { id: "worker-carried", subjects: workers, label: "Workers carry", value: workers.reduce((sum, worker) => sum + total2(worker), 0) },
        ...workers.map((worker, index) => ({
          id: `worker-${index + 1}-control`,
          subjects: [worker],
          label: workerVisuals[index].label,
          value: context.query(query(WorkParticipation)).find((row2) => row2.id === worker)?.get(WorkParticipation).automatic === false ? "manual" : "automatic"
        })),
        { id: "guest-quantity", subjects: [guestId], label: "Guest meal", value: total2(guestId) },
        ...workers.map((worker, index) => ({
          id: `dig-progress-${index + 1}`,
          subjects: [worker],
          label: `Worker ${index + 1} digging`,
          value: context.query(query(ExcavationWork)).find((row2) => row2.id === worker)?.get(ExcavationWork).seconds ?? 0
        })),
        { id: "spoil-carried", subjects: workers, label: "Spoil carried", value: workers.reduce((sum, worker) => sum + lots.filter((lot) => lot.container === worker && (lot.kind === "soil-spoil" || lot.kind === "stone-spoil")).reduce((total3, lot) => total3 + lot.quantity, 0), 0) },
        { id: "spoil-ground", label: "Loose spoil", value: (() => {
          const stockContainers = new Set(context.query(query(GroundStock)).map((row2) => row2.id));
          return context.query(query(MaterialLot)).reduce((sum, row2) => {
            const lot = row2.get(MaterialLot);
            return sum + (stockContainers.has(lot.container) && (lot.kind === "soil-spoil" || lot.kind === "stone-spoil") ? lot.quantity : 0);
          }, 0);
        })() },
        { id: "dig-orders", label: "Dig orders", value: context.query(query(ColonyDigOrder)).length },
        { id: "dig-blocked", label: "Dig blocked", value: context.query(query(ColonyDigOrder)).find((row2) => row2.get(ColonyDigOrder).phase === "blocked")?.get(ColonyDigOrder).reason ?? "none" },
        ...tasks.map((id3, index) => ({ id: `delivery-phase-${index + 1}`, subjects: [guestId], label: `Delivery ${index + 1}`, value: taskRows.find((row2) => row2.id === id3)?.get(DeliveryTask).phase ?? "missing" }))
      ];
    }
  },
  definition: encodeDefinition("colony", colonyComponents, colonyInitial)
};

// engine/src/games/colony-work.test.ts
var id2 = (value) => value;
var row = (entity2, values) => ({ id: id2(entity2), get: (definition) => values.get(definition) });
var clock = { now: 20, delta: 0.25, tick: 80 };
function providerContext(order, site, lots = [], outcomes = []) {
  const writes = [], created = [], removed = [], actions = [];
  const worker = row("worker", /* @__PURE__ */ new Map([[Worker, { guest: false }], [Body, { speed: 1 }], [Position, { x: 1, y: 1, z: 1, facing: 0 }]]));
  const context = {
    clock,
    outcomes,
    writes,
    query(spec) {
      if (spec.components.includes(Worker)) return [worker];
      if (spec.components.includes(ResourceSite)) return [row("site", /* @__PURE__ */ new Map([[ResourceSite, site]]))];
      if (spec.components.includes(MaterialLot)) return lots.map((lot) => row(lot.id, /* @__PURE__ */ new Map([[MaterialLot, lot]])));
      if (spec.components.includes(WaterSupplyOrder)) return created.map((record) => row(record.id, /* @__PURE__ */ new Map([
        [WaterSupplyOrder, record.components[WaterSupplyOrder.id]],
        [WaterSupplyWork, record.components[WaterSupplyWork.id]]
      ])));
      return [row("order", /* @__PURE__ */ new Map([[ColonyResourceOrder, order]]))];
    },
    workMaterialFacts: () => ({ version: 1, containers: lots.map((lot) => ({ id: lot.id, capacity: 8, sealed: false })), lots }),
    worldPoses: () => [{ id: id2("worker"), local: { x: 2, y: 1.5, z: 1, facing: 0 }, world: { x: 2, y: 1.5, z: 1, facing: 0 }, support: null, surface: null }],
    routeToAny: () => ({ status: "reachable", targetIndex: 0, cost: 1 }),
    routeCosts: () => [],
    waterContacts: () => [],
    action: (value) => actions.push(value),
    write: (_definition, entity2, value) => writes.push([entity2, value]),
    createAuthoredEntity: (value) => created.push(value),
    removeAuthoredEntity: (value) => removed.push(value)
  };
  return { context, writes, created, removed, actions };
}
test("player sow intent is workerless and blocked tend creates one stable shared water demand", () => {
  const order = { definition: "mugwort", cellX: 0, cellY: 1, cellZ: 0, site: id2("site"), actor: null, vessel: null, phase: "waiting", workSeconds: 0, reason: "", approachX: 0, approachY: 0, approachZ: 0, attempt: 0, operation: "" };
  const { context, created } = providerContext(order, { kind: "mugwort", stage: 0, nextDue: 0 }, []);
  resourceWorkProvider(context, /* @__PURE__ */ new Set());
  assert.equal(created.length, 1);
  assert.match(created[0].id, /colony\.resource-water\.order/);
  resourceWorkProvider(context, /* @__PURE__ */ new Set());
  assert.equal(created.length, 1, "the same blocked resource keeps one shared demand identity");
});
test("tend candidates require the exact worker-held pail and nested sufficient water", () => {
  const order = { definition: "mugwort", cellX: 0, cellY: 1, cellZ: 0, site: id2("site"), actor: null, vessel: null, phase: "tend", workSeconds: 0, reason: "", approachX: 0, approachY: 0, approachZ: 0, attempt: 0, operation: "" };
  const { context } = providerContext(order, { kind: "mugwort", stage: 1, nextDue: 0 }, [
    { id: id2("pail-empty"), kind: "pail", quantity: 1, container: id2("worker") },
    { id: id2("pail-empty-water"), kind: "water", quantity: 0, container: id2("pail-empty") },
    { id: id2("pail-full"), kind: "pail", quantity: 1, container: id2("other-worker") },
    { id: id2("pail-full-water"), kind: "water", quantity: 4, container: id2("pail-full") }
  ]);
  const prepared = resourceWorkProvider(context, /* @__PURE__ */ new Set());
  assert.equal(prepared.candidates.length, 0);
  const sufficient = providerContext(order, { kind: "mugwort", stage: 1, nextDue: 0 }, [
    { id: id2("pail"), kind: "pail", quantity: 1, container: id2("worker") },
    { id: id2("nested-water"), kind: "water", quantity: 1, container: id2("pail") }
  ]);
  const selected = resourceWorkProvider(sufficient.context, /* @__PURE__ */ new Set());
  assert.equal(selected.candidates[0].vessel, "pail");
  assert.equal(selected.candidates[0].worker, "worker");
});
test("rejected native approach releases the claim and accepted operation settles once", () => {
  const order = { definition: "mugwort", cellX: 0, cellY: 1, cellZ: 0, site: id2("site"), actor: id2("worker"), vessel: id2("pail"), phase: "tend", workSeconds: 2, reason: "", approachX: 1, approachY: 1.5, approachZ: 0, attempt: 3, operation: "order:tend:3" };
  const rejected = providerContext(order, { kind: "mugwort", stage: 0, nextDue: 99 }, [], [{ action: { kind: "move", entity: id2("worker"), destination: { x: 1, y: 1.5, z: 0 } }, result: { accepted: false, reason: "blocked" } }]);
  resourceWorkProvider(rejected.context, /* @__PURE__ */ new Set());
  assert.equal(rejected.writes.at(-1)[1].actor, null);
  assert.equal(rejected.writes.at(-1)[1].workSeconds, 0);
  const settled = providerContext({ ...order, phase: "submitting-tend" }, { kind: "mugwort", stage: 0, nextDue: 99 }, [], [{ action: { kind: "tend-resource-site", operation: order.operation, worker: id2("worker"), site: id2("site"), vessel: id2("pail") }, result: { accepted: true } }]);
  resourceWorkProvider(settled.context, /* @__PURE__ */ new Set());
  assert.equal(settled.writes.at(-1)[1].phase, "waiting");
  assert.equal(settled.writes.at(-1)[1].actor, null);
});
test("GameSession preserves a finite mugwort harvest through ordinary brew input consumption and reload", async (t) => {
  if (!existsSync("engine/generated/hive_kernel_bg.wasm")) {
    t.skip("generated WASM is unavailable in this checkout");
    return;
  }
  const [{ initSync, WasmKernel }, { GameSession: GameSession2 }, { wasmKernelPort: wasmKernelPort2 }] = await Promise.all([
    import("../../generated/hive_kernel.js"),
    Promise.resolve().then(() => (init_session(), session_exports)),
    Promise.resolve().then(() => (init_wasm_kernel(), wasm_kernel_exports))
  ]);
  initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });
  const port = wasmKernelPort2(new WasmKernel());
  const session = new GameSession2({ port, pack: colonyPack });
  try {
    session.start();
    session.command("sowMugwort", { target: { cell: [0, 13, 0] } });
    session.step(0);
    const intent = session.query(query(ColonyResourceOrder))[0]?.get(ColonyResourceOrder);
    assert(intent, "sow command must create a workerless resource intent");
    assert.equal(intent.actor, null);
    assert.equal(intent.vessel, null);
    const savedBeforeWork = session.save();
    session.restore(savedBeforeWork);
    assert.deepEqual(session.save(), savedBeforeWork);
    for (let tick = 0; tick < 4e3; tick++) {
      session.step(0.25);
      const current = session.query(query(ColonyResourceOrder))[0]?.get(ColonyResourceOrder);
      if (current?.phase === "complete") break;
    }
    const lots = session.query(query(MaterialLot)).map((row2) => row2.get(MaterialLot));
    assert.equal(lots.filter((lot) => lot.kind === "mugwort").reduce((sum, lot) => sum + lot.quantity, 0), 1);
    const saved = session.save();
    session.restore(saved);
    assert.deepEqual(session.save(), saved);
  } finally {
    port.dispose();
  }
});
