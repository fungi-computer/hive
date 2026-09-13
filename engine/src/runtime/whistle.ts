import { createWhistle, type WhistleActionSchema, type WhistleAgentProjection, type WhistleAvailability, type WhistleJsonValue } from "@fungi.computer/whistle";
import { parse as parseAgentProjection } from "@fungi.computer/whistle/wire";
import { toJSONSchema, z } from "zod";
import type { EntityId, GameCommandAvailability, GameCommandDefinition, GamePack, ReadContext } from "../contracts";
import { entity } from "../sdk/authoring";

export interface WhistleContextualTarget {
  readonly commandId: string;
  readonly subjects: readonly EntityId[];
}

export interface WhistleObservationProjection {
  readonly agent: readonly WhistleAgentProjection[];
  readonly targets: readonly WhistleContextualTarget[];
  readonly revision: number;
}

type WhistleContext = Pick<ReadContext, "query">;

function availability(value: GameCommandAvailability | undefined): WhistleAvailability {
  if (value === undefined || value.status === "available") return { status: "available" };
  if (value.reason.trim().length === 0) throw new Error("Whistle availability reason must not be blank");
  return { status: "unavailable", reason: value.reason };
}

function stableSubjects(value: readonly EntityId[] | undefined): readonly EntityId[] {
  if (value === undefined || value.length === 0) return [];
  const subjects = [...new Set(value)];
  if (subjects.length > 128 || subjects.some(id => id.length > 128 || entity(id) !== id))
    throw new Error("invalid Whistle contextual subject");
  return subjects;
}
function jsonValue(value: unknown): WhistleJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, jsonValue(nested)]));
  throw new Error("Whistle schema must be JSON");
}
function inputSchema(input: GameCommandDefinition["input"]): WhistleActionSchema {
  const value = z.json().parse(toJSONSchema(input, { io: "input" }));
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Whistle input schema must be an object");
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, jsonValue(nested)]));
}

export interface WhistleObservationProjector {
  readonly project: (context: WhistleContext) => WhistleObservationProjection;
}

/** Compile one host-owned neutral agent surface for a session lifetime. */
export function createWhistleObservationProjector(pack: GamePack): WhistleObservationProjector {
  const whistle = createWhistle();
  let currentContext: WhistleContext | undefined;
  let revision = 0;
  let previousAgentSignature: string | undefined;
  let previousTargets: readonly WhistleContextualTarget[] | undefined;
  let previous: WhistleObservationProjection | undefined;
  const commands = Object.entries(pack.commands ?? {}).map(([id, definition], order) => ({
    id,
    title: definition.title,
    category: definition.category,
    description: definition.description,
    projections: { agent: { order } },
    action: { inputSchema: inputSchema(definition.input) },
    availability: () => {
      if (currentContext === undefined) throw new Error("Whistle projection context is unavailable");
      return availability(definition.availability?.(currentContext));
    },
    // Agent projections are discovery only. Admission remains the durable
    // runtime command boundary and is never routed through this projection.
    handler: () => undefined,
  }));
  whistle.contribute({ sourceId: `hive.${pack.id}`, namespace: pack.id, commands });
  return Object.freeze({
    project(context: WhistleContext) {
      currentContext = context;
      const agentSource = whistle.snapshot().agent;
      const agentSignature = agentSource.map(row => `${row.commandId}\u0000${row.availability.status}\u0000${row.availability.status === "unavailable" ? row.availability.reason : ""}`).join("\u0001");
      const targets = Object.entries(pack.commands ?? {}).flatMap(([name, definition]) => {
        const subjects = stableSubjects(definition.subjects?.(context));
        return subjects.length === 0 ? [] : [{ commandId: `${pack.id}:${name}`, subjects }];
      });
      const sameTargets = previousTargets !== undefined && previousTargets.length === targets.length &&
        previousTargets.every((candidate, index) => candidate.commandId === targets[index].commandId &&
          candidate.subjects.length === targets[index].subjects.length &&
          candidate.subjects.every((id, subjectIndex) => id === targets[index].subjects[subjectIndex]));
      if (previous && previousAgentSignature === agentSignature && sameTargets) return previous;
      revision++;
      const agent = previous && previousAgentSignature === agentSignature
        ? previous.agent
        : parseAgentProjection(agentSource);
      const projection = Object.freeze({ agent, targets: Object.freeze(targets), revision });
      previousAgentSignature = agentSignature;
      previousTargets = projection.targets;
      previous = projection;
      return projection;
    },
  });
}
