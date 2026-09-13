import { toJSONSchema } from "zod";
import { createWhistle } from "@fungi.computer/whistle";

function bindingData(control) {
  if (!control) return undefined;
  return {
    ...(control.selection ? { selection: control.selection } : {}),
    ...(control.target ? { target: control.target } : {}),
    ...(control.designation ? { designation: [...control.designation] } : {}),
    ...(control.subjects ? { subjects: [...control.subjects] } : {}),
    ...(control.input === undefined ? {} : { preset: control.input }),
  };
}

/** Build the single Whistle contribution for a GamePack command table. */
export function gamePackWhistleContribution(pack, submit) {
  if (!pack || typeof pack.id !== "string") throw new TypeError("game pack is required");
  if (typeof submit !== "function") throw new TypeError("durable command submitter is required");
  const controls = pack.presentation?.controls ?? [];
  const byCommand = new Map();
  for (const control of controls) {
    const existing = byCommand.get(control.command) ?? [];
    existing.push(control);
    byCommand.set(control.command, existing);
  }
  const commands = Object.entries(pack.commands ?? {}).map(([name, definition]) => {
    const commandControls = byCommand.get(name) ?? [];
    const bindings = commandControls.map(bindingData).filter(Boolean);
    const presentation = bindings.length ? { type: "custom", data: { bindings } } : undefined;
    return {
      id: name,
      title: definition.title,
      category: definition.category,
      description: definition.description,
      projections: { menu: { order: 40 }, palette: { order: 40 }, agent: { order: 40 } },
      action: {
        inputSchema: toJSONSchema(definition.input, { io: "input" }),
        ...(presentation ? { presentation } : {}),
      },
      handler: ({ arguments: input }) => submit({ type: "command", name, input }),
    };
  });
  return { sourceId: `hive.${pack.id}`, namespace: pack.id, commands };
}

/** Create the local semantic runtime and install this pack's contribution. */
export function createGamePackWhistle(pack, submit) {
  const whistle = createWhistle();
  whistle.contribute(gamePackWhistleContribution(pack, submit));
  return whistle;
}
