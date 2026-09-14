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
const terrainContact = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const contact = value as Record<string, unknown>;
  return Object.keys(contact).length === 4 && contact.frame === null
    && coordinate(contact.x) && coordinate(contact.y) && coordinate(contact.z);
};

/** Structural admission only. Native custody, capacity and reach decide availability. */
export function checkedAction(value: unknown): ActionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid action");
  const action = value as Record<string, unknown>;
  let keys: string[];
  let valid = false;
  switch (action.kind) {
    case "establish-party":
      keys = ["kind", "bindingId", "player", "party", "records"];
      valid = id(action.bindingId) && id(action.player) && id(action.party) && Array.isArray(action.records) && action.records.length > 0 && action.records.length <= 32;
      break;
    case "begin-work-attempt":
      keys = ["kind", "task", "worker", "party", "operation"];
      valid = id(action.task) && id(action.worker) && id(action.party) && !!action.operation && typeof action.operation === "object" && !Array.isArray(action.operation) && (action.operation as Record<string, unknown>).kind === "route" && Object.keys(action.operation as object).length === 2 && !!(action.operation as Record<string, unknown>).destination;
      break;
    case "retarget-work-attempt": {
      keys = ["kind", "task", "generation", "sequence", "destination"];
      const destination = action.destination as Record<string, unknown> | null;
      valid = id(action.task) && typeof action.generation === "number" && Number.isSafeInteger(action.generation) && action.generation > 0 && typeof action.sequence === "number" && Number.isSafeInteger(action.sequence) && action.sequence > 0 && !!destination && !Array.isArray(destination) && Object.keys(destination).length === 4 && terrainContact(destination);
      break;
    }
    case "interrupt-work-attempt":
      keys = ["kind", "task", "generation", "sequence", "cause"];
      valid = id(action.task) && typeof action.generation === "number" && Number.isSafeInteger(action.generation) && action.generation > 0 && typeof action.sequence === "number" && Number.isSafeInteger(action.sequence) && action.sequence > 0 && ["drafted", "cancelled", "workerUnavailable", "accessLost"].includes(action.cause as string);
      break;
    case "acknowledge-work-attempt":
      keys = ["kind", "task", "generation", "sequence"];
      valid = id(action.task) && typeof action.generation === "number" && Number.isSafeInteger(action.generation) && action.generation > 0 && typeof action.sequence === "number" && Number.isSafeInteger(action.sequence) && action.sequence > 0;
      break;
    case "continue-work-attempt": {
      keys = ["kind", "task", "generation", "sequence", "nextActivity"];
      const next = action.nextActivity as Record<string, unknown> | undefined;
      valid = id(action.task) && typeof action.generation === "number" && Number.isSafeInteger(action.generation) && action.generation > 0 && typeof action.sequence === "number" && Number.isSafeInteger(action.sequence) && action.sequence > 0 && !!next && Object.keys(next).length === 4 && next.kind === "construction" && id(next.site) && (next.mode === "bind" || next.mode === "work") && terrainContact(next.contact);
      break;
    }
    case "establish-resource-site":
      keys = ["kind", "operation", "worker", "site", "definition", "x", "y", "z"];
      valid = id(action.operation) && id(action.worker) && id(action.site) && id(action.definition) && [action.x, action.y, action.z].every(value => Number.isSafeInteger(value));
      break;
    case "tend-resource-site":
      keys = ["kind", "operation", "worker", "site", "vessel"];
      valid = id(action.operation) && id(action.worker) && id(action.site) && id(action.vessel);
      break;
    case "request-process":
      keys = ["kind", "definition", "station"];
      valid = id(action.definition) && id(action.station);
      break;
    case "attend-process":
      keys = ["kind", "worker", "process"];
      valid = id(action.worker) && id(action.process);
      break;
    case "admit-process":
      keys = ["kind", "process", "definition", "station"];
      valid = id(action.process) && id(action.definition) && id(action.station);
      break;
    case "designate-stockpile": {
      keys = ["kind", "zone", "cells"];
      const cells = action.cells;
      valid = id(action.zone) && Array.isArray(cells) && cells.length > 0 && cells.length <= 256 && cells.every(cell => {
        if (!cell || typeof cell !== "object" || Array.isArray(cell)) return false;
        const value = cell as Record<string, unknown>;
        return Object.keys(value).length === 6 && [value.x, value.y, value.z].every(item => typeof item === "number" && Number.isSafeInteger(item)) && quantity(value.priority) && quantity(value.capacity) && stream(value.filterProfile);
      });
      break;
    }
    case "update-stockpile":
      keys = ["kind", "zone", "filterProfile", "priority"];
      valid = id(action.zone) && stream(action.filterProfile) && quantity(action.priority);
      break;
    case "plan-construction": {
      keys = ["kind", "catalog", "site", "party", "x", "y", "z", "orientation"];
      valid = id(action.catalog) && id(action.site) && id(action.party)
        && [action.x, action.z].every(value => typeof value === "number" && Number.isSafeInteger(value))
        && typeof action.y === "number" && Number.isInteger(action.y) && action.y >= -2147483648 && action.y <= 2147483647
        && ["north", "east", "south", "west"].includes(action.orientation as string);
      break;
    }
    case "replace-floor":
      keys = ["kind", "orderId", "existingFloorId", "desiredCatalog"];
      valid = id(action.orderId) && id(action.existingFloorId) && id(action.desiredCatalog);
      break;
    case "bind-construction-stage":
      keys = ["kind", "site", "contact"];
      valid = id(action.site) && terrainContact(action.contact);
      break;
    case "set-structure-open":
      keys = ["kind", "worker", "site", "open"];
      valid = id(action.worker) && id(action.site) && typeof action.open === "boolean";
      break;
    case "deconstruct":
      keys = ["kind", "worker", "site"];
      valid = id(action.worker) && id(action.site);
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
    case "exchange-field-water":
      keys = ["kind", "operation", "worker", "vessel", "x", "y", "z", "direction", "portions"];
      valid = id(action.operation) && id(action.worker) && id(action.vessel) &&
        [action.x, action.y, action.z].every(value => typeof value === "number" && Number.isSafeInteger(value)) &&
        (action.direction === "withdraw" || action.direction === "deposit") &&
        typeof action.portions === "number" && Number.isInteger(action.portions) && action.portions >= 1 && action.portions <= 7;
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
    case "extract-resource":
      keys = ["kind", "operation", "worker", "source"];
      valid = id(action.operation) && id(action.worker) && id(action.source);
      break;
    default:
      throw new Error("unsupported action kind");
  }
  if (!valid || Object.keys(action).some((key) => !keys.includes(key)))
    throw new Error("invalid action fields");
  return structuredClone(action) as unknown as ActionRequest;
}
