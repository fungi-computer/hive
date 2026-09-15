import type { ActionRequest, JobPlan, JobOperation, JobEntityBinding, JobContinuation } from "../contracts";

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
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const cell = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 3 && value.every(item => typeof item === "number" && Number.isSafeInteger(item));
const constructionCell = (value: unknown): boolean => record(value) && exactKeys(value, ["x", "y", "z"])
  && typeof value.x === "number" && Number.isSafeInteger(value.x)
  && typeof value.y === "number" && Number.isInteger(value.y) && value.y >= -2147483648 && value.y <= 2147483647
  && typeof value.z === "number" && Number.isSafeInteger(value.z);
const constructionTarget = (value: unknown): boolean => {
  if (!record(value)) return false;
  if (value.kind === "cell")
    return exactKeys(value, ["kind", "cell", "orientation"]) && constructionCell(value.cell)
      && (value.orientation === "north" || value.orientation === "east"
        || value.orientation === "south" || value.orientation === "west");
  if (value.kind === "edge") {
    if (!exactKeys(value, ["kind", "edge"]) || !record(value.edge) || !exactKeys(value.edge, ["cell", "axis"]) || !record(value.edge.cell)) return false;
    return constructionCell(value.edge.cell)
      && (value.edge.axis === "x" || value.edge.axis === "z");
  }
  return false;
};
const jobBinding = (value: unknown): value is JobEntityBinding => {
  if (!record(value) || !("kind" in value) || !("value" in value)) return false;
  if (value.kind === "exact") return exactKeys(value, ["kind", "value"]) && id(value.value);
  if (value.kind === "result") return exactKeys(value, ["kind", "value"]) && record(value.value)
    && exactKeys(value.value, ["step", "slot"]) && id(value.value.step) && id(value.value.slot);
  return false;
};
const jobOperation = (value: unknown): value is JobOperation => {
  if (!record(value) || !["finiteToItem", "itemToItems"].includes(value.kind as string)) return false;
  return exactKeys(value, ["kind", "source", "inputKind", "inputQuantity", "outputKind", "outputQuantity", "workSeconds", "resultSlot"])
    && jobBinding(value.source) && id(value.inputKind) && quantity(value.inputQuantity)
    && id(value.outputKind) && quantity(value.outputQuantity)
    && typeof value.workSeconds === "number" && Number.isFinite(value.workSeconds) && value.workSeconds > 0 && value.workSeconds <= 86400
    && id(value.resultSlot);
};
const jobContinuation = (value: unknown): value is JobContinuation =>
  value === "any-eligible" || value === "prefer-starter" || value === "bind-on-first-progress"
  || (record(value) && exactKeys(value, ["assigned-actor"]) && id(value["assigned-actor"]));
const jobPlan = (value: unknown): value is JobPlan => {
  if (!record(value) || !exactKeys(value, ["definition", "definitionVersion", "steps"]) || !id(value.definition)
    || typeof value.definitionVersion !== "number" || !Number.isSafeInteger(value.definitionVersion) || value.definitionVersion <= 0
    || !Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 32) return false;
  const keys = new Set<string>();
  return value.steps.every((step, index) => {
    if (!record(step) || !(exactKeys(step, ["key", "after", "operation"]) || exactKeys(step, ["key", "after", "operation", "continuation"]))
      || !id(step.key) || keys.has(step.key) || !jobOperation(step.operation)
      || !(step.after === null || (id(step.after) && value.steps.slice(0, index).some(previous => record(previous) && previous.key === step.after)))
      || (Object.hasOwn(step, "continuation") && !jobContinuation(step.continuation))) return false;
    keys.add(step.key); return true;
  });
};
const destination = (value: unknown): boolean =>
  record(value) && exactKeys(value, ["x", "y", "z", "frame"]) &&
  coordinate(value.x) && coordinate(value.y) && coordinate(value.z) &&
  (value.frame === null || id(value.frame));
const activity = (value: unknown): boolean => {
  if (!record(value)) return false;
  switch (value.kind) {
    case "route":
      return exactKeys(value, ["kind", "destination"]) && destination(value.destination);
    case "construction":
      return exactKeys(value, ["kind", "site", "contact", "mode"]) && id(value.site) && terrainContact(value.contact) && (value.mode === "bind" || value.mode === "work");
    case "excavation":
      return exactKeys(value, ["kind", "cell", "expectedMaterial", "replacementMaterial"]) && cell(value.cell) && [value.expectedMaterial, value.replacementMaterial].every(Number.isSafeInteger);
    case "deconstruction":
      return exactKeys(value, ["kind", "site", "contact"]) && id(value.site) && terrainContact(value.contact);
    case "process-attendance":
      return exactKeys(value, ["kind", "process"]) && id(value.process);
    case "material-transfer":
      return exactKeys(value, ["kind", "lot", "from", "to", "quantity"]) && id(value.lot) && id(value.from) && id(value.to) && quantity(value.quantity);
    case "material-drop":
      return exactKeys(value, ["kind", "lot"]) && id(value.lot);
    case "resource-establish":
      return exactKeys(value, ["kind", "site", "definition", "cell"]) && id(value.site) && id(value.definition) && cell(value.cell);
    case "resource-tend":
      return exactKeys(value, ["kind", "site", "vessel"]) && id(value.site) && id(value.vessel);
    case "resource-extract":
      return exactKeys(value, ["kind", "source"]) && id(value.source);
    case "field-water":
      return exactKeys(value, ["kind", "vessel", "cell", "direction", "portions"]) && id(value.vessel) && cell(value.cell) && (value.direction === "withdraw" || value.direction === "deposit") && typeof value.portions === "number" && Number.isInteger(value.portions) && value.portions >= 1 && value.portions <= 7;
    case "job-transform":
      return exactKeys(value, ["kind", "task", "contact"]) && id(value.task) && destination(value.contact);
    default:
      return false;
  }
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
      keys = ["kind", "bindingId", "expectedSequence", "records"];
      valid = id(action.bindingId) && typeof action.expectedSequence === "number" && Number.isSafeInteger(action.expectedSequence) && action.expectedSequence > 0 && Array.isArray(action.records) && action.records.length > 0 && action.records.length <= 32;
      break;
    case "begin-work-attempt":
      keys = ["kind", "task", "worker", "party", "operation"];
      valid = id(action.task) && id(action.worker) && id(action.party) && activity(action.operation) && (action.operation as Record<string, unknown>).kind === "route";
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
      valid = id(action.task) && typeof action.generation === "number" && Number.isSafeInteger(action.generation) && action.generation > 0 && typeof action.sequence === "number" && Number.isSafeInteger(action.sequence) && action.sequence > 0 && activity(action.nextActivity);
      break;
    }
    case "create-job":
      keys = ["kind", "id", "plan"];
      valid = id(action.id) && jobPlan(action.plan);
      break;
    case "resume-job":
      keys = ["kind", "id", "plan"];
      valid = id(action.id) && jobPlan(action.plan);
      break;
    case "cancel-job":
      keys = ["kind", "id"];
      valid = id(action.id);
      break;
    case "establish-resource-site":
      keys = ["kind", "operation", "worker", "site", "definition", "x", "y", "z"];
      valid = id(action.operation) && id(action.worker) && id(action.site) && id(action.definition) && [action.x, action.y, action.z].every(value => Number.isSafeInteger(value));
      break;
    case "tend-resource-site":
      keys = ["kind", "operation", "worker", "site", "vessel"];
      valid = id(action.operation) && id(action.worker) && id(action.site) && id(action.vessel);
      break;
    case "designate-resource":
      keys = ["kind", "order", "party", "definition", "x", "y", "z"];
      valid = id(action.order) && id(action.party) && id(action.definition) && [action.x, action.y, action.z].every(value => Number.isSafeInteger(value));
      break;
    case "request-field-water":
      keys = ["kind", "party", "material", "portions"];
      valid = id(action.party) && id(action.material) && Number.isSafeInteger(action.portions) && action.portions >= 1 && action.portions <= 7;
      break;
    case "request-process":
      keys = ["kind", "definition", "station"];
      valid = id(action.definition) && id(action.station);
      break;
    case "admit-process":
      keys = ["kind", "process", "definition", "station"];
      valid = id(action.process) && id(action.definition) && id(action.station);
      break;
    case "designate-stockpile": {
      keys = ["kind", "party", "zone", "cells"];
      const cells = action.cells;
      valid = id(action.party) && id(action.zone) && Array.isArray(cells) && cells.length > 0 && cells.length <= 256 && cells.every(cell => {
        if (!cell || typeof cell !== "object" || Array.isArray(cell)) return false;
        const value = cell as Record<string, unknown>;
        return Object.keys(value).length === 6 && [value.x, value.y, value.z].every(item => typeof item === "number" && Number.isSafeInteger(item)) && quantity(value.priority) && quantity(value.capacity) && stream(value.filterProfile);
      });
      break;
    }
    case "update-stockpile":
      keys = ["kind", "party", "zone", "filterProfile", "priority"];
      valid = id(action.party) && id(action.zone) && stream(action.filterProfile) && quantity(action.priority);
      break;
    case "plan-constructions":
      keys = ["kind", "party", "plans"];
      valid = id(action.party) && Array.isArray(action.plans) && action.plans.length > 0 && action.plans.length <= 256
        && action.plans.every(plan => record(plan) && exactKeys(plan, ["catalog", "site", "target"])
          && id(plan.catalog) && id(plan.site) && constructionTarget(plan.target));
      break;
    case "plan-excavation":
      keys = ["kind", "party", "prefix", "start", "end"];
      valid = id(action.party) && id(action.prefix) && cell(action.start) && cell(action.end);
      break;
    case "cancel-excavation": {
      keys = ["kind", "party", "area", "workers"];
      const area = action.area;
      valid = id(action.party) && Array.isArray(action.workers) && action.workers.length <= 32 && action.workers.every(id) &&
        (area === null || (record(area) && exactKeys(area, ["start", "end"]) && cell(area.start) && cell(area.end)));
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
    case "plan-deconstruction":
      keys = ["kind", "site", "party"];
      valid = id(action.site) && id(action.party);
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
