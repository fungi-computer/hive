import { component } from "./authoring";

export type ResourceOrderStatus = "queued" | "blocked" | "complete";

/** Engine-owned durable intent for one tended resource lifecycle. */
export const ResourceOrder = component<{
  definition: string;
  cellX: number;
  cellY: number;
  cellZ: number;
  status: ResourceOrderStatus;
  progressSeconds: number;
  reason: string;
}>("hive.resource-order", { version: 1, fields: {
  definition: "string",
  cellX: "number",
  cellY: "number",
  cellZ: "number",
  status: "string",
  progressSeconds: "number",
  reason: "string",
} });
