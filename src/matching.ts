import type { Assignment, Colony } from "./model.ts";

// libcolony's absent matrix entries have value 1, equal to its most expensive
// offered edge. A sparse input can therefore lose a valid assignment to padding.
// Encode forbidden pairs explicitly; libcolony still owns the entire matching.
export function optimizeEligible(
  colony: Colony,
  eligible: Assignment[],
): Assignment[] {
  if (!eligible.length) return [];
  const actors = [...new Set(eligible.map((edge) => edge.character))];
  const tasks = [...new Set(eligible.map((edge) => edge.task))];
  const allowed = new Map(
    eligible.map((edge) => [`${edge.character}/${edge.task}`, edge]),
  );
  const maximum = Math.max(...eligible.map((edge) => edge.cost));
  const size = Math.min(actors.length, tasks.length);
  // One additional real match outweighs the sum of every possible travel/work
  // cost change. Within that cardinality, the original costs choose the match.
  const forbidden = (maximum + 1) * (size + 1);
  const matrix = actors.flatMap((character) =>
    tasks.map(
      (task) =>
        allowed.get(`${character}/${task}`) ?? {
          character,
          task,
          cost: forbidden,
        },
    ),
  );
  return colony
    .optimize(matrix)
    .filter((edge) => allowed.has(`${edge.character}/${edge.task}`));
}
