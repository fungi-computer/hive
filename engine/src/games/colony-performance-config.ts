/** Presets shared by the performance page and Durable Object host. */
export const colonyPerformanceSizes = Object.freeze([
  64, 128, 256, 512,
] as const);
export type ColonyPerformanceSize = (typeof colonyPerformanceSizes)[number];

export const colonyPerformanceWorkerCounts = Object.freeze([
  4, 8, 16, 32, 50, 100, 200,
] as const);
export type ColonyPerformanceWorkerCount =
  (typeof colonyPerformanceWorkerCounts)[number];

/** Versioned, distributed capacity fixture; never silently change its workload. */
export const colonyFrameworkProofGameId = "colony-framework-proof-256-100-v1" as const;

/** V1 remains the frozen record-change baseline. V2 has its own command ledger. */
export const colonyFrameworkProofV2GameId = "colony-framework-proof-256-100-v2" as const;
/** V3 preserves v2 terrain geometry and adds finite, reachable open water. */
export const colonyFrameworkProofV3GameId = "colony-framework-proof-256-100-v3" as const;
/** Ten-minute workload with six finite, released cohorts; independent of v3. */
export const colonyFrameworkProofV4GameId = "colony-framework-proof-256-100-v4" as const;

export const colonyFrameworkProofV4Schedule = Object.freeze({
  stepSeconds: 0.1,
  steps: 6000,
  treesPerCohort: 64,
  cohortCount: 6,
  cohortReleaseSteps: [1, 1, 1201, 2401, 3601, 4801] as const,
  excavationStep: 101,
  waterRequestStep: 201,
});

export const colonyFrameworkProofV2Schedule = Object.freeze({
  stepSeconds: 0.1,
  steps: 1800,
  treesPerCohort: 128,
  cohortReleaseSteps: [1, 601, 1201] as const,
  excavationStep: 101,
  waterRequestStep: 201,
});

export function colonyPerformanceGameId(
  size: ColonyPerformanceSize,
  workers: ColonyPerformanceWorkerCount,
): string {
  return `colony-performance-${size}-${workers}`;
}

const sizePattern = colonyPerformanceSizes.join("|");
const workerPattern = colonyPerformanceWorkerCounts.join("|");
/** The public host admits only these exact, finite authored workloads. */
export function parseColonyPerformanceGameId(name: string): { readonly size: ColonyPerformanceSize; readonly workers: ColonyPerformanceWorkerCount } | null {
  const match = new RegExp(`^colony-performance-(${sizePattern})-(${workerPattern})$`).exec(name);
  return match ? { size: Number(match[1]) as ColonyPerformanceSize, workers: Number(match[2]) as ColonyPerformanceWorkerCount } : null;
}
