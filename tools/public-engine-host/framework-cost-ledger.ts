import type { OccurrenceDriverResult } from "../../engine/src/runtime/occurrence-driver";
/** Bounded, read-only cost evidence for the versioned framework workload. */
export type CandidateCost = {
  readonly advanceWallMs: number;
  readonly captureWallMs: number;
  readonly recordPuts: number;
  readonly recordRemoves: number;
  readonly changedRecordBytes: number;
};

export type SqlCost = {
  sqlWallMs: number;
  rowsRead: number;
  rowsWritten: number;
  statements: number;
};

export type StepCost = CandidateCost & SqlCost & {
  readonly sequence: number;
  readonly revision: number;
  readonly alarmLatenessMs: number;
  readonly dispatchWallMs: number;
  readonly transactionWallMs: number;
};

export type PublicationCost = {
  readonly revision: number;
  readonly recipients: number;
  readonly buildWallMs: number;
  readonly sendWallMs: number;
  readonly encodedBytes: number;
};

const BATCH_SIZE = 20;

function distribution(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  return { p50: at(.5), p95: at(.95), p99: at(.99), max: sorted.at(-1) ?? 0, total: values.reduce((sum, value) => sum + value, 0) };
}

/**
 * Logs aggregate windows without keeping an unbounded trace in a DO. The host
 * calls this only after a committed step or a completed publication; failed
 * candidates are emitted separately and cannot masquerade as throughput.
 */
export function createFrameworkCostLedger(implementationHash: string, workload: string, emit: (line: string) => void = console.log) {
  let steps: StepCost[] = [];
  let publications: PublicationCost[] = [];
  let repeatedFailure: { sequence: number | null; error: string; count: number } | undefined;
  const header = { proof: "framework-host-cost-v1", implementationHash, workload };
  const flushSteps = () => {
    if (!steps.length) return;
    const fields = ["advanceWallMs", "captureWallMs", "changedRecordBytes", "recordPuts", "recordRemoves", "sqlWallMs", "rowsRead", "rowsWritten", "statements", "alarmLatenessMs", "dispatchWallMs", "transactionWallMs"] as const;
    const costs = Object.fromEntries(fields.map(field => [field, distribution(steps.map(step => step[field]))]));
    emit(JSON.stringify({ ...header, kind: "committed-steps", count: steps.length, firstSequence: steps[0].sequence,
      lastSequence: steps.at(-1)!.sequence, firstRevision: steps[0].revision, lastRevision: steps.at(-1)!.revision,
      costs, samples: steps }));
    steps = [];
  };
  const flushPublications = () => {
    if (!publications.length) return;
    const fields = ["recipients", "buildWallMs", "sendWallMs", "encodedBytes"] as const;
    const costs = Object.fromEntries(fields.map(field => [field, distribution(publications.map(publication => publication[field]))]));
    emit(JSON.stringify({ ...header, kind: "publications", count: publications.length,
      firstRevision: publications[0].revision, lastRevision: publications.at(-1)!.revision,
      costs, samples: publications }));
    publications = [];
  };
  return {
    scheduled(sample: { sequence: number; revision: number; result: OccurrenceDriverResult }) {
      if (sample.result.commands.length)
        emit(JSON.stringify({ ...header, kind: "scheduled-commands", ...sample }));
    },
    step(sample: StepCost) {
      repeatedFailure = undefined;
      steps.push(sample);
      if (steps.length >= BATCH_SIZE) flushSteps();
    },
    publication(sample: PublicationCost) {
      publications.push(sample);
      if (publications.length >= BATCH_SIZE) flushPublications();
    },
    failure(sequence: number | null, error: unknown) {
      flushSteps();
      flushPublications();
      const message = error instanceof Error ? error.message : String(error);
      const count = repeatedFailure?.sequence === sequence && repeatedFailure.error === message
        ? repeatedFailure.count + 1 : 1;
      repeatedFailure = { sequence, error: message, count };
      if (count === 1 || count % BATCH_SIZE === 0)
        emit(JSON.stringify({ ...header, kind: "failure", sequence, error: message, repeatedAttempts: count }));
    },
    flush() { flushSteps(); flushPublications(); },
  };
}
