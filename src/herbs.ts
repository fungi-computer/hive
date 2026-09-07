import type { HerbStage } from "./model.ts";

export const SOW_TICKS = 20;
export const HERB_GROWING_TICKS = 80;
export const HERB_READY_TICKS = 240;
export const HARVEST_TICKS = 20;

export function mugwortStage(elapsed: number): HerbStage {
  if (elapsed >= HERB_READY_TICKS) return "ready";
  if (elapsed >= HERB_GROWING_TICKS) return "growing";
  return "planted";
}
