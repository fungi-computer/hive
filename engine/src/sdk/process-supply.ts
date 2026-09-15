import { component, entity, query } from "./authoring";
import { planSiteSupplies, type SiteSupplyRequirement } from "./site-supplies";
import { OwnedByParty } from "./party";
import { PartyMember } from "./party";
import type {
  EntityId,
  ProcessRequirements,
  QueryRow,
  WriteContext,
} from "../contracts";

export const StagedProcess = component<{
  version: number; definition: string; definitionVersion: number; station: EntityId;
  stageIndex: number; progressSeconds: number; enteredTick: number;
  phase: "waiting" | "working" | "complete" | "blocked"; blockedReason: string;
}>("hive.staged-process", { version: 1, fields: {
  version: "number", definition: "string", definitionVersion: "number", station: "entity",
  stageIndex: "number", progressSeconds: "number", enteredTick: "number", phase: "string", blockedReason: "string",
} });

/** Native durable field-water acquisition intent. Once its lot is withdrawn,
 * the native owner replaces this record with SupplyAllocation. */
export const FieldWaterWork = component<{
  process: EntityId; role: string; generation: number; party: EntityId;
  destination: EntityId; vessel: EntityId | null; cellX: number; cellY: number;
  cellZ: number; lot: EntityId | null;
}>("hive.field-water-work", { version: 1, fields: {
  process: "entity", role: "string", generation: "number", party: "entity",
  destination: "entity", vessel: "nullable-entity", cellX: "number",
  cellY: "number", cellZ: "number", lot: "nullable-entity",
} });


export const requestProcess = (definition: string, station: EntityId) => ({ kind: "request-process" as const, definition, station });
export const admitProcess = (process: EntityId, definition: string, station: EntityId) => ({ kind: "admit-process" as const, process, definition, station });
type ProcessRow = QueryRow<{ version: number; definition: string; definitionVersion: number; station: EntityId; stageIndex: number; progressSeconds: number; enteredTick: number; phase: "waiting" | "working" | "complete" | "blocked"; blockedReason: string }>;

/** Projects missing process inputs into ordinary delivery obligations, then asks native custody to bind them. */
export function processSupplyPhase(ctx: WriteContext): void {
  const facts = ctx.workMaterialFacts();
  const lots = facts.lots;
  const admitted = new Set(ctx.outcomes.flatMap(({ action, result }) => action.kind === "admit-process" && result.accepted ? [action.process] : []));
  const partyByEntity = new Map(ctx.query(query(OwnedByParty)).map(row => [row.id, row.get(OwnedByParty).party]));
  const waiting: { row: ProcessRow; process: { definition: string; station: EntityId }; requirements: ProcessRequirements; party: EntityId | null }[] = [];
  const rows = ctx.query(query(StagedProcess)).slice().sort((a, b) => a.id.localeCompare(b.id));
  const start = rows.length ? (ctx.clock.tick * 4) % rows.length : 0;
  const window = Array.from({ length: Math.min(4, rows.length) }, (_, offset) => rows[(start + offset) % rows.length]!);
  for (const row of window) {
    const process = row.get(StagedProcess);
    if (process.phase !== "waiting" || admitted.has(row.id)) continue;
    const requirements: ProcessRequirements = ctx.processRequirements(process.definition, process.station);
    // Collected below and planned once: planSiteSupplies' reservation view is
    // per call, so separate calls could promise one source lot twice.
    waiting.push({ row, process, requirements, party: partyByEntity.get(process.station) ?? null });
  }
  const destinations = new Set(
    waiting.flatMap(({ process, requirements }) =>
      requirements.inputs.map((input) =>
        entity(`${process.station}:${input.port}`),
      ),
    ),
  );
  const actors = new Set(ctx.query(query(PartyMember)).map((row) => row.id));
  const eligibleSources = facts.containers
    .filter(
      (container) =>
        !container.sealed &&
        !destinations.has(container.id) &&
        !actors.has(container.id),
    )
    .map((container) => container.id)
    .sort((a, b) => a.localeCompare(b));
  const grouped = new Map<string, typeof waiting>();
  for (const item of waiting) { const key = item.party ?? "__host__"; grouped.set(key, [...(grouped.get(key) ?? []), item]); }
  for (const [party, group] of grouped) {
    const sourceIds = eligibleSources.filter(source => (party === "__host__" ? !partyByEntity.has(source) : partyByEntity.get(source) === party)).slice(0, 64);
    const supply: SiteSupplyRequirement[] = group.flatMap(({ process, requirements }) => requirements.inputs.map(input => ({ destination: entity(`${process.station}:${input.port}`), material: input.material, quantity: input.quantity })));
    if (supply.length && sourceIds.length) planSiteSupplies(ctx, { sourceContainers: sourceIds, batchQuantity: 1, requirements: supply });
  }
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
