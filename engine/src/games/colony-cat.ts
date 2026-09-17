import { component, query } from "../sdk/authoring.js";
import { action, actor, behavior, predicate } from "../sdk/behavior.js";
import { Body, Destination, Position, Traversal, move } from "../sdk/common.js";
import type { EntityId, ReadContext } from "../contracts.js";
import { COLONY_VERTICAL_METRES } from "./colony-world.js";

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

function sameDestination(
  left: { readonly x: number; readonly y: number; readonly z: number; readonly frame: EntityId | null },
  right: { readonly x: number; readonly y: number; readonly z: number; readonly frame: EntityId | null },
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z && left.frame === right.frame;
}

function currentDestination(context: ReadContext, entity: EntityId) {
  return context
    .query(query(Destination))
    .find((candidate) => candidate.id === entity)
    ?.get(Destination);
}

function rejectedMove(
  context: ReadContext,
  entity: EntityId,
): boolean {
  const destination = currentDestination(context, entity);
  return context.outcomes.some(
    ({ action: request, result }) =>
      !result.accepted &&
      request.kind === "move" &&
      request.entity === entity &&
      (!destination || sameDestination(request.destination, destination)),
  );
}

const moveWasRejected = predicate("colony.cat.move-rejected", {
  reads: [Destination],
  test: (subject, context) => rejectedMove(context, subject.id),
});

const wanderIsDue = predicate("colony.cat.wander-due", {
  reads: [Cat, Destination],
  test(subject, context) {
    const cat = subject.get(Cat);
    return (
      context.clock.now >= cat.nextAt &&
      context.clock.now >= cat.blockedUntil &&
      !rejectedMove(context, subject.id)
    );
  },
});

const backOffRejectedMove = action("colony.cat.back-off", {
  reads: [Cat],
  writes: [Cat],
  exclusive: "movement",
  run(subject, context) {
    const cat = subject.get(Cat);
    const seed = nextSeed(cat.seed);
    context.write(Cat, subject.id, {
      ...cat,
      seed,
      nextAt: context.clock.now + RETRY_INTERVAL,
      blockedUntil: context.clock.now + RETRY_INTERVAL,
    });
  },
});

const chooseWander = action("colony.cat.choose-wander", {
  reads: [Cat, Position, Destination],
  writes: [Cat],
  facts: ["terrainSurfaces"],
  exclusive: "movement",
  run(subject, context) {
    const cat = subject.get(Cat);
    const position = subject.get(Position);
    const home = context
      .query(query(Position))
      .find((candidate) => candidate.id === cat.home)
      ?.get(Position);
    const seed = nextSeed(cat.seed);
    if (!home || currentDestination(context, subject.id)) {
      context.write(Cat, subject.id, {
        ...cat,
        seed,
        nextAt: context.clock.now + RETRY_INTERVAL,
      });
      return;
    }
    const delta = offset(seed);
    const x = Math.round(home.x + delta.x);
    const z = Math.round(home.z + delta.z);
    const surface = context.terrainSurfaces([[x, z]])[0];
    if (!surface) {
      context.write(Cat, subject.id, {
        ...cat,
        seed,
        nextAt: context.clock.now + RETRY_INTERVAL,
        blockedUntil: context.clock.now + RETRY_INTERVAL,
      });
      return;
    }
    const target = {
      x,
      y: (surface.cell[1] + 0.5) * COLONY_VERTICAL_METRES,
      z,
      frame: null,
    };
    const facing =
      Math.round(
        Math.atan2(target.x - position.x, target.z - position.z) /
          (Math.PI / 2),
      ) || 0;
    context.action(move(subject.id, target, ((facing % 4) + 4) % 4));
    context.write(Cat, subject.id, {
      ...cat,
      seed,
      nextAt: context.clock.now + WANDER_INTERVAL,
      blockedUntil: 0,
    });
  },
});

/**
 * Small authored behavior for later composition into Colony. It only submits
 * ordinary native moves, keeps its schedule in Cat, and backs off after a
 * rejected route instead of retrying every tick.
 */
export const colonyCatSystem = behavior(
  "colony.cat-wander",
  (scene) => {
    const cats = scene.find(Cat, Position, Body, Traversal);
    cats.where(moveWasRejected).do(backOffRejectedMove);
    cats.where(wanderIsDue).do(chooseWander);
  },
  { every: 1 },
);

export const colonyCatActor = actor("colony.cat")
  .with(Cat)
  .with(Position)
  .with(Body, { speed: 0.9 })
  .with(Traversal, { clearanceCells: 1, maxStepCells: 1 })
  .behaves(colonyCatSystem);

export const colonyCatComponents = Object.freeze([
  Cat,
  Position,
  Body,
  Traversal,
  Destination,
]);
