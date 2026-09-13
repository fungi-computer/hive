import { toJSONSchema } from "zod";
import { WhistleActionError, createWhistle } from "@fungi.computer/whistle";
import type {
  WhistleAgentProjection,
  WhistleAvailability,
  WhistleContribution,
  WhistleJsonObject,
  WhistleJsonValue,
} from "@fungi.computer/whistle";
import { colonyPack } from "./colony";
import type { RuntimeCommandReceipt } from "../runtime/browser-client";

const command = colonyPack.commands?.dig;
if (!command) throw new Error("Colony dig command is unavailable");
const digCommand = command;

function checkedJsonValue(value: unknown): WhistleJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(checkedJsonValue);
  if (value && typeof value === "object") {
    const result: Record<string, WhistleJsonValue> = {};
    for (const [key, child] of Object.entries(value)) result[key] = checkedJsonValue(child);
    return result;
  }
  throw new Error("Dig schema must be finite JSON data");
}

function checkedJsonObject(value: unknown): WhistleJsonObject {
  const result = checkedJsonValue(value);
  const object = (candidate: WhistleJsonValue): candidate is WhistleJsonObject =>
    candidate !== null && typeof candidate === "object" && !Array.isArray(candidate);
  if (!object(result))
    throw new Error("Dig schema must be a JSON object");
  return result;
}

type SubmitGameCommand = (command: {
  readonly type: "command";
  readonly name: "dig";
  readonly input?: unknown;
}) => Promise<RuntimeCommandReceipt>;

export function colonyDigWhistleContribution(
  submit: SubmitGameCommand,
  availability: () => WhistleAvailability = () => ({ status: "available" }),
): WhistleContribution {
  return {
    sourceId: "hive.colony", namespace: "colony",
    commands: [{
      id: "dig", title: "Dig area", category: "Colony",
      description: "Designate a same-level rectangle for excavation.",
      projections: { menu: { order: 20 }, palette: { order: 20 }, agent: { order: 20 } },
      action: { inputSchema: checkedJsonObject(toJSONSchema(digCommand.input)), presentation: { type: "custom" as const, data: { gesture: "terrain-rectangle", argument: "area" } } },
      availability,
      handler: async ({ arguments: input }: { arguments?: unknown }) => {
        try {
          const receipt = await submit({ type: "command", name: "dig", input });
          if (receipt.status === "rejected")
            throw new WhistleActionError("command_rejected", receipt.reason);
          return receipt;
        } catch (error) {
          if (error instanceof WhistleActionError) throw error;
          throw new WhistleActionError("transport_failure", error instanceof Error ? error.message : String(error));
        }
      },
    }],
  };
}

export function colonyDigWhistleDescriptor(): WhistleAgentProjection {
  const runtime = createWhistle();
  runtime.contribute(colonyDigWhistleContribution(async () => ({ status: "applied", result: { results: [] } })));
  const row = runtime.snapshot().agent.find(item => item.commandId === "colony:dig");
  if (!row) throw new Error("Colony Dig Whistle action unavailable");
  return row;
}
