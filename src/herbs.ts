import type { HerbStage, PositiveInt } from "./model.ts";

export const SOW_TICKS = 20;
const HERB_GROWING_TICKS = 80;
export const HERB_READY_TICKS = 240;
export const HARVEST_TICKS = 20;
export const MUGWORT_ESTABLISHMENT_WATER = 2 as PositiveInt;

export function mugwortNeedsWater(herb: {
  stage: HerbStage;
  establishment: unknown | null;
}): boolean {
  return herb.stage === "planted" && herb.establishment === null;
}

/** The plant owner records establishment only after the material owner sinks water. */
export function establishMugwort(
  herb: {
    stage: HerbStage;
    establishment: unknown | null;
  },
  tick: number,
  receipt: string,
): boolean {
  if (!mugwortNeedsWater(herb)) return false;
  herb.establishment = { kind: "water", at: tick, receipt };
  return true;
}

export function mugwortStage(elapsed: number): HerbStage {
  if (elapsed >= HERB_READY_TICKS) return "ready";
  if (elapsed >= HERB_GROWING_TICKS) return "growing";
  return "planted";
}
