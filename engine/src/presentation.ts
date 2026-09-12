import type { GamePack, ReadContext } from "./contracts";
import { z } from "zod";

const presentationSubjectsSchema = z.array(z.string().min(1).max(128))
  .min(1).max(128)
  .refine((subjects) => new Set(subjects).size === subjects.length, "subjects must be unique");

export const presentationControlSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(128),
  command: z.string().min(1).max(128),
  input: z.unknown().optional(),
  selection: z.literal("entities").optional(),
  target: z.enum(["terrain-cell", "terrain-area", "world-surface"]).optional(),
  subjects: presentationSubjectsSchema.optional(),
  parameters: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("enum"), id: z.string().min(1).max(64), label: z.string().min(1).max(128), options: z.array(z.object({ value: z.string().min(1).max(64), label: z.string().min(1).max(128) }).strict()).min(1).max(32), default: z.string().min(1).max(64).optional() }).strict(),
    z.object({ type: z.literal("boolean"), id: z.string().min(1).max(64), label: z.string().min(1).max(128), default: z.boolean().optional() }).strict(),
    z.object({ type: z.enum(["integer", "number"]), id: z.string().min(1).max(64), label: z.string().min(1).max(128), min: z.number().finite().optional(), max: z.number().finite().optional(), step: z.number().finite().positive().optional(), default: z.number().finite().optional() }).strict(),
  ])).max(8).optional(),
}).strict();

export const presentationFactSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(128),
  value: z.union([z.string().max(512), z.number().finite(), z.boolean()]),
  subjects: presentationSubjectsSchema.optional(),
}).strict();

export interface PresentationControl {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly input?: unknown;
  /** Add the current client selection as input.entities; admission remains game-owned. */
  readonly selection?: "entities";
  /** Arm a shared world-target gesture; admission remains game-owned. */
  readonly target?: "terrain-cell" | "terrain-area" | "world-surface";
  /** Display/selection binding metadata only; command authority remains game-owned. */
  readonly subjects?: readonly string[];
  readonly parameters?: readonly PresentationParameter[];
}
export type PresentationParameter =
  | { readonly type: "enum"; readonly id: string; readonly label: string; readonly options: readonly { readonly value: string; readonly label: string }[]; readonly default?: string }
  | { readonly type: "boolean"; readonly id: string; readonly label: string; readonly default?: boolean }
  | { readonly type: "integer" | "number"; readonly id: string; readonly label: string; readonly min?: number; readonly max?: number; readonly step?: number; readonly default?: number };

function parameterValues(control: PresentationControl, values: unknown): Record<string, unknown> {
  const parameters = control.parameters ?? [];
  if (parameters.length > 8) throw new Error("presentation parameter limit exceeded");
  const provided = values === undefined ? {} : values;
  if (provided === null || typeof provided !== "object" || Array.isArray(provided)) throw new Error("presentation parameters must be an object");
  const source = provided as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const ids = new Set<string>();
  for (const parameter of parameters) {
    if ((parameter.type === "integer" || parameter.type === "number") && parameter.min !== undefined && parameter.max !== undefined && parameter.min > parameter.max) throw new Error(`invalid bounds for ${parameter.id}`);
    if (ids.has(parameter.id) || parameter.id === "entities" || parameter.id === "target" || parameter.id === "area") throw new Error("invalid presentation parameter id");
    ids.add(parameter.id);
    const value = Object.prototype.hasOwnProperty.call(source, parameter.id) ? source[parameter.id] : parameter.default;
    if (value === undefined) continue;
    if (parameter.type === "enum") {
      if (typeof value !== "string" || !parameter.options.some(option => option.value === value)) throw new Error(`invalid value for ${parameter.id}`);
    } else if (parameter.type === "boolean") {
      if (typeof value !== "boolean") throw new Error(`invalid value for ${parameter.id}`);
    } else {
      if (typeof value !== "number" || !Number.isFinite(value) || (parameter.type === "integer" && !Number.isSafeInteger(value)) || (parameter.min !== undefined && value < parameter.min) || (parameter.max !== undefined && value > parameter.max)) throw new Error(`invalid value for ${parameter.id}`);
    }
    result[parameter.id] = value;
  }
  if (Object.keys(source).some(id => !ids.has(id))) throw new Error("unknown presentation parameter");
  return result;
}
export function presentationCommand(
  control: PresentationControl,
  selected: readonly string[],
  values?: unknown,
) {
  const parameters = parameterValues(control, values);
  if (control.selection !== "entities") {
    if (control.parameters?.length) {
      const input = control.input;
      if (input !== undefined && (input === null || typeof input !== "object" || Array.isArray(input))) throw new Error("parameter control requires object input");
      return { type: "command" as const, name: control.command, input: controlInput({ ...(input as object ?? {}), ...parameters }) };
    }
    return {
      type: "command" as const,
      name: control.command,
      input: control.input,
    };
  }
  if (
    selected.length > 128 ||
    selected.some((id) => typeof id !== "string" || !id || id.length > 128)
  )
    throw new Error("invalid command selection");
  const scopedSelected = control.subjects === undefined
    ? selected
    : selected.filter((id) => control.subjects?.includes(id));
  const input = control.input;
  if (
    input !== undefined &&
    (input === null ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      "entities" in input)
  )
    throw new Error("selection control requires object input without entities");
  return {
    type: "command" as const,
    name: control.command,
    input: controlInput({
      ...(input as object),
      ...parameters,
      entities: [...new Set(scopedSelected)],
    }),
  };
}
export type TerrainCommandTarget = {
  readonly cell: readonly [number, number, number];
  readonly material: number;
} | {
  readonly cell: readonly [number, number, number];
  readonly source: "structure" | "placement";
};

/** Bind a published visible terrain target without granting edit permission. */
export function terrainPresentationCommand(
  control: PresentationControl,
  selected: readonly string[],
  target: TerrainCommandTarget,
) {
  if (control.target !== "terrain-cell" && control.target !== "world-surface") throw new Error("control does not accept surfaces");
  const source = "source" in target ? target.source : undefined;
  const structure = source === "structure";
  if (source !== undefined && source !== "structure" && source !== "placement") throw new Error("invalid terrain command source");
  if (source === "placement" && control.target !== "world-surface") throw new Error("placement requires terrain surface control");
  if (structure && control.target !== "world-surface") throw new Error("control requires terrain, not a structure");
  if (!Array.isArray(target.cell) || target.cell.length !== 3 ||
      !target.cell.every(Number.isSafeInteger) || (!source && (!("material" in target) || !Number.isSafeInteger(target.material) ||
      target.material < 0 || target.material > 65535)))
    throw new Error("invalid terrain command target");
  const command = presentationCommand(control, selected);
  const input = command.input;
  if (input !== undefined && (input === null || typeof input !== "object" ||
      Array.isArray(input) || "target" in input))
    throw new Error("terrain control requires object input without target");
  return { ...command, input: controlInput({ ...(input as object),
      target: { cell: [...target.cell], ...(source ? { source } : { material: (target as {material:number}).material }) } }) };
}

/** A compact designation, independent of the current worker selection. */
export function terrainAreaPresentationCommand(
  control: PresentationControl,
  selected: readonly string[],
  area: { readonly start: readonly number[]; readonly end: readonly number[] },
) {
  if (control.target !== "terrain-area") throw new Error("control does not accept terrain areas");
  for (const cell of [area.start, area.end])
    if (!Array.isArray(cell) || cell.length !== 3 || !cell.every(Number.isSafeInteger))
      throw new Error("invalid terrain area cell");
  const width = Math.abs(area.end[0] - area.start[0]) + 1;
  const depth = Math.abs(area.end[2] - area.start[2]) + 1;
  if (area.start[1] !== area.end[1] || !Number.isSafeInteger(width * depth) || width * depth > 256)
    throw new Error("terrain area exceeds one level or 256 cells");
  const command = presentationCommand(control, selected);
  const input = command.input;
  if (input !== undefined && (input === null || typeof input !== "object" || Array.isArray(input) || "area" in input))
    throw new Error("terrain area control requires object input without area");
  return { ...command, input: controlInput({ ...(input as object), area: { start: [...area.start], end: [...area.end] } }) };
}

export interface PresentationFact {
  readonly id: string;
  readonly label: string;
  readonly value: string | number | boolean;
  /** Display scope only; facts without subjects are world-wide. */
  readonly subjects?: readonly string[];
}
export interface EnvironmentVisual {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly kind: "smoke" | "fire";
  readonly intensity: number;
}
export type TerrainMark = {
  readonly id: string;
  readonly cell: readonly [number, number, number];
  readonly status: "queued" | "working" | "blocked";
};
export type ZoneMark = {
  readonly id: string;
  readonly zone: string;
  readonly cell: readonly [number, number, number];
  readonly status: "queued" | "working" | "blocked" | "misplaced";
  readonly priority: number;
  readonly occupancy: { readonly used: number; readonly capacity: number; readonly incoming?: number };
};
export interface GamePresentation {
  readonly visuals?: (context: Pick<ReadContext, "query">) => readonly import("./runtime/visual-projection").EntityVisualProjection[];
  /** Opt into committed physical feedback; no simulation behavior is granted. */
  readonly feedback?: boolean;
  readonly controls: readonly PresentationControl[];
  readonly inspect: (
    context: Pick<ReadContext, "query" | "atmosphereSamples">,
  ) => readonly PresentationFact[];
  readonly terrainMarks?: (
    context: Pick<ReadContext, "query" | "atmosphereSamples">,
  ) => readonly TerrainMark[];
  readonly zoneMarks?: (context: Pick<ReadContext, "query" | "atmosphereSamples">) => readonly ZoneMark[];
  readonly environmentVisuals?: (
    context: Pick<ReadContext, "query" | "atmosphereSamples" | "environmentFacts">,
  ) => readonly EnvironmentVisual[];
}
function controlInput(value: unknown): unknown {
  const wire = JSON.stringify(value, (_key, item) => {
    if (typeof item === "number" && !Number.isFinite(item))
      throw new Error("nonfinite presentation input");
    if (["undefined", "function", "symbol", "bigint"].includes(typeof item))
      throw new Error("presentation input must be JSON");
    return item;
  });
  if (new TextEncoder().encode(wire).byteLength > 4096)
    throw new Error("presentation input too large");
  return JSON.parse(wire);
}
/** Pure, bounded projection used by the client. No presentation value is physical state. */
export function projectPresentation(
  pack: GamePack,
  context: Pick<ReadContext, "query" | "atmosphereSamples" | "environmentFacts">,
): {
  readonly facts: readonly PresentationFact[];
  readonly controls: readonly PresentationControl[];
  readonly terrainMarks: readonly TerrainMark[];
  readonly zoneMarks: readonly ZoneMark[];
  readonly environmentVisuals: readonly EnvironmentVisual[];
} {
  const presentation = pack.presentation;
  if (!presentation) return { facts: [], controls: [], terrainMarks: [], zoneMarks: [], environmentVisuals: [] };
  if (presentation.controls.length > 16)
    throw new Error("presentation control limit exceeded");
  const commandNames = new Set(Object.keys(pack.commands ?? {}));
  const ids = new Set<string>();
  const controls = presentation.controls.map((raw) => {
    const control = presentationControlSchema.parse(raw);
    if (ids.has(control.id)) throw new Error(`duplicate presentation id ${control.id}`);
    ids.add(control.id);
    if (!commandNames.has(control.command))
      throw new Error(`unknown presentation command ${control.command}`);
    if (control.selection) presentationCommand(control, []);
    if (control.parameters) presentationCommand(control, []);
    if (control.target === "terrain-cell" || control.target === "world-surface") terrainPresentationCommand(control, [], { cell: [0, 0, 0], material: 0 });
    if (control.target === "terrain-area") terrainAreaPresentationCommand(control, [], { start: [0, 0, 0], end: [0, 0, 0] });
    return Object.freeze({ ...control,
      ...(control.input === undefined ? {} : { input: controlInput(control.input) }),
    });
  });
  const inspected = presentation.inspect(context);
  if (inspected.length > 32)
    throw new Error("presentation fact limit exceeded");
  const facts = inspected.map((raw) => {
    const fact = presentationFactSchema.parse(raw);
    if (ids.has(fact.id)) throw new Error(`duplicate presentation id ${fact.id}`);
    ids.add(fact.id);
    return Object.freeze(fact);
  });
  const markIds = new Set<string>();
  const terrainMarks = (presentation.terrainMarks?.(context) ?? []).map((mark) => {
    if (!mark || typeof mark.id !== "string" || mark.id.length === 0 || mark.id.length > 128 || markIds.has(mark.id) ||
        !Array.isArray(mark.cell) || mark.cell.length !== 3 || !mark.cell.every(Number.isSafeInteger) ||
        !["queued", "working", "blocked"].includes(mark.status))
      throw new Error("invalid terrain presentation mark");
    markIds.add(mark.id);
    return Object.freeze({ id: mark.id, cell: [mark.cell[0], mark.cell[1], mark.cell[2]] as [number, number, number], status: mark.status });
  });
  if (terrainMarks.length > 256) throw new Error("terrain presentation mark limit exceeded");
  const zoneIds = new Set<string>();
  const zoneMarks = (presentation.zoneMarks?.(context) ?? []).map((mark) => {
    if (!mark || typeof mark.id !== "string" || !mark.id || mark.id.length > 128 || zoneIds.has(mark.id) || typeof mark.zone !== "string" || !mark.zone || mark.zone.length > 128 || !Array.isArray(mark.cell) || mark.cell.length !== 3 || !mark.cell.every(Number.isSafeInteger) || !["queued", "working", "blocked", "misplaced"].includes(mark.status) || !Number.isSafeInteger(mark.priority) || mark.priority < 0 || !mark.occupancy || !Number.isSafeInteger(mark.occupancy.used) || mark.occupancy.used < 0 || !Number.isSafeInteger(mark.occupancy.capacity) || mark.occupancy.capacity <= 0 || (mark.occupancy.incoming !== undefined && (!Number.isSafeInteger(mark.occupancy.incoming) || mark.occupancy.incoming < 0))) throw new Error("invalid zone presentation mark");
    zoneIds.add(mark.id);
    return Object.freeze({ ...mark, cell: [mark.cell[0], mark.cell[1], mark.cell[2]] as [number, number, number], occupancy: { ...mark.occupancy } });
  });
  if (zoneMarks.length > 256) throw new Error("zone presentation mark limit exceeded");
  const environmentVisuals = (presentation.environmentVisuals?.(context) ?? []).map((visual) => {
    if (!visual || typeof visual.id !== "string" || visual.id.length === 0 || visual.id.length > 128 ||
        !visual.position || typeof visual.position !== "object" || Array.isArray(visual.position) ||
        !Number.isFinite(visual.position.x) || !Number.isFinite(visual.position.y) ||
        !Number.isFinite(visual.position.z) || visual.kind !== "smoke" && visual.kind !== "fire" ||
        !Number.isFinite(visual.intensity) || visual.intensity < 0 || visual.intensity > 1)
      throw new Error("invalid environment presentation visual");
    return Object.freeze({ id: visual.id, position: { x: visual.position.x, y: visual.position.y, z: visual.position.z }, kind: visual.kind, intensity: visual.intensity });
  });
  if (environmentVisuals.length > 64) throw new Error("environment visual limit exceeded");
  const visualIds = new Set<string>();
  for (const visual of environmentVisuals) {
    if (visualIds.has(visual.id)) throw new Error("duplicate environment visual id");
    visualIds.add(visual.id);
  }
  return Object.freeze({
    facts: Object.freeze(structuredClone(facts)),
    controls: Object.freeze(structuredClone(controls)),
    terrainMarks: Object.freeze(structuredClone(terrainMarks)),
    zoneMarks: Object.freeze(structuredClone(zoneMarks)),
    environmentVisuals: Object.freeze(structuredClone(environmentVisuals)),
  });
}
