import type { PresentationCue } from "./presentation-cues";
import type { ReadContext, RenderFact } from "../contracts";
import {
  projectPresentation,
  type PresentationControl,
} from "../presentation";
import type { GameSession } from "./session";
import { deliveryPresentationFacts } from "./delivery-presentation";

/**
 * The bounded, committed view shared by browser and host readers.
 * Epoch and sequence are supplied by the caller because they belong to its
 * transport/revision stream, rather than to the game session.
 */
export interface SessionObservation {
  readonly time: number;
  readonly paused: boolean;
  readonly epoch: number;
  readonly sequence: number;
  readonly facts: readonly RenderFact[];
  readonly cues: readonly PresentationCue[];
  readonly presentationFacts: ReturnType<typeof projectPresentation>["facts"];
  readonly presentationControls: readonly PresentationControl[];
}

export function buildObservation(
  session: GameSession,
  metadata: Readonly<{ epoch: number; sequence: number }>,
): SessionObservation {
  if (
    !Number.isSafeInteger(metadata.epoch) ||
    metadata.epoch < 0 ||
    !Number.isSafeInteger(metadata.sequence) ||
    metadata.sequence < 0
  )
    throw new Error(
      "observation sequence metadata must be safe nonnegative integers",
    );
  if (!Number.isFinite(session.simulationTime) || session.simulationTime < 0)
    throw new Error("observation time must be finite and nonnegative");
  const context: Pick<ReadContext, "query"> = {
    query: (spec) => session.query(spec),
  };
  const projected = projectPresentation(session.pack, context);
  const deliveryFacts = deliveryPresentationFacts(context);
  if (projected.facts.length + deliveryFacts.length > 32)
    throw new Error("presentation fact limit exceeded");
  const presentationIds = new Set<string>();
  for (const fact of [...projected.facts, ...deliveryFacts]) {
    if (presentationIds.has(fact.id))
      throw new Error(`duplicate presentation fact ${fact.id}`);
    presentationIds.add(fact.id);
  }
  const facts = structuredClone(session.renderFacts(512));
  return Object.freeze({
    time: session.simulationTime,
    paused: session.isPaused,
    epoch: metadata.epoch,
    sequence: metadata.sequence,
    facts: Object.freeze(facts),
    cues: session.presentationCues(),
    presentationFacts: Object.freeze([
      ...projected.facts,
      ...deliveryFacts,
    ]),
    presentationControls: projected.controls,
  });
}
