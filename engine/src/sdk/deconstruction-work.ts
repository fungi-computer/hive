import { component } from "./authoring";

/** Native-owned teardown intent projected for game UI and save inspection. */
export const DeconstructionOrder = component<{
  site: string;
  contactX: number;
  contactY: number;
  contactZ: number;
  salvageQuantity: number;
  workSeconds: number;
  status: "queued" | "blocked" | "complete";
  reason: string;
  retryKey: string;
}>("hive.deconstruction-order", {
  version: 4,
  fields: {
    site: "string",
    contactX: "number",
    contactY: "number",
    contactZ: "number",
    salvageQuantity: "number",
    workSeconds: "number",
    status: "string",
    reason: "string",
    retryKey: "string",
  },
});
