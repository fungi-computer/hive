import type { ActionRequest } from "../contracts";

const id = (value: unknown): boolean => typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
const coordinate = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000;
const quantity = (value: unknown): boolean => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 0xffffffff;

/** Structural admission only. Native custody, capacity and reach decide availability. */
export function checkedAction(value: unknown): ActionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid action");
  const action = value as Record<string, unknown>;
  let keys: string[];
  let valid = false;
  switch (action.kind) {
    case "move": {
      keys = ["kind", "entity", "destination", "facing"];
      const at = action.destination as Record<string, unknown> | null;
      valid = id(action.entity) && !!at && typeof at === "object" && Object.keys(at).length === 3 && coordinate(at.x) && coordinate(at.y) && coordinate(at.z) && (action.facing === undefined || coordinate(action.facing));
      break;
    }
    case "transfer":
      keys = ["kind", "lot", "from", "to", "quantity"];
      valid = id(action.lot) && id(action.from) && id(action.to) && quantity(action.quantity);
      break;
    case "consume":
      keys = ["kind", "entity", "lot", "quantity"];
      valid = id(action.entity) && id(action.lot) && quantity(action.quantity);
      break;
    default: throw new Error("unsupported action kind");
  }
  if (!valid || Object.keys(action).some(key => !keys.includes(key))) throw new Error("invalid action fields");
  return structuredClone(action) as unknown as ActionRequest;
}
