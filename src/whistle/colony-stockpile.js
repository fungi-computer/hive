import { toJSONSchema } from "zod";
import { colonyStockpileCommand } from "../../engine/src/games/colony-stockpile-command.ts";

/** Contribute Colony's durable command once; Whistle owns semantic discovery. */
export function colonyStockpileWhistleContribution(submit) {
  if (typeof submit !== "function") throw new TypeError("stockpile submitter is required");
  return {
    sourceId: "hive.colony",
    namespace: "colony",
    commands: [{
      id: "designate-stockpile",
      title: "Designate stockpile",
      category: "Colony",
      description: "Choose a floor rectangle and its material policy.",
      projections: { menu: { order: 40 }, palette: { order: 40 }, agent: { order: 40 } },
      action: {
        inputSchema: toJSONSchema(colonyStockpileCommand.input),
        presentation: { type: "custom", data: { gesture: "terrain-rectangle", argument: "area" } },
      },
      handler: ({ arguments: input }) => submit({ type: "command", name: "designateStockpile", input }),
    }],
  };
}

