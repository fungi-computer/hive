import type { PresentationCue } from "./presentation-cues";
import type { ReadContext, RenderFact } from "../contracts";
import {
  projectPresentation,
  type PresentationControl,
} from "../presentation";
import type { GameSession } from "./session";
import { decorateInventoryFacts } from "./inventory-presentation";

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
  readonly terrain: ReturnType<GameSession["terrainView"]>;
  readonly cues: readonly PresentationCue[];
  readonly presentationFacts: ReturnType<typeof projectPresentation>["facts"];
  readonly presentationControls: readonly PresentationControl[];
  readonly terrainMarks: ReturnType<typeof projectPresentation>["terrainMarks"];
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
  const facts = decorateInventoryFacts(structuredClone(session.renderFacts(512)), context);
  return Object.freeze({
    time: session.simulationTime,
    paused: session.isPaused,
    epoch: metadata.epoch,
    sequence: metadata.sequence,
    facts: Object.freeze(facts),
    terrain: session.terrainView(),
    cues: session.presentationCues(),
    presentationFacts: projected.facts,
    presentationControls: projected.controls,
    terrainMarks: projected.terrainMarks,
  });
}
