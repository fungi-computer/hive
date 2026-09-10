import type { GamePack, ReadContext } from "./contracts";

export interface PresentationControl {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly input?: unknown;
}
export interface PresentationFact {
  readonly id: string;
  readonly label: string;
  readonly value: string | number | boolean;
}
export interface GamePresentation {
  readonly controls: readonly PresentationControl[];
  readonly inspect: (
    context: Pick<ReadContext, "query">,
  ) => readonly PresentationFact[];
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
  context: Pick<ReadContext, "query">,
): {
  readonly facts: readonly PresentationFact[];
  readonly controls: readonly PresentationControl[];
} {
  const presentation = pack.presentation;
  if (!presentation) return { facts: [], controls: [] };
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
    return Object.freeze({
      id,
      label,
      command,
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
  return Object.freeze({
    facts: Object.freeze(structuredClone(facts)),
    controls: Object.freeze(structuredClone(controls)),
  });
}
