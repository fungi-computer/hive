import type { EntityId } from "../contracts";
import { GameSession } from "../runtime/session";
import { colonyFrameworkProofV2Schedule as schedule } from "./colony-performance-config";

/** Fixed command ledger for v2. Call once before each numbered physical step. */
export function driveColonyFrameworkProofV2(session: Pick<GameSession, "command" | "terrainSurfaces">, step: number): string[] {
  const issued: string[] = [];
  if (step === 2) {
    for (const column of [[-70, -88], [-70, 88], [106, -88], [106, 88]] as [number, number][]) {
      const surface = session.terrainSurfaces([column])[0];
      if (!surface) throw new Error("framework v2 storage surface is absent");
      session.command("designateStockpile", { area: { start: surface.cell, end: surface.cell }, filterProfile: "wood", priority: 50 });
    }
    issued.push("designate four finite-capacity storage destinations");
  }
  // One authored command per occurrence: each references native jobs created
  // in that same occurrence. Four pending commands would cross Session's
  // current per-command future-reference validation boundary.
  const cohort = schedule.cohortReleaseSteps.findIndex(release => step >= release && step < release + 4);
  if (cohort > 0) {
    const first = (step - schedule.cohortReleaseSteps[cohort]) * 32;
    session.command("designateTrees", { entities: Array.from({ length: 32 }, (_, index) =>
      `colony.tree.framework-v2.${cohort}.${first + index}` as EntityId) });
    issued.push(`designate finite cohort ${cohort}: trees ${first}..${first + 31}`);
  }
  if (step === schedule.excavationStep) {
    const surface = session.terrainSurfaces([[-95, -94]])[0];
    if (!surface) throw new Error("framework v2 excavation surface is absent");
    session.command("dig", { area: { start: surface.cell, end: surface.cell } });
    issued.push(`excavate ${surface.cell.join(",")}`);
  }
  if (step === schedule.waterRequestStep) {
    for (let index = 0; index < 4; index++) session.command("requestWater", {});
    issued.push("request four finite water portions");
  }
  return issued;
}
