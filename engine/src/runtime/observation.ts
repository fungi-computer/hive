import type { PresentationCue } from "./presentation-cues";
import type { QueryRow, QuerySpec, ReadContext, RenderFact } from "../contracts";
import {
  projectPresentation,
} from "../presentation";
import type { WhistleContextualTarget } from "./whistle";
import type { WhistleAgentProjection } from "@fungi.computer/whistle";
import type { GameSession } from "./session";
import { decorateInventoryFacts } from "./inventory-presentation";
import { decorateWorkActivity } from "./work-activity";
import { createObservationDependencies } from "./observation-dependencies";
import { MAX_RENDER_FACTS } from "./visual-projection";

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

/** Region-owned disposable projections; restart/restore reconstructs them. */
export function createObservationProjector() {
  // This owner is constructed once per host Region, which fixes its world and
  // host observation scope. Resident sessions are replaced after every
  // committed revision, so keying memo state by session lifetime discards the
  // dependency frontier on every publication. Pack identity selects the
  // definition set; the exact reads below decide whether projections survive.
  const packs = new WeakMap<object, {
    session: GameSession;
    sequence: number;
    presentation: ReturnType<typeof createObservationDependencies<ReturnType<typeof projectPresentation>>>;
    whistle: ReturnType<typeof createObservationDependencies<ReturnType<GameSession["whistleObservation"]>>>;
  }>();
  return (session: GameSession, metadata: Readonly<{ epoch: number; sequence: number }>) => {
    let projections = packs.get(session.pack);
    if (!projections || metadata.sequence < projections.sequence ||
        (session !== projections.session && metadata.sequence === projections.sequence)) {
      projections = {
        session,
        sequence: metadata.sequence,
        presentation: createObservationDependencies(),
        whistle: createObservationDependencies(),
      };
      packs.set(session.pack, projections);
    } else {
      projections.session = session;
      projections.sequence = metadata.sequence;
    }
    return buildObservation(session, metadata, {
      presentation: projections.presentation,
      whistle: projections.whistle,
    });
  };
}

export function buildObservation(
  session: GameSession,
  metadata: Readonly<{ epoch: number; sequence: number }>,
  projections?: {
    presentation: ReturnType<typeof createObservationDependencies<ReturnType<typeof projectPresentation>>>;
    whistle: ReturnType<typeof createObservationDependencies<ReturnType<GameSession["whistleObservation"]>>>;
  },
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
  const queryCache = new Map<string, readonly QueryRow[]>();
  const query = <T extends object>(spec: QuerySpec<T>): readonly QueryRow<T>[] => {
    const key = spec.components.map((component) => component.id).sort().join("\0");
    const cached = queryCache.get(key);
    if (cached) return cached;
    const rows = session.query(spec);
    queryCache.set(key, rows);
    return rows;
  };
  const context: Pick<ReadContext, "query" | "workAttempts" | "atmosphereSamples" | "environmentFacts" | "constructionReadiness"> = {
    environmentFacts: () => session.environmentFacts(),
    atmosphereSamples: cells => session.atmosphereSamples(cells),
    constructionReadiness: sites => session.constructionReadiness(sites),
    query,
    workAttempts: taskIds => session.workAttempts(taskIds),
  };
  const projected = projections ? projections.presentation(context, tracked => projectPresentation(session.pack, tracked)) : projectPresentation(session.pack, context);
  const whistle = projections ? projections.whistle(context, tracked => session.whistleObservation(tracked)) : session.whistleObservation(context);
  const facts = decorateWorkActivity(decorateInventoryFacts(structuredClone(session.renderFacts(MAX_RENDER_FACTS)), context), context, session.pack.presentation?.activities?.(context));
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
