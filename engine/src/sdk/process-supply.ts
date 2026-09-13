import { component, entity, query } from "./authoring";
import { planSiteSupplies, type SiteSupplyRequirement } from "./site-supplies";
import type { EntityId, ProcessRequirements, QueryRow, WriteContext } from "../contracts";

export const StagedProcess = component<{
  version: number; definition: string; definitionVersion: number; station: EntityId; worker: EntityId | null;
  stageIndex: number; progressSeconds: number; enteredTick: number;
  phase: "waiting" | "working" | "complete" | "blocked"; blockedReason: string;
}>("hive.staged-process", { version: 2, fields: {
  version: "number", definition: "string", definitionVersion: "number", station: "entity", worker: "nullable-entity",
  stageIndex: "number", progressSeconds: "number", enteredTick: "number", phase: "string", blockedReason: "string",
} });

export const requestProcess = (definition: string, station: EntityId) => ({ kind: "request-process" as const, definition, station });
export const admitProcess = (process: EntityId, definition: string, station: EntityId) => ({ kind: "admit-process" as const, process, definition, station });
export const attendProcess = (worker: EntityId, process: EntityId) => ({ kind: "attend-process" as const, worker, process });
type ProcessRow = QueryRow<{ version: number; definition: string; definitionVersion: number; station: EntityId; stageIndex: number; progressSeconds: number; enteredTick: number; phase: "waiting" | "working" | "complete" | "blocked"; blockedReason: string }>;

/** Projects missing process inputs into ordinary delivery obligations, then asks native custody to bind them. */
export function processSupplyPhase(ctx: WriteContext): void {
  const facts = ctx.workMaterialFacts();
  const lots = facts.lots;
  const admitted = new Set(ctx.outcomes.flatMap(({ action, result }) => action.kind === "admit-process" && result.accepted ? [action.process] : []));
  const waiting: { row: ProcessRow; process: { definition: string; station: EntityId }; requirements: ProcessRequirements }[] = [];
  const rows = ctx.query(query(StagedProcess)).slice().sort((a, b) => a.id.localeCompare(b.id));
  const start = rows.length ? (ctx.clock.tick * 4) % rows.length : 0;
  const window = Array.from({ length: Math.min(4, rows.length) }, (_, offset) => rows[(start + offset) % rows.length]!);
  for (const row of window) {
    const process = row.get(StagedProcess);
    if (process.phase !== "waiting" || admitted.has(row.id)) continue;
    const requirements: ProcessRequirements = ctx.processRequirements(process.definition, process.station);
    // Collected below and planned once: planSiteSupplies' reservation view is
    // per call, so separate calls could promise one source lot twice.
    waiting.push({ row, process, requirements });
  }
  const destinations = new Set(waiting.flatMap(({ process, requirements }) => requirements.inputs.map(input => entity(`${process.station}:${input.port}`))));
  const eligibleSources = facts.containers.filter(container => !container.sealed && !destinations.has(container.id)).map(container => container.id).sort((a, b) => a.localeCompare(b));
  const sourceStart = eligibleSources.length ? (Math.floor(ctx.clock.tick / 4) * 64) % eligibleSources.length : 0;
  const sourceIds = Array.from({ length: Math.min(64, eligibleSources.length) }, (_, offset) => eligibleSources[(sourceStart + offset) % eligibleSources.length]!);
  const supply: SiteSupplyRequirement[] = waiting.flatMap(({ process, requirements }) => requirements.inputs.map(input => ({ destination: entity(`${process.station}:${input.port}`), material: input.material, quantity: input.quantity })));
  if (supply.length) planSiteSupplies(ctx, { sourceContainers: sourceIds, batchQuantity: 1, requirements: supply });
  for (const { row, process, requirements } of waiting) {
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
