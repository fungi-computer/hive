import { Mycelium, type MyceliumJsonValue } from "@fungi.computer/mycelium";
import { z } from "zod";
import type { RegionReceipt } from "../region/index.ts";

const identity = z.string().min(1).max(160);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Platform integration, not physical simulation. The trusted host binds one
 * authenticated principal and region before registering this module. The guest
 * cannot select either. Region dispatch remains the command/result authority.
 */
export function createRegionControllerModule<
  Command extends MyceliumJsonValue,
  Observation extends MyceliumJsonValue,
>(options: {
  id: string;
  name: string;
  principal: string;
  command: z.ZodType<Command>;
  observation: z.ZodType<Observation>;
  /** Consumer-owned receipt result schema, also bounding discoverable output. */
  result: z.ZodType<MyceliumJsonValue>;
  /** Consumer-owned knowledge projection; no raw state/events default exists. */
  observe(principal: string): Observation;
  dispatch(
    principal: string,
    input: {
      id: string;
      expectedRevision: number;
      command: Command;
    },
  ): RegionReceipt;
}) {
  const principal = identity.parse(options.principal);
  const observe = options.observe;
  const dispatch = options.dispatch;
  const receiptSchema: z.ZodType<RegionReceipt> = z.strictObject({
    region: identity,
    principal: identity,
    commandId: identity,
    status: z.enum(["applied", "rejected"]),
    revision,
    result: options.result,
  });

  return Mycelium.module({
    id: options.id,
    name: options.name,
    description:
      "Observe this authorized region and submit durable commands. A command result records admission/effect according to this region's rules; it is not a promise that a pawn job has completed. Retry a lost response with the SAME command id, expectedRevision and command. Each execute program has a separate transient identity.",
    operations: {
      observe: Mycelium.operation({
        description:
          "Read the consumer's explicit authorized observation. Hidden state, administrative data and raw event history are not exposed.",
        input: z.strictObject({}),
        output: options.observation,
        execute: async (_input, context) => {
          context.signal.throwIfAborted();
          return observe(principal);
        },
      }),
      command: Mycelium.operation({
        description:
          "Submit one command. Keep this id and complete input for retry: identical replay returns the original durable receipt; changed input with that id conflicts. Cancellation or a lost execute response cannot undo a committed command.",
        input: z.strictObject({
          id: identity,
          expectedRevision: revision,
          command: options.command,
        }),
        output: receiptSchema,
        execute: async (input, context) => {
          // No await between cancellation admission and the synchronous owner.
          context.signal.throwIfAborted();
          return dispatch(principal, input);
        },
      }),
    },
  });
}
