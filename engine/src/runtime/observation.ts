import type { PresentationCue } from "./presentation-cues";
import type { ReadContext, RenderFact } from "../contracts";
import {
  projectPresentation,
} from "../presentation";
import type { WhistleContextualTarget } from "./whistle";
import type { WhistleAgentProjection } from "@fungi.computer/whistle";
import type { GameSession } from "./session";
import { decorateInventoryFacts } from "./inventory-presentation";
import { decorateWorkActivity } from "./work-activity";

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
  readonly whistleAgent: readonly WhistleAgentProjection[];
  readonly whistleTargets: readonly WhistleContextualTarget[];
  readonly whistleRevision: number;
  readonly terrainMarks: ReturnType<typeof projectPresentation>["terrainMarks"];
  readonly environmentVisuals: ReturnType<typeof projectPresentation>["environmentVisuals"];
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
  const context: Pick<ReadContext, "query" | "atmosphereSamples" | "environmentFacts" | "constructionReadiness"> = {
    environmentFacts: () => session.environmentFacts(),
    atmosphereSamples: cells => session.atmosphereSamples(cells),
    constructionReadiness: sites => session.constructionReadiness(sites),
    query: (spec) => session.query(spec),
  };
  const projected = projectPresentation(session.pack, context);
  const whistle = session.whistleObservation(context);
  const facts = decorateWorkActivity(decorateInventoryFacts(structuredClone(session.renderFacts(512)), context), context, session.pack.presentation?.activities?.(context));
  return Object.freeze({
    time: session.simulationTime,
    paused: session.isPaused,
    epoch: metadata.epoch,
    sequence: metadata.sequence,
    facts: Object.freeze(facts),
    terrain: session.terrainView(),
    cues: session.presentationCues(),
    presentationFacts: projected.facts,
    whistleAgent: whistle.agent,
    whistleTargets: whistle.targets,
    whistleRevision: whistle.revision,
    terrainMarks: projected.terrainMarks,
    environmentVisuals: projected.environmentVisuals,
  });
}
