import type { ActionRequest } from "../contracts";

const id = (value: unknown): boolean =>
  typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
const coordinate = (value: unknown): boolean =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  Math.abs(value) <= 1_000_000;
const quantity = (value: unknown): boolean =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value > 0 &&
  value <= 0xffffffff;
const stream = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 64 && /^[A-Za-z0-9._:-]+$/.test(value);
const axis = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1;
const directSample = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const sample = value as Record<string, unknown>;
  return Object.keys(sample).length === 3 && typeof sample.sequence === "number" && Number.isSafeInteger(sample.sequence) &&
    sample.sequence > 0 && axis(sample.x) && axis(sample.z);
};

/** Structural admission only. Native custody, capacity and reach decide availability. */
export function checkedAction(value: unknown): ActionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid action");
  const action = value as Record<string, unknown>;
  let keys: string[];
  let valid = false;
  switch (action.kind) {
    case "plan-construction": {
      keys = ["kind", "catalog", "site", "x", "y", "z", "orientation", "contact"];
      const contact = action.contact as Record<string, unknown> | null;
      valid = id(action.catalog) && id(action.site)
        && [action.x, action.z].every(value => typeof value === "number" && Number.isSafeInteger(value))
        && typeof action.y === "number" && Number.isInteger(action.y) && action.y >= -2147483648 && action.y <= 2147483647
        && ["north", "east", "south", "west"].includes(action.orientation as string)
        && !!contact && typeof contact === "object" && !Array.isArray(contact)
        && Object.keys(contact).length === 4 && contact.frame === null
        && coordinate(contact.x) && coordinate(contact.y) && coordinate(contact.z);
      break;
    }
    case "set-structure-open":
      keys = ["kind", "worker", "site", "open"];
      valid = id(action.worker) && id(action.site) && typeof action.open === "boolean";
      break;
    case "attend-construction":
      keys = ["kind", "worker", "site"];
      valid = id(action.worker) && id(action.site);
      break;
    case "excavate":
      keys = ["kind", "entity", "x", "y", "z", "expected", "replacement"];
      valid = id(action.entity) && [action.x, action.y, action.z].every(value => coordinate(value) && Number.isInteger(value)) &&
        [action.expected, action.replacement].every(value => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535) &&
        action.expected !== action.replacement;
      break;
    case "cancel-work":
      keys = ["kind", "entity"];
      valid = id(action.entity);
      break;
    case "begin-direct":
      keys = ["kind", "entity", "stream"];
      valid = id(action.entity) && stream(action.stream);
      break;
    case "begin-emission":
      keys = ["kind", "worker", "station"];
      valid = id(action.worker) && id(action.station);
      break;
    case "direct-input": {
      keys = ["kind", "entity", "stream", "inputs"];
      const inputs = action.inputs;
      valid = id(action.entity) && stream(action.stream) && Array.isArray(inputs) && inputs.length >= 1 && inputs.length <= 50 &&
        inputs.every((input, index) => directSample(input) && (index === 0 || input.sequence === inputs[index - 1].sequence + 1));
      break;
    }
    case "launch":
    case "displace": {
      const launch = action.kind === "launch";
      keys = launch ? ["kind", "launcher", "ammunition", "velocity"] : ["kind", "entity", "delta"];
      const vector = action[launch ? "velocity" : "delta"] as Record<string, unknown> | null;
      valid = (launch ? id(action.launcher) && id(action.ammunition) : id(action.entity)) &&
        !!vector && typeof vector === "object" && !Array.isArray(vector) &&
        Object.keys(vector).length === 3 && coordinate(vector.x) && coordinate(vector.y) && coordinate(vector.z);
      break;
    }
    case "move": {
      keys = ["kind", "entity", "destination", "facing"];
      const at = action.destination as Record<string, unknown> | null;
      valid =
        id(action.entity) &&
        !!at &&
        typeof at === "object" &&
        Object.keys(at).length === 4 &&
        coordinate(at.x) &&
        coordinate(at.y) &&
        coordinate(at.z) &&
        (at.frame === null || id(at.frame)) &&
        (action.facing === undefined || coordinate(action.facing));
      break;
    }
    case "drop-lot":
      keys = ["kind", "entity", "lot"];
      valid = id(action.entity) && id(action.lot);
      break;
    case "transfer":
      keys = ["kind", "lot", "from", "to", "quantity"];
      valid =
        id(action.lot) &&
        id(action.from) &&
        id(action.to) &&
        quantity(action.quantity);
      break;
    case "consume":
      keys = ["kind", "entity", "lot", "quantity"];
      valid = id(action.entity) && id(action.lot) && quantity(action.quantity);
      break;
    default:
      throw new Error("unsupported action kind");
  }
  if (!valid || Object.keys(action).some((key) => !keys.includes(key)))
    throw new Error("invalid action fields");
  return structuredClone(action) as unknown as ActionRequest;
}
