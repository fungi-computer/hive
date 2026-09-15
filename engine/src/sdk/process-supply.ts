import { component } from "./authoring";
import type { EntityId } from "../contracts";

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
