import { toJSONSchema } from "zod";
import { WhistleActionError, createWhistle } from "@fungi.computer/whistle";
import { colonyPack } from "./colony";

const command = colonyPack.commands?.dig;
if (!command) throw new Error("Colony dig command is unavailable");
const digCommand = command;

export function colonyDigWhistleContribution(submit: (command: unknown) => Promise<unknown>, availability = () => ({ status: "available" as const })) {
  return {
    sourceId: "hive.colony", namespace: "colony",
    commands: [{
      id: "dig", title: "Dig area", category: "Colony",
      description: "Designate a same-level rectangle for excavation.",
      projections: { menu: { order: 20 }, palette: { order: 20 }, agent: { order: 20 } },
      action: { inputSchema: toJSONSchema(digCommand.input), presentation: { type: "custom" as const, data: { gesture: "terrain-rectangle", argument: "area" } } },
      availability,
      handler: async ({ arguments: input }: { arguments?: unknown }) => {
        try { return await submit({ type: "command", name: "dig", input }); }
        catch (error) { throw new WhistleActionError("command_rejected", error instanceof Error ? error.message : String(error)); }
      },
    }],
  };
}

export function colonyDigWhistleDescriptor() {
  const runtime = createWhistle();
  runtime.contribute(colonyDigWhistleContribution(async () => undefined) as any);
  const row = runtime.snapshot().agent.find(item => item.commandId === "colony:dig");
  if (!row) throw new Error("Colony Dig Whistle action unavailable");
  return row;
}
