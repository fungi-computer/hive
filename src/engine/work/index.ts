/** Supported finite-work entry. Material ownership and the host tick remain external. */
export { createFiniteWorkOwner } from "./owner.ts";
export { workProgressSchema, workProgressProblem } from "./progress.ts";
export type {
  WorkDefinition,
  WorkProgress,
  WorkHost,
  AccessOutcome,
  WorkOutcome,
} from "./progress.ts";
