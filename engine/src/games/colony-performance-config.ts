/** Presets shared by the performance composition root and its Worker owner. */
export const colonyPerformanceSizes = Object.freeze([
  64, 128, 256, 512,
] as const);
export type ColonyPerformanceSize = (typeof colonyPerformanceSizes)[number];

export const colonyPerformanceWorkerCounts = Object.freeze([
  4, 8, 16, 32, 50, 100, 200,
] as const);
export type ColonyPerformanceWorkerCount =
  (typeof colonyPerformanceWorkerCounts)[number];

export function colonyPerformanceGameId(
  size: ColonyPerformanceSize,
  workers: ColonyPerformanceWorkerCount,
): string {
  return `colony-performance-${size}-${workers}`;
}

export function colonyPerformanceWorkerName(
  size: ColonyPerformanceSize,
  workers: ColonyPerformanceWorkerCount,
): string {
  return `colony-performance:${size}:${workers}`;
}

const sizePattern = colonyPerformanceSizes.join("|");
const workerPattern = colonyPerformanceWorkerCounts.join("|");
const workerNamePattern = new RegExp(
  `^colony-performance:(${sizePattern}):(${workerPattern})$`,
);

export function parseColonyPerformanceWorkerName(
  name: string,
): {
  readonly size: ColonyPerformanceSize;
  readonly workers: ColonyPerformanceWorkerCount;
} | null {
  const match = workerNamePattern.exec(name);
  if (!match) return null;
  const size = Number(match[1]) as ColonyPerformanceSize;
  const workers = Number(match[2]) as ColonyPerformanceWorkerCount;
  return { size, workers };
}
