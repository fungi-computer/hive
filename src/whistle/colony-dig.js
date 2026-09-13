import { toJSONSchema } from "zod";
import { WhistleActionError } from "@fungi.computer/whistle";
import { colonyPack } from "../../engine/src/games/colony.ts";

const digCommand = colonyPack.commands?.dig;
if (!digCommand) throw new Error("Colony dig command is unavailable");

/** The durable command result is admission, not completion of physical work. */
const digOutputSchema = {
  type: "object",
  properties: { accepted: { const: true, title: "Accepted" } },
  required: ["accepted"],
  additionalProperties: false,
};

/**
 * Contribute Colony's durable Dig command to Whistle.
 *
 * The command definition remains the sole input validation owner. The
 * contribution only supplies semantic identity, projections and the local
 * gesture binding used by a human client.
 */
export function colonyDigWhistleContribution(submit, availability = () => ({ status: "available" })) {
  if (typeof submit !== "function") throw new TypeError("dig submitter is required");
  if (typeof availability !== "function") throw new TypeError("dig availability reader is required");
  const readAvailability = () => {
    const value = availability();
    if (!value || value.status === "available") return { status: "available" };
    if (value.status === "unavailable" && typeof value.reason === "string" && value.reason.length > 0)
      return { status: "unavailable", reason: value.reason };
    throw new TypeError("invalid dig availability");
  };
  return {
    sourceId: "hive.colony",
    namespace: "colony",
    commands: [{
      id: "dig",
      title: "Dig area",
      category: "Colony",
      description: "Designate a same-level rectangle for excavation.",
      projections: { menu: { order: 20 }, palette: { order: 20 }, agent: { order: 20 } },
      action: {
        inputSchema: toJSONSchema(digCommand.input),
        outputSchema: digOutputSchema,
        presentation: { type: "custom", data: { gesture: "terrain-rectangle", argument: "area" } },
      },
      availability: readAvailability,
      handler: ({ arguments: input }) => {
        try {
          submit({ type: "command", name: "dig", input });
          return { accepted: true };
        } catch (error) {
          throw new WhistleActionError(
            "command_rejected",
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    }],
  };
}
