import type {
  ActorId,
  CareNeed,
  CareOutcome,
  Clearing,
  Needs,
  WaterDeliveryOperation,
  ConsumeOperation,
} from "./model.ts";
import { sinkHeldOperationPortion, sinkHeldPortion } from "./materials.ts";

export const CARE_THRESHOLD = 35;
export const HYDRATION_DECAY = 65 / (6 * 60 * 20);
export const NOURISHMENT_DECAY = 65 / (10 * 60 * 20);
export const REST_DECAY = 0.012;
export const BED_REST_DEFINITION = {
  id: "bed-rest-v1",
  contact: { kind: "bed", rate: 0.3, recoverAt: 90 },
} as const;
export const REST_CONTACT = BED_REST_DEFINITION.contact;

export function initialNeeds(advancedAt = 0, rest = 80): Needs {
  return {
    advancedAt,
    nourishment: 100,
    hydration: 100,
    rest: Math.max(0, Math.min(100, rest)),
  };
}
export type CareConsumptionDefinition = {
  readonly id: string;
  readonly consume:
    | {
        readonly kind: "held-lot";
        readonly material: import("./model.ts").Material;
        readonly quantity: number;
      }
    | {
        readonly kind: "vessel-content";
        readonly material: import("./model.ts").Material;
        readonly quantity: number;
      };
  readonly effect: {
    readonly kind: "restore";
    readonly need: "nourishment" | "hydration";
    readonly amount: number;
  };
  readonly attendTicks?: number;
};
export const CONSUMABLE_CARE_DEFINITIONS = [
  {
    id: "ration-v1",
    consume: { kind: "held-lot", material: "ration", quantity: 1 },
    effect: { kind: "restore", need: "nourishment", amount: 60 },
    attendTicks: 40,
  },
] as const satisfies readonly CareConsumptionDefinition[];
export const CARE_CONSUMPTION_DEFINITIONS = [
  ...CONSUMABLE_CARE_DEFINITIONS,
  {
    id: "water-v1",
    consume: { kind: "vessel-content", material: "water", quantity: 1 },
    effect: { kind: "restore", need: "hydration", amount: 60 },
  },
] as const satisfies readonly CareConsumptionDefinition[];
export function consumableCareDefinition(
  id: string,
): (typeof CONSUMABLE_CARE_DEFINITIONS)[number] | null {
  return (
    CONSUMABLE_CARE_DEFINITIONS.find((definition) => definition.id === id) ??
    null
  );
}
export function consumableCareDefinitionsFor(need: CareNeed) {
  return CONSUMABLE_CARE_DEFINITIONS.filter(
    (definition) => definition.effect.need === need,
  );
}
export function careConsumptionDefinition(
  id: string,
): CareConsumptionDefinition | null {
  return (
    CARE_CONSUMPTION_DEFINITIONS.find((definition) => definition.id === id) ??
    null
  );
}

export function needValue(needs: Needs, need: CareNeed): number {
  return needs[need];
}

export function careNeed(needs: Needs): CareNeed | null {
  if (needs.hydration <= CARE_THRESHOLD) return "hydration";
  if (needs.nourishment <= CARE_THRESHOLD) return "nourishment";
  if (needs.rest <= CARE_THRESHOLD) return "rest";
  return null;
}

/** Queue intent at safe idle boundaries; assignment itself still respects draft. */
export function queueAutomaticCare(state: Clearing): void {
  for (const actor of Object.values(state.actors)) {
    const need = careNeed(actor.needs);
    if (
      !need ||
      state.jobs.some(
        (job) => job.kind === "care" && job.target === actor.id &&
          (job.policy === "automatic" || job.need === need),
      )
    )
      continue;
    state.jobs.unshift({
      id: `job-${state.nextId++}`,
      kind: "care",
      target: actor.id,
      need,
      policy: "automatic",
      reason: actor.drafted
        ? "Care is queued while drafted"
        : "Physical care is needed",
      routine: false,
    });
    state.workDirty = true;
  }
}

/** The sole elapsed-time owner. Call only after the world pause gate. */
export function advanceNeeds(state: Clearing): void {
  for (const actor of Object.values(state.actors)) {
    const { needs } = actor;
    const elapsed = state.tick - needs.advancedAt;
    if (elapsed <= 0) continue;
    const before = { ...needs };
    needs.hydration = Math.max(0, needs.hydration - elapsed * HYDRATION_DECAY);
    needs.nourishment = Math.max(
      0,
      needs.nourishment - elapsed * NOURISHMENT_DECAY,
    );
    if (actor.mode !== "sleep")
      needs.rest = Math.max(0, needs.rest - elapsed * REST_DECAY);
    needs.advancedAt = state.tick;
    if ((["hydration", "nourishment", "rest"] as const).some(
      (need) => before[need] >= CARE_THRESHOLD && needs[need] < CARE_THRESHOLD,
    )) state.workDirty = true;
  }
}

function outcomeFor(
  state: Clearing,
  actor: ActorId,
  operation: string,
  definition: string,
): CareOutcome | null {
  const effect = careConsumptionDefinition(definition);
  return effect
    ? {
        id: `care-outcome:${operation}`,
        receipt: `${operation}-sink`,
        actor,
        need: effect.effect.need,
        definition,
        amount: effect.effect.amount,
        tick: state.tick,
      }
    : null;
}
/** Preflights custody and authored effect, then sinks and credits as one owner. */
export function settleCareConsumption(
  state: Clearing,
  input: {
    actor: ActorId;
    operation: ConsumeOperation | WaterDeliveryOperation;
    lot: string;
  },
): boolean {
  const { operation } = input;
  const definition =
    operation.kind === "consume"
      ? careConsumptionDefinition(operation.definition)
      : (CARE_CONSUMPTION_DEFINITIONS.find(
          (candidate) =>
            candidate.consume.kind === "vessel-content" &&
            candidate.effect.need === "hydration",
        ) ?? null);
  const outcome =
    definition && outcomeFor(state, input.actor, operation.id, definition.id);
  const job = state.jobs.find((entry) => entry.id === operation.job);
  const actor = state.actors[input.actor];
  if (
    !definition ||
    !outcome ||
    !actor ||
    !job ||
    job.kind !== "care" ||
    job.target !== input.actor ||
    job.need !== definition.effect.need ||
    (operation.kind === "consume" && operation.actor !== input.actor) ||
    (operation.kind === "consume" && definition.consume.kind !== "held-lot") ||
    (operation.kind === "water-delivery" &&
      (operation.target.kind !== "hydration" ||
        operation.target.actor !== input.actor ||
        definition.consume.kind !== "vessel-content" ||
        operation.quantity !== definition.consume.quantity)) ||
    state.careOutcomes.some(
      (entry) => entry.id === outcome.id || entry.receipt === outcome.receipt,
    ) ||
    state.materials.sinks.some((entry) => entry.id === outcome.receipt)
  )
    return false;
  const consumed =
    operation.kind === "consume"
      ? sinkHeldOperationPortion(state.materials, {
          id: outcome.receipt,
          operation: operation.id,
          lot: input.lot,
          material: definition.consume.material,
          quantity: definition.consume.quantity,
        })
      : sinkHeldPortion(state.materials, {
          id: outcome.receipt,
          operation: operation.id,
          sourceLot: input.lot,
          material: definition.consume.material,
          quantity: definition.consume.quantity,
        });
  if (!consumed.ok) return false;
  // All post-sink facts were preflighted above; this append/gain cannot fail.
  state.careOutcomes.push(outcome);
  actor.needs[outcome.need] = Math.min(
    100,
    actor.needs[outcome.need] + outcome.amount,
  );
  state.workDirty = true;
  return true;
}
/** Contact recovery is owned beside elapsed decay, never by an activity. */
export function advanceRestContact(
  state: Clearing,
  input: { actor: ActorId; job: string; bed: string },
): boolean {
  const actor = state.actors[input.actor];
  const job = state.jobs.find((entry) => entry.id === input.job);
  const bed = state.sites.find((site) => site.id === input.bed);
  if (
    !actor ||
    job?.kind !== "care" ||
    job.target !== actor.id ||
    job.need !== "rest" ||
    actor.task?.kind !== "sleep" ||
    actor.task.job !== job.id ||
    actor.task.target !== input.bed ||
    !bed ||
    bed.type !== "bed" ||
    bed.finishedAt === null ||
    actor.x !== bed.x ||
    actor.z !== bed.z ||
    actor.level !== bed.level
  )
    return false;
  const needs = actor.needs;
  needs.rest = Math.min(100, needs.rest + REST_CONTACT.rate);
  return true;
}
export function careOutcomeProblem(
  state: Clearing,
  outcome: CareOutcome,
): string | null {
  const actor = state.actors[outcome.actor];
  const sink = state.materials.sinks.find(
    (entry) => entry.id === outcome.receipt,
  );
  const definition = careConsumptionDefinition(outcome.definition);
  if (
    !actor ||
    !sink ||
    !definition ||
    outcome.need !== definition.effect.need ||
    outcome.amount !== definition.effect.amount ||
    outcome.tick > state.tick
  )
    return "invalid-care-outcome";
  return sink.material === definition.consume.material &&
    sink.quantity === definition.consume.quantity
    ? null
    : "care-outcome-sink-mismatch";
}

/** UI reads these authoritative facts without owning a second care status. */
export function careFacts(state: Clearing, actor: ActorId) {
  const needs = state.actors[actor]?.needs;
  const job = state.jobs.find(
    (entry): entry is Extract<Clearing["jobs"][number], { kind: "care" }> =>
      entry.kind === "care" && entry.target === actor,
  );
  const task =
    job && state.actors[actor]?.task?.job === job.id
      ? state.actors[actor].task
      : null;
  return needs
    ? {
        ...needs,
        queued: job?.need ?? null,
        active: task?.kind ?? null,
        reason: job?.reason ?? null,
      }
    : null;
}
