import type { GamePack, ReadContext } from "./contracts";
import { z } from "zod";

const presentationSubjectsSchema = z.array(z.string().min(1).max(128))
  .min(1).max(128)
  .refine((subjects) => new Set(subjects).size === subjects.length, "subjects must be unique");

export const presentationFactSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(128),
  value: z.union([z.string().max(512), z.number().finite(), z.boolean()]),
  subjects: presentationSubjectsSchema.optional(),
}).strict();

export interface PresentationFact {
  readonly id: string;
  readonly label: string;
  readonly value: string | number | boolean;
  readonly subjects?: readonly string[];
}
export interface EnvironmentVisual {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly kind: "smoke" | "fire";
  readonly intensity: number;
}
export type TerrainMark = {
  readonly id: string;
  readonly cell: readonly [number, number, number];
  readonly status: "queued" | "working" | "blocked";
  readonly kind?: "work" | "stockpile";
  readonly subjects?: readonly string[];
};
export interface GamePresentation {
  readonly activities?: (context: Pick<ReadContext, "query">) => readonly import("./contracts").ActivityBinding[];
  readonly visuals?: (context: Pick<ReadContext, "query" | "environmentFacts">) => readonly import("./runtime/visual-projection").EntityVisualProjection[];
  readonly feedback?: boolean;
  readonly inspect: (
    context: Pick<ReadContext, "query" | "atmosphereSamples" | "constructionReadiness">,
  ) => readonly PresentationFact[];
  readonly terrainMarks?: (
    context: Pick<ReadContext, "query" | "atmosphereSamples">,
  ) => readonly TerrainMark[];
  readonly environmentVisuals?: (
    context: Pick<ReadContext, "query" | "atmosphereSamples" | "environmentFacts">,
  ) => readonly EnvironmentVisual[];
}

/** Pure, bounded projection of display facts and physical marks. Commands use Whistle. */
export function projectPresentation(
  pack: GamePack,
  context: Pick<ReadContext, "query" | "atmosphereSamples" | "environmentFacts" | "constructionReadiness">,
): {
  readonly facts: readonly PresentationFact[];
  readonly terrainMarks: readonly TerrainMark[];
  readonly environmentVisuals: readonly EnvironmentVisual[];
} {
  const presentation = pack.presentation;
  if (!presentation) return { facts: [], terrainMarks: [], environmentVisuals: [] };
  const ids = new Set<string>();
  const inspected = presentation.inspect(context);
  if (inspected.length > 32) throw new Error("presentation fact limit exceeded");
  const facts = inspected.map((raw) => {
    const fact = presentationFactSchema.parse(raw);
    if (ids.has(fact.id)) throw new Error(`duplicate presentation fact id ${fact.id}`);
    ids.add(fact.id);
    return Object.freeze(fact);
  });
  const markIds = new Set<string>();
  const terrainMarks = (presentation.terrainMarks?.(context) ?? []).map((mark) => {
    if (!mark || typeof mark.id !== "string" || mark.id.length === 0 || mark.id.length > 128 || markIds.has(mark.id) ||
        !Array.isArray(mark.cell) || mark.cell.length !== 3 || !mark.cell.every(Number.isSafeInteger) ||
        !["queued", "working", "blocked"].includes(mark.status) ||
        (mark.kind !== undefined && mark.kind !== "work" && mark.kind !== "stockpile"))
      throw new Error("invalid terrain presentation mark");
    if (mark.subjects !== undefined) presentationSubjectsSchema.parse(mark.subjects);
    markIds.add(mark.id);
    return Object.freeze({ id: mark.id, cell: [mark.cell[0], mark.cell[1], mark.cell[2]] as [number, number, number], status: mark.status,
      ...(mark.kind === undefined ? {} : { kind: mark.kind }), ...(mark.subjects === undefined ? {} : { subjects: mark.subjects }) });
  });
  if (terrainMarks.length > 256) throw new Error("terrain presentation mark limit exceeded");
  const environmentVisuals = (presentation.environmentVisuals?.(context) ?? []).map((visual) => {
    if (!visual || typeof visual.id !== "string" || visual.id.length === 0 || visual.id.length > 128 ||
        !visual.position || typeof visual.position !== "object" || Array.isArray(visual.position) ||
        !Number.isFinite(visual.position.x) || !Number.isFinite(visual.position.y) || !Number.isFinite(visual.position.z) ||
        (visual.kind !== "smoke" && visual.kind !== "fire") || !Number.isFinite(visual.intensity) || visual.intensity < 0 || visual.intensity > 1)
      throw new Error("invalid environment presentation visual");
    return Object.freeze({ id: visual.id, position: { x: visual.position.x, y: visual.position.y, z: visual.position.z }, kind: visual.kind, intensity: visual.intensity });
  });
  if (environmentVisuals.length > 64) throw new Error("environment visual limit exceeded");
  const visualIds = new Set<string>();
  for (const visual of environmentVisuals) {
    if (visualIds.has(visual.id)) throw new Error("duplicate environment visual id");
    visualIds.add(visual.id);
  }
  return Object.freeze({
    facts: Object.freeze(structuredClone(facts)),
    terrainMarks: Object.freeze(structuredClone(terrainMarks)),
    environmentVisuals: Object.freeze(structuredClone(environmentVisuals)),
  });
}
