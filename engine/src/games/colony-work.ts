import { ConstructionApproach, constructionWorkProvider } from "../sdk/construction-work";
import { planSiteSupplies } from "../sdk/site-supplies";
import { ConstructionSite, SealedContainer } from "../sdk/construction";
import { component, entity, query, system } from "../sdk/authoring";
import { createWorkSystem, type PreparedWorkProvider } from "../sdk/work-system";
import { deliveryProvider, DeliveryControl, DeliveryTask } from "../sdk/delivery";
import { GroundStock } from "../sdk/ground-stock";
import {
  Emitter, Body, Container, Destination, ExcavationWork, MaterialLot, LotWater, Position, Support, Surface, Traversal,
  excavate, move, cancelWork,
} from "../sdk/common";
import type { EntityId, TerrainSurface, Vec3, WriteContext } from "../contracts";
import { colonyEnvironment } from "./colony-environment";
export const Worker = component<{ guest: boolean }>("colony.worker", {
  version: 1,
  fields: { guest: "boolean" },
});

export type ColonyDigPhase = "queued" | "approaching" | "excavating" | "blocked";
export const ColonyDigOrder = component<{
  cellX: number; cellY: number; cellZ: number; expected: number;
  actor: EntityId | null; phase: string; reason: string;
  approachX: number; approachY: number; approachZ: number;
}>("colony.dig-order", {
  version: 1,
  fields: {
    cellX: "number", cellY: "number", cellZ: "number", expected: "number",
    actor: "nullable-entity", phase: "string", reason: "string",
    approachX: "number", approachY: "number", approachZ: "number",
  },
});

type DigCandidate = {
  readonly worker: EntityId;
  readonly task: EntityId;
  readonly order: EntityId;
  readonly cell: { readonly x: number; readonly y: number; readonly z: number };
  readonly expected: number;
  readonly approaches: readonly (Vec3 & { readonly frame: null })[];
  readonly cost: number;
};

const verticalMetres = colonyEnvironment.world.verticalMetres;
const air = colonyEnvironment.world.slots.air;
const spoilKinds = new Set(["soil-spoil", "stone-spoil"]);
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function orderPoint(order: { approachX: number; approachY: number; approachZ: number }) {
  return { x: order.approachX, y: order.approachY, z: order.approachZ, frame: null as null };
}

function digProvider(ctx: WriteContext): PreparedWorkProvider<DigCandidate> {
  const orders = ctx.query(query(ColonyDigOrder));
  const workers = new Set(ctx.query(query(Worker)).filter((row) => !row.get(Worker).guest).map((row) => row.id));
  const positions = new Map(ctx.worldPoses([...workers]).map(pose => [pose.id, pose]));
  const bodies = new Map(ctx.query(query(Body)).map((row) => [row.id, row.get(Body)]));
  const excavating = new Set(ctx.query(query(ExcavationWork)).map((row) => row.id));
  const deliveries = ctx.query(query(DeliveryTask)).map((row) => row.get(DeliveryTask));
  const occupied = new Set<EntityId>([
    ...excavating,
    ...ctx.query(query(ConstructionSite)).flatMap((row) => {
      const site = row.get(ConstructionSite);
      return site.worker === null ? [] : [site.worker];
    }),
    ...deliveries.flatMap((task) => task.actor ? [task.actor] : []),
  ]);
  const claims = orders.map((row) => ({ task: row.id, actor: row.get(ColonyDigOrder).actor }));

  // Keep every order claimed, but only inspect a rotating bounded window.  The
  // native terrain APIs have their own input bounds and old orders must not
  // make one tick exceed them.
  const windowSize = Math.min(128, orders.length);
  const windowStart = orders.length ? (ctx.clock.tick * 32) % orders.length : 0;
  const activeOrders = orders.length
    ? Array.from({ length: windowSize }, (_, index) => orders[(windowStart + index) % orders.length])
    : [];
  const cells = activeOrders.map((row) => {
    const state = row.get(ColonyDigOrder);
    return [state.cellX, state.cellY, state.cellZ] as [number, number, number];
  });
  const materials = cells.length ? ctx.terrainMaterials(cells) : [];
  const currentMaterial = new Map(activeOrders.map((row, index) => [row.id, materials[index]]));
  const columns = activeOrders.flatMap((row) => {
    const { cellX: x, cellZ: z } = row.get(ColonyDigOrder);
    return [[x, z], [x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]] as [number, number][];
  });
  const uniqueColumns = [...new Map(columns.map((column) => [column.join(","), column])).values()];
  const surfaceByColumn = new Map<string, TerrainSurface | null>();
  for (let offset = 0; offset < uniqueColumns.length; offset += 64) {
    const batch = uniqueColumns.slice(offset, offset + 64);
    const surfaces = ctx.terrainSurfaces(batch);
    batch.forEach((column, index) => surfaceByColumn.set(column.join(","), surfaces[index] ?? null));
  }
  const requests: { actor: EntityId; target: Vec3 & { frame: null }; candidate: DigCandidate }[] = [];
  for (const row of activeOrders) {
    const state = row.get(ColonyDigOrder);
    if (state.actor !== null) continue;
    const materialSlot = currentMaterial.get(row.id);
    if (materialSlot === undefined || materialSlot === air) continue;
    const expected = state.expected >= 0 ? state.expected : materialSlot;
    if (materialSlot !== expected) continue;
    const targetSurface = surfaceByColumn.get(`${state.cellX},${state.cellZ}`);
    if (!targetSurface || targetSurface.cell[0] !== state.cellX || targetSurface.cell[1] !== state.cellY || targetSurface.cell[2] !== state.cellZ) continue;
    for (const worker of workers) {
      if (occupied.has(worker) || !positions.has(worker) || !bodies.has(worker)) continue;
      const adjacent: [number, number][] = [
        [state.cellX - 1, state.cellZ], [state.cellX + 1, state.cellZ],
        [state.cellX, state.cellZ - 1], [state.cellX, state.cellZ + 1],
      ];
      for (const [x, z] of adjacent) {
        const surface = surfaceByColumn.get(`${x},${z}`);
        if (!surface || surface.cell[0] === state.cellX && surface.cell[2] === state.cellZ) continue;
        const approach = { x, y: (surface.cell[1] + 0.5) * verticalMetres, z, frame: null as null };
        requests.push({ actor: worker, target: approach, candidate: {
          worker, task: row.id, order: row.id,
          cell: { x: state.cellX, y: state.cellY, z: state.cellZ }, expected,
          approaches: [approach], cost: Number.POSITIVE_INFINITY,
        }});
      }
    }
  }
  const rotated = requests.slice((ctx.clock.tick * 32) % Math.max(1, requests.length)).concat(requests.slice(0, (ctx.clock.tick * 32) % Math.max(1, requests.length))).slice(0, 128);
  const claimByTask = new Map(claims.map((claim) => [claim.task, claim.actor]));
  const routable = rotated.filter(({ actor, candidate }) => !occupied.has(actor) && claimByTask.get(candidate.task) === null);
  const grouped = new Map<string, DigCandidate>();
  for (const { candidate } of routable) {
    const key = `${candidate.worker}\0${candidate.task}`;
    const prior = grouped.get(key);
    if (prior) grouped.set(key, { ...prior, approaches: [...prior.approaches, ...candidate.approaches] });
    else grouped.set(key, candidate);
  }
  const prepared = [...grouped.values()];
  const best = new Map<string, { approach: Vec3 & { readonly frame: null }; cost: number }>();
  const evaluated = new Set<string>();
  const ensureCosts = (candidate: DigCandidate) => {
    const key = `${candidate.worker}\0${candidate.task}`;
    if (evaluated.has(key)) return;
    evaluated.add(key);
    for (let offset = 0; offset < candidate.approaches.length; offset += 32) {
      const batch = candidate.approaches.slice(offset, offset + 32).map((target) => ({ actor: candidate.worker, target }));
      const results = ctx.routeCosts(batch);
      for (let index = 0; index < batch.length; index++) {
        const result = results[index];
        if (result?.status !== "reachable" || !Number.isFinite(result.cost)) continue;
        const prior = best.get(key);
        if (!prior || result.cost < prior.cost) best.set(key, { approach: batch[index].target, cost: result.cost });
      }
    }
  };
  let assigned = new Set<EntityId>();
  return {
    claims,
    candidates: prepared,
    occupiedActors: [...occupied],
    estimate: (candidate) => {
      ensureCosts(candidate);
      return best.get(`${candidate.worker}\0${candidate.task}`)?.cost ?? null;
    },
    apply(assignments) {
      assigned = new Set(assignments.map((assignment) => assignment.task));
      for (const assignment of assignments) {
        const candidate = prepared.find((item) => item.worker === assignment.worker && item.task === assignment.task);
        if (candidate) ensureCosts(candidate);
        const approach = best.get(`${assignment.worker}\0${assignment.task}`)?.approach;
        if (!candidate || !approach) continue;
        const state = orders.find((row) => row.id === candidate.order)?.get(ColonyDigOrder);
        if (!state) continue;
        ctx.write(ColonyDigOrder, candidate.order, { ...state, expected: candidate.expected, actor: candidate.worker, phase: "approaching", reason: "", approachX: approach.x, approachY: approach.y, approachZ: approach.z });
        ctx.action(move(candidate.worker, approach));
      }
    },
    progress() {
      for (const row of activeOrders) {
        const state = row.get(ColonyDigOrder);
        if (assigned.has(row.id)) continue;
        if (!state.actor) continue;
        const pose = positions.get(state.actor);
        if (!pose) continue;
        if (state.phase === "approaching") {
          const failedMove = ctx.outcomes.find((outcome) => {
            if (outcome.action.kind !== "move" || outcome.action.entity !== state.actor || outcome.result.accepted) return false;
            const destination = outcome.action.destination;
            return destination.x === state.approachX && destination.y === state.approachY && destination.z === state.approachZ;
          });
          if (failedMove) {
            ctx.write(ColonyDigOrder, row.id, { ...state, actor: null, phase: "blocked", reason: failedMove.result.reason ?? "movement did not complete" });
            continue;
          }
          if (distance(pose.world, orderPoint(state)) <= 0.05) {
            ctx.write(ColonyDigOrder, row.id, { ...state, phase: "excavating", reason: "" });
            ctx.action(excavate(state.actor, { x: state.cellX, y: state.cellY, z: state.cellZ }, state.expected, air));
          }
        } else if (state.phase === "excavating") {
          const work = ctx.query(query(ExcavationWork)).some((item) => item.id === state.actor);
          const material = ctx.terrainMaterials([[state.cellX, state.cellY, state.cellZ]])[0];
          if (work) continue;
          if (material !== air) {
            const failed = ctx.outcomes.find((outcome) => outcome.action.kind === "excavate" && outcome.action.entity === state.actor && outcome.action.x === state.cellX && outcome.action.y === state.cellY && outcome.action.z === state.cellZ && !outcome.result.accepted);
            ctx.write(ColonyDigOrder, row.id, { ...state, actor: null, phase: "blocked", reason: failed?.result.reason ?? "excavation did not complete" });
            continue;
          }
          // Native completion has already released a finite ground pile. The
          // pile is independently haulable, so the digger is immediately free.
          ctx.removeAuthoredEntity(row.id);
        }
      }
    },
  };
}

function planGroundStockDeliveries(ctx: WriteContext) {
  const pantry = entity("colony.pantry");
  const stockContainers = new Set(ctx.query(query(GroundStock)).map(row => row.id));
  const tasks = ctx.query(query(DeliveryTask));
  const existing = new Set(tasks.map(row => row.get(DeliveryTask).sourceLot));
  const taskIds = new Set(tasks.map(row => row.id));
  for (const row of ctx.query(query(MaterialLot))) {
    const lot = row.get(MaterialLot);
    if (!stockContainers.has(lot.container) || !spoilKinds.has(lot.kind) || lot.quantity <= 0 || existing.has(row.id)) continue;
    const source = lot.container;
    const taskId = entity(`${row.id}.delivery`);
    if (taskIds.has(taskId)) continue;
    ctx.createAuthoredEntity({ id: taskId, components: { [DeliveryTask.id]: {
      actor: null, sourceLot: row.id, source, destination: pantry,
      material: lot.kind, quantity: lot.quantity, phase: "idle",
    }}});
    existing.add(row.id);
    taskIds.add(taskId);
  }
}

export const colonyWorkSystem = createWorkSystem({
  id: "colony.work",
  version: 1,
  reads: [GroundStock, ColonyDigOrder, Worker, Body, Traversal, Position, Container, SealedContainer, ConstructionSite, ConstructionApproach, LotWater, Destination, Support, Surface, MaterialLot, ExcavationWork, DeliveryTask, DeliveryControl],
  writes: [ColonyDigOrder, DeliveryTask, ConstructionApproach],
  providers: [deliveryProvider, digProvider, ctx => constructionWorkProvider(ctx, {
    workers: ctx.query(query(Worker)).filter(row => !row.get(Worker).guest).map(row => row.id),
    catalogMaterials: Object.fromEntries(colonyEnvironment.structures.catalog.map(definition => [
      definition.id, definition.materials.map(({ kind: material, quantity }) => ({ material, quantity })),
    ])),
  })],
});

/** Turns native excavation piles into ordinary shared delivery work. */
export const colonyGroundStockSystem = system({
  id: "colony.ground-stock", version: 1,
  reads: [GroundStock, MaterialLot, DeliveryTask],
  writes: [DeliveryTask],
  run(ctx) {
    const stockContainers = new Set(ctx.query(query(GroundStock)).map(row => row.id));
    for (const row of ctx.query(query(DeliveryTask))) {
      const task = row.get(DeliveryTask);
      if (task.phase === "complete" && stockContainers.has(task.source))
        ctx.removeAuthoredEntity(row.id);
    }
    planGroundStockDeliveries(ctx);
  },
});

export function digOrderId(x: number, y: number, z: number): EntityId {
  return entity(`colony.dig.${x}.${y}.${z}`);
}

export function cancelDigAction(actor: EntityId) { return cancelWork(actor); }

/** Sites request stock through the same finite deliveries as every other task. */
export const colonySupplySystem = system({
  id: "colony.site-supplies", version: 1,
  reads: [ConstructionSite, Emitter, Container, MaterialLot, SealedContainer, DeliveryTask],
  writes: [DeliveryTask],
  run(ctx) {
    const sites = ctx.query(query(ConstructionSite));
    const start = sites.length ? (ctx.clock.tick * 4) % sites.length : 0;
    const active = Array.from({ length: Math.min(3, sites.length) }, (_, offset) => sites[(start + offset) % sites.length]);
    planSiteSupplies(ctx, {
      sourceContainers: [entity("colony.lumber"), entity("colony.pantry")],
      requirements: [...active.flatMap(row => {
        const site = row.get(ConstructionSite);
        const definition = colonyEnvironment.structures.catalog.find(item => item.id === site.catalog);
        return definition ? definition.materials.map(({ kind: material, quantity }) => ({ destination: row.id, material, quantity })) : [];
      }), ...ctx.query(query(Emitter)).slice(0, 8).flatMap(row => {
        const definition = colonyEnvironment.emissions?.find(item => item.id === row.get(Emitter).catalog);
        return definition ? [{ destination: row.id, material: definition.materialKind, quantity: definition.quantity }] : [];
      })],
    });
  },
});
