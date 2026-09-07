// Physical wood has exactly one location: a pile, a person's arms, or a site.
import type { Actor, BuildJob, Cell, Clearing, Pile, Site } from "./model.ts";
import { BUILDINGS } from "./construction.js";
import { blockedCells, cellKey, inside, neighbors, sameCell } from "./world.js";
import { route } from "./movement.js";
import { members } from "./actors.ts";

export function looseWood(state: Clearing): number {
  return state.piles.reduce((total, pile) => total + pile.amount, 0);
}
export function availableWood(state: Clearing, pile: Pile): number {
  return (
    pile.amount -
    Object.values(state.claims)
      .filter((claim) => claim.pile === pile.id)
      .reduce((n, claim) => n + claim.amount, 0)
  );
}
export function neededWood(state: Clearing, site: Site): number {
  const reserved = Object.values(state.claims)
    .filter((claim) => claim.site === site.id)
    .reduce((n, claim) => n + claim.amount, 0);
  const carried = Object.values(state.actors).reduce(
    (n, person) =>
      n + (person.cargo?.site === site.id ? person.cargo.amount : 0),
    0,
  );
  return BUILDINGS[site.type].wood - site.delivered - reserved - carried;
}
export function reserveWood(
  state: Clearing,
  person: Actor,
  job: BuildJob,
  pile: Pile,
  site: Site,
): boolean {
  const amount = Math.min(
    2,
    availableWood(state, pile),
    neededWood(state, site),
  );
  if (amount <= 0) return false;
  state.claims[person.id] = {
    job: job.id,
    pile: pile.id,
    site: site.id,
    amount,
  };
  return true;
}
export function dropWood(state: Clearing, at: Cell, amount: number): void {
  if (!amount) return;
  let pile = state.piles.find((p) => sameCell(p, at));
  if (!pile) {
    pile = {
      id: `wood-${state.nextId++}`,
      x: at.x,
      z: at.z,
      level: at.level,
      amount: 0,
    };
    state.piles.push(pile);
  }
  pile.amount += amount;
  state.workDirty = true;
}
export function dropCarried(state: Clearing, person: Actor): void {
  if (person.cargo) dropWood(state, person, person.cargo.amount);
  person.cargo = null;
}
export function refundWood(state: Clearing, at: Cell, amount: number): void {
  if (!amount) return;
  const blocked = blockedCells(state);
  const people = members(state);
  const seen = new Set<string>(),
    queue: Cell[] = [at];
  // Search by distance from the canceled site, then prove actual access. A roof
  // over a finished wall must not refund its wood inside that solid wall.
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i],
      key = cellKey(cell);
    if (!inside(cell) || seen.has(key)) continue;
    seen.add(key);
    if (
      !blocked.has(key) &&
      people.some((person) => route(person, cell, blocked) !== null)
    ) {
      dropWood(state, cell, amount);
      return;
    }
    queue.push(...neighbors(cell));
  }
  throw new Error("A canceled site's wood has no reachable return cell.");
}
