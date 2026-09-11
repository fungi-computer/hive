import type { ActionOutcome, EntityId, Impact, Vec3 } from "../contracts";

/** Committed, bounded feedback facts. Particle instances remain client-owned. */
export interface PresentationCue {
  readonly sequence: number;
  readonly time: number;
  readonly kind: "launch" | "impact";
  readonly subject: EntityId;
  readonly source: EntityId;
  readonly at: Vec3;
  readonly direction: Vec3;
}
export interface CueSnapshot {
  readonly sequence: number;
  readonly recent: readonly PresentationCue[];
}
const MAX_CUES = 64;
const RETENTION_SECONDS = 3;
const identity = (value: unknown): value is EntityId =>
  typeof value === "string" && value.length > 0 && value.length <= 160;
const vector = (value: unknown): value is Vec3 => {
  if (!value || typeof value !== "object") return false;
  const v = value as Vec3;
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
};
export function isPresentationCue(value: unknown): value is PresentationCue {
  if (!value || typeof value !== "object") return false;
  const cue = value as PresentationCue;
  return Number.isSafeInteger(cue.sequence) && cue.sequence > 0 &&
    Number.isFinite(cue.time) && cue.time >= 0 &&
    (cue.kind === "launch" || cue.kind === "impact") &&
    identity(cue.subject) && identity(cue.source) && vector(cue.at) && vector(cue.direction);
}
export function checkedCueSnapshot(value: CueSnapshot, now: number): CueSnapshot {
  if (!value || !Number.isSafeInteger(value.sequence) || value.sequence < 0 ||
      !Array.isArray(value.recent) || value.recent.length > MAX_CUES)
    throw new Error("invalid presentation cue snapshot");
  let previous = 0;
  for (const cue of value.recent) {
    if (!isPresentationCue(cue) || cue.sequence <= previous || cue.sequence > value.sequence ||
        cue.time > now + 1e-9 || cue.time < now - RETENTION_SECONDS - 1e-9)
      throw new Error("invalid presentation cue frontier");
    previous = cue.sequence;
  }
  return structuredClone(value);
}

export function checkedCueList(value: unknown, now: number): readonly PresentationCue[] {
  if (!Array.isArray(value)) throw new Error("invalid presentation cue list");
  const sequence = value.length ? value[value.length - 1]?.sequence : 0;
  return checkedCueSnapshot({ sequence, recent: value }, now).recent;
}

/** Pure candidate: session publication/rollback owns this alongside physical results. */
export function appendPresentationCues(
  before: CueSnapshot,
  now: number,
  outcomes: readonly ActionOutcome[],
  impacts: readonly Impact[],
): CueSnapshot {
  let sequence = before.sequence;
  const recent = before.recent.filter(cue => cue.time >= now - RETENTION_SECONDS);
  const append = (cue: Omit<PresentationCue, "sequence">) => {
    if (!Number.isSafeInteger(sequence + 1)) throw new Error("presentation cue sequence exhausted");
    recent.push({ ...cue, sequence: ++sequence });
  };
  for (const { action, result } of outcomes) {
    if (action.kind !== "launch" || !result.accepted) continue;
    if (!vector(result.launchPoint)) throw new Error("accepted launch lacks launch point");
    append({ kind: "launch", time: now, subject: action.launcher, source: action.launcher,
      at: result.launchPoint, direction: action.velocity });
  }
  for (const impact of impacts)
    append({ kind: "impact", time: impact.time, subject: impact.targetId, source: impact.sourceId,
      at: impact.point, direction: impact.velocity });
  return checkedCueSnapshot({ sequence, recent: recent.slice(-MAX_CUES) }, now);
}
