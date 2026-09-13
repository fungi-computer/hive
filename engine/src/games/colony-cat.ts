import { component, query, system } from "../sdk/authoring.js";
import { Body, Destination, Position, Traversal, move } from "../sdk/common.js";
import type { EntityId, WriteContext } from "../contracts.js";

/** Authored cat intent. Movement and reachability remain native-owned. */
export const Cat = component<{
  home: EntityId;
  nextAt: number;
  seed: number;
  blockedUntil: number;
}>("colony.cat", {
  version: 1,
  fields: {
    home: "entity",
    nextAt: "number",
    seed: "number",
    blockedUntil: "number",
  },
});

const WANDER_INTERVAL = 7;
const RETRY_INTERVAL = 1;
const WANDER_RADIUS = 4;
const MAX_SEED = 0xffffffff;

export const catInitial = (
  id: EntityId,
  home: EntityId,
  position: { x: number; y: number; z: number; facing?: number },
  seed = 1,
) => ({
  id,
  components: {
    [Position.id]: {
      x: position.x,
      y: position.y,
      z: position.z,
      facing: position.facing ?? 0,
    },
    [Body.id]: { speed: 0.9 },
    [Traversal.id]: { clearanceCells: 1, maxStepCells: 1 },
    [Cat.id]: { home, nextAt: 0, seed, blockedUntil: 0 },
  },
});

function nextSeed(seed: number): number {
  return (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
}

function offset(seed: number): { x: number; z: number } {
  const angle = ((seed >>> 0) / (MAX_SEED + 1)) * Math.PI * 2;
  const radius = 1.5 + (((seed >>> 8) % 250) / 250) * (WANDER_RADIUS - 1.5);
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

function catRows(context: WriteContext) {
  return context.query(query(Cat, Position, Body, Traversal));
}

/**
 * Small authored behavior for later composition into Colony. It only submits
 * ordinary native moves, keeps its schedule in Cat, and backs off after a
 * rejected route instead of retrying every tick.
 */
export const colonyCatSystem = system({
  id: "colony.cat-wander",
  version: 1,
  every: 1,
  reads: [Cat, Position, Body, Traversal, Destination],
  writes: [Cat],
  run(context) {
    const now = context.clock.now;
    const destinations = new Set(context.query(query(Destination)).map((row: any) => row.id));
    for (const row of catRows(context)) {
      const cat = row.get(Cat) as {
        home: EntityId;
        nextAt: number;
        seed: number;
        blockedUntil: number;
      };
      if (now < cat.nextAt || now < cat.blockedUntil) continue;

      const position = row.get(Position) as { x: number; y: number; z: number; facing: number };
      const home = context.query(query(Position)).find((candidate: any) => candidate.id === cat.home)?.get(Position) as { x: number; y: number; z: number; facing: number } | undefined;
      const seed = nextSeed(cat.seed);
      const previous = context.outcomes.find(({ action }: any) => action.kind === "move" && action.entity === row.id);
      if (previous && !previous.result.accepted) {
        context.write(Cat, row.id, {
          ...cat,
          seed,
          nextAt: now + RETRY_INTERVAL,
          blockedUntil: now + RETRY_INTERVAL,
        });
        continue;
      }
      if (!home || destinations.has(row.id)) {
        context.write(Cat, row.id, { ...cat, seed, nextAt: now + RETRY_INTERVAL });
        continue;
      }
      const delta = offset(seed);
      const target = { x: Math.round(home.x + delta.x), y: home.y, z: Math.round(home.z + delta.z), frame: null };
      const facing = Math.round((Math.atan2(target.x - position.x, target.z - position.z) / (Math.PI / 2))) || 0;
      context.action(move(row.id, target, ((facing % 4) + 4) % 4));
      context.write(Cat, row.id, { ...cat, seed, nextAt: now + WANDER_INTERVAL, blockedUntil: 0 });
    }
  },
});

export const colonyCatComponents = Object.freeze([
  Cat,
  Position,
  Body,
  Traversal,
  Destination,
]);
