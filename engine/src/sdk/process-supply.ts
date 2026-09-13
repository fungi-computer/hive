import { component, entity, query } from "./authoring";
import { planSiteSupplies, type SiteSupplyRequirement } from "./site-supplies";
import type { EntityId, ProcessRequirements, WriteContext } from "../contracts";

export const StagedProcess = component<{
  version: number; definition: string; definitionVersion: number; station: EntityId;
  stageIndex: number; progressSeconds: number; enteredTick: number;
  phase: "waiting" | "running" | "complete" | "blocked"; blockedReason: string;
}>("hive.staged-process", { version: 1, fields: {
  version: "number", definition: "string", definitionVersion: "number", station: "entity",
  stageIndex: "number", progressSeconds: "number", enteredTick: "number", phase: "string", blockedReason: "string",
} });

export const requestProcess = (definition: string, station: EntityId) => ({ kind: "request-process" as const, definition, station });
export const admitProcess = (process: EntityId, definition: string, station: EntityId) => ({ kind: "admit-process" as const, process, definition, station });

/** Projects missing process inputs into ordinary delivery obligations, then asks native custody to bind them. */
export function processSupplyPhase(ctx: WriteContext, sourceContainers: readonly EntityId[]): void {
  const facts = ctx.workMaterialFacts();
  const lots = facts.lots;
  const admitted = new Set(ctx.outcomes.filter(({ action, result }): action is Extract<typeof action, { kind: "admit-process" }> => action.kind === "admit-process" && result.accepted).map(({ action }) => action.process));
  for (const row of ctx.query(query(StagedProcess))) {
    const process = row.get(StagedProcess);
    if (process.phase !== "waiting" || admitted.has(row.id)) continue;
    if (!ctx.processRequirements) throw new Error("process supply requires native process requirements");
    const requirements: ProcessRequirements = ctx.processRequirements(process.definition, process.station);
    const supply: SiteSupplyRequirement[] = requirements.inputs.map(input => ({ destination: entity(`${process.station}:${input.port}`), material: input.material, quantity: input.quantity }));
    planSiteSupplies(ctx, { sourceContainers, batchQuantity: 1, requirements: supply });
    const ready = requirements.inputs.every(input => {
      const port = `${process.station}:${input.port}`;
      const matching = lots.filter(lot => lot.container === port && lot.kind === input.material && lot.quantity > 0);
      return input.policy === "whole-lot"
        ? matching.some(lot => lot.quantity === input.quantity)
        : matching.reduce((sum, lot) => sum + lot.quantity, 0) >= input.quantity;
    });
    if (ready) ctx.action(admitProcess(row.id, process.definition, process.station));
  }
}
