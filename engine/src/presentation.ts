import type { GamePack, ReadContext } from "./contracts";

export interface PresentationControl {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly input?: unknown;
  /** Add the current client selection as input.entities; admission remains game-owned. */
  readonly selection?: "entities";
  /** Arm a shared world-target gesture; admission remains game-owned. */
  readonly target?: "terrain-cell" | "terrain-area" | "world-surface";
}
export function presentationCommand(
  control: PresentationControl,
  selected: readonly string[],
) {
  if (control.selection !== "entities")
    return {
      type: "command" as const,
      name: control.command,
      input: control.input,
    };
  if (
    selected.length > 128 ||
    selected.some((id) => typeof id !== "string" || !id || id.length > 128)
  )
    throw new Error("invalid command selection");
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
      entities: [...new Set(selected)],
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
const boundedText = (value: unknown, name: string, max: number) => {
  if (typeof value !== "string" || value.length === 0 || value.length > max)
    throw new Error(`invalid presentation ${name}`);
  return value;
};

/** Pure, bounded projection used by the client. No presentation value is physical state. */
export function projectPresentation(
  pack: GamePack,
  context: Pick<ReadContext, "query" | "atmosphereSamples" | "environmentFacts">,
): {
  readonly facts: readonly PresentationFact[];
  readonly controls: readonly PresentationControl[];
  readonly terrainMarks: readonly TerrainMark[];
  readonly environmentVisuals: readonly EnvironmentVisual[];
} {
  const presentation = pack.presentation;
  if (!presentation) return { facts: [], controls: [], terrainMarks: [], environmentVisuals: [] };
  if (presentation.controls.length > 16)
    throw new Error("presentation control limit exceeded");
  const commandNames = new Set(Object.keys(pack.commands ?? {}));
  const ids = new Set<string>();
  const controls = presentation.controls.map((control) => {
    const id = boundedText(control.id, "control id", 128);
    if (ids.has(id)) throw new Error(`duplicate presentation id ${id}`);
    ids.add(id);
    const label = boundedText(control.label, "control label", 128);
    const command = boundedText(control.command, "control command", 128);
    if (!commandNames.has(command))
      throw new Error(`unknown presentation command ${command}`);
    if (control.selection !== undefined && control.selection !== "entities")
      throw new Error("invalid presentation selection binding");
    if (control.target !== undefined && control.target !== "terrain-cell" && control.target !== "terrain-area" && control.target !== "world-surface")
      throw new Error("invalid presentation target binding");
    if (control.selection) presentationCommand(control, []);
    if (control.target === "terrain-cell" || control.target === "world-surface") terrainPresentationCommand(control, [], { cell: [0, 0, 0], material: 0 });
    if (control.target === "terrain-area") terrainAreaPresentationCommand(control, [], { start: [0, 0, 0], end: [0, 0, 0] });
    return Object.freeze({
      id,
      label,
      command,
      ...(control.target ? { target: control.target } : {}),
      ...(control.selection ? { selection: control.selection } : {}),
      ...(control.input === undefined
        ? {}
        : { input: controlInput(control.input) }),
    });
  });
  const inspected = presentation.inspect(context);
  if (inspected.length > 32)
    throw new Error("presentation fact limit exceeded");
  const facts = inspected.map((fact) => {
    const id = boundedText(fact.id, "fact id", 128);
    if (ids.has(id)) throw new Error(`duplicate presentation id ${id}`);
    ids.add(id);
    const label = boundedText(fact.label, "fact label", 128);
    const value = fact.value;
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error("presentation value must be finite");
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    )
      throw new Error(`invalid presentation value for ${id}`);
    if (typeof value === "string" && value.length > 512)
      throw new Error("presentation value too long");
    return Object.freeze({ id, label, value });
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
    environmentVisuals: Object.freeze(structuredClone(environmentVisuals)),
  });
}
