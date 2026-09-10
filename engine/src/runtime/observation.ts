import type { RenderFact } from "../contracts";
import {
  projectPresentation,
  type PresentationControl,
} from "../presentation";
import type { GameSession } from "./session";

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
  const projected = projectPresentation(session.pack, {
    query: (spec) => session.query(spec),
  });
  const facts = structuredClone(session.renderFacts(512));
  return Object.freeze({
    time: session.simulationTime,
    paused: session.isPaused,
    epoch: metadata.epoch,
    sequence: metadata.sequence,
    facts: Object.freeze(facts),
    presentationFacts: projected.facts,
    presentationControls: projected.controls,
  });
}
