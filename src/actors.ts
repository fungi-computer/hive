import type { Actor, ActorId, Body, Clearing, Scope } from "./model.ts";

export function body(x: number, z: number): Body {
  return { x, z, level: 0, dir: 0, mode: "idle", path: [], leg: 0, work: 0 };
}
export function actor(
  id: ActorId,
  name: string,
  figure: string,
  x: number,
  z: number,
): Actor {
  return {
    ...body(x, z),
    id,
    name,
    figure,
    drafted: false,
    rest: 80,
    routine: false,
    allowedWork: {
      chop: true,
      haul: true,
      build: true,
      garden: true,
      craft: true,
    },
    task: null,
    assignment: null,
  };
}
export function members(state: Clearing, party = "home"): Actor[] {
  return state.parties[party].members.map((id) => state.actors[id]);
}
export function inScope(state: Clearing, person: Actor, scope: Scope): boolean {
  return (
    state.parties[scope.party].members.includes(person.id) &&
    (scope.actors === null || scope.actors.includes(person.id))
  );
}
export function scopeProblem(state: Clearing, scope: Scope): string {
  const party = state.parties[scope.party];
  if (!party) return "That party is not here.";
  if (
    scope.actors !== null &&
    (!scope.actors.length ||
      scope.actors.some((id) => !party.members.includes(id)))
  )
    return "Choose people who belong to this party.";
  return "";
}
