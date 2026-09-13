import {
  EmissionOrder,
  EmissionWork,
  emissionWorkProvider,
} from "../sdk/emission-work";
import {
  ConstructionApproach,
  constructionWorkProvider,
} from "../sdk/construction-work";
import { DeconstructionApproach, DeconstructionOrder, deconstructionWorkProvider } from "../sdk/deconstruction-work";
import { planSiteSupplies } from "../sdk/site-supplies";
import { StagedProcess, processSupplyPhase } from "../sdk/process-supply";
import { ProcessAttendanceWork, processAttendanceProvider } from "../sdk/process-attendance";
import { waterSupplyProvider, WaterSupplyOrder, WaterSupplyWork } from "./colony-water-work";
import { Worker } from "./colony-components";
import { ConstructionSite, SealedContainer } from "../sdk/construction";
import { component, entity, query } from "../sdk/authoring";
import {
  createWorkSystem,
  type PreparedWorkProvider,
} from "../sdk/work-system";
import {
  deliveryProvider,
  DeliveryControl,
  DeliveryTask,
} from "../sdk/delivery";
import { GroundStock } from "../sdk/ground-stock";
import {
  Emitter,
  Body,
  Container,
  Destination,
  ExcavationWork,
  MaterialLot,
  FiniteResource,
  LotWater,
  Position,
  Support,
  Surface,
  Traversal,
  excavate,
  extractResource,
  move,
  cancelWork,
} from "../sdk/common";
import type { EntityId, Vec3, WorldPose, WriteContext } from "../contracts";
import { colonyEnvironment } from "./colony-environment";
import {
  StockpileCell,
  planStockpileDeliveries,
  type StockpileFilterProfile,
} from "../sdk/stockpile";

/** Give a waiting process one finite field-water demand when its kettle is short.
 * The water order owns only the fetch; ordinary delivery still stages the lot. */
function colonyProcessWaterPhase(ctx: WriteContext): void {
  const facts = ctx.workMaterialFacts();
  const lots = facts.lots;
  const orders = ctx.query(query(WaterSupplyOrder));
  const occupied = new Set(orders.map(row => row.get(WaterSupplyOrder).process).filter((id): id is EntityId => !!id));
  const revision = orders.reduce((max, row) => Math.max(max, row.get(WaterSupplyOrder).revision), 0);
  const processes = ctx.query(query(StagedProcess)).slice().sort((a, b) => a.id.localeCompare(b.id));
  let nextRevision = revision;
  for (const row of processes) {
    const process = row.get(StagedProcess);
    if (process.phase !== "waiting" || occupied.has(row.id)) continue;
    const requirements = ctx.processRequirements(process.definition, process.station);
    const water = requirements.inputs.find(input => input.material === "water");
    if (!water) continue;
    const destination = `${process.station}:${water.port}`;
    const quantity = lots.filter(lot => lot.container === destination && lot.kind === "water" && lot.quantity > 0)
      .reduce((sum, lot) => sum + lot.quantity, 0);
    if (quantity >= water.quantity) continue;
    if (orders.length >= 256 || nextRevision >= 0xffffffff) throw new Error("water demand capacity exhausted");
    nextRevision += 1;
    const id = entity(`colony.water-process.${row.id}`);
    ctx.createAuthoredEntity({ id, components: {
      [WaterSupplyOrder.id]: { revision: nextRevision, process: row.id },
      [WaterSupplyWork.id]: { request: nextRevision, attempt: 0, phase: "queued", actor: null, vessel: null, x: 0, y: 0, z: 0, approachX: 0, approachY: 0, approachZ: 0, reason: "" },
    } });
    occupied.add(row.id);
  }
}
export type ColonyTreePhase = "standing" | "felled" | "chopped";
export const ColonyTree = component<{ phase: ColonyTreePhase }>("colony.tree", {
  version: 1,
  fields: { phase: "string" },
});
export const ColonyTreeOrder = component<{
  tree: EntityId;
  actor: EntityId | null;
  phase: "queued" | "working" | "blocked" | "complete";
  stage: "fell" | "chop";
  seconds: number;
  approachX: number;
  approachY: number;
  approachZ: number;
  reason: string;
}>("colony.tree-order", {
  version: 2,
  fields: {
    tree: "entity",
    actor: "nullable-entity",
    phase: "string",
    stage: "string",
    seconds: "number",
    approachX: "number",
    approachY: "number",
    approachZ: "number",
    reason: "string",
  },
});
export const ColonyTreePolicy = component<{ designated: boolean }>(
  "colony.tree-policy",
  { version: 1, fields: { designated: "boolean" } },
);

export type ColonyDigPhase =
  "queued" | "approaching" | "excavating" | "blocked";
type DigOrder = {
  cellX: number;
  cellY: number;
  cellZ: number;
  expected: number;
  actor: EntityId | null;
  phase: string;
  reason: string;
  approachX: number;
  approachY: number;
  approachZ: number;
};
export const ColonyDigOrder = component<DigOrder>("colony.dig-order", {
  version: 1,
  fields: {
    cellX: "number",
    cellY: "number",
    cellZ: "number",
    expected: "number",
    actor: "nullable-entity",
    phase: "string",
    reason: "string",
    approachX: "number",
    approachY: "number",
    approachZ: "number",
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
const colonyStockpileProfiles: Readonly<
  Record<string, StockpileFilterProfile>
> = {
  wood: {
    materialCategories: { wood: "building" },
    allowedCategories: ["building"],
  },
  food: {
    materialCategories: { bread: "food" },
    allowedCategories: ["food"],
    allowedMaterials: ["bread"],
  },
};
const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function orderPoint(order: {
  approachX: number;
  approachY: number;
  approachZ: number;
}) {
  return {
    x: order.approachX,
    y: order.approachY,
    z: order.approachZ,
    frame: null as null,
  };
}

type TreeCandidate = {
  readonly worker: EntityId;
  readonly task: EntityId;
  readonly tree: EntityId;
  readonly target: Vec3 & { frame: EntityId | null };
  readonly approaches: readonly (Vec3 & { frame: EntityId | null })[];
};
const treeWorkProvider = (
  ctx: WriteContext,
  suspendedActors: ReadonlySet<EntityId>,
): PreparedWorkProvider<TreeCandidate> => {
  const workers = ctx
    .query(query(Worker))
    .filter((row) => !row.get(Worker).guest)
    .map((row) => row.id);
  const trees = ctx.query(
    query(ColonyTree, Position, Container, FiniteResource),
  );
  const orders = ctx.query(query(ColonyTreeOrder));
  const policies = new Map(
    ctx
      .query(query(ColonyTreePolicy))
      .map((row) => [row.id, row.get(ColonyTreePolicy)]),
  );
  for (const orderRow of orders) {
    const state = orderRow.get(ColonyTreeOrder),
      policy = policies.get(state.tree);
    if (!policy || state.phase === "complete") continue;
    if (policy.designated) {
      if (state.phase === "blocked" && state.reason === "Not designated")
        ctx.write(ColonyTreeOrder, orderRow.id, {
          ...state,
          actor: null,
          phase: "queued",
          reason: "Designated",
        });
      continue;
    }
    if (state.actor !== null) ctx.action(cancelWork(state.actor));
    if (state.phase !== "blocked" || state.reason !== "Not designated")
      ctx.write(ColonyTreeOrder, orderRow.id, {
        ...state,
        actor: null,
        phase: "blocked",
        reason: "Not designated",
      });
  }
  const positions = new Map(
    ctx.query(query(Position)).map((row) => [row.id, row.get(Position)]),
  );
  const destinations = new Set(
    ctx.query(query(Destination)).map((row) => row.id),
  );
  const active = new Map(
    orders.map((row) => [
      row.get(ColonyTreeOrder).tree,
      { id: row.id, state: row.get(ColonyTreeOrder) },
    ]),
  );
  const poses = new Map(
    ctx
      .worldPoses([...new Set([...workers, ...trees.map((row) => row.id)])])
      .map((p) => [p.id, p]),
  );
  const candidates = trees.flatMap((row) => {
    const tree = row.get(ColonyTree),
      order = active.get(row.id);
    if (
      !order ||
      !policies.get(row.id)?.designated ||
      order.state.phase !== "queued" ||
      (order.state.stage === "fell" && tree.phase !== "standing") ||
      (order.state.stage === "chop" && tree.phase !== "felled")
    )
      return [];
    const pose = poses.get(row.id),
      position = positions.get(row.id);
    if (!pose || !position) return [];
    const approaches = [
      { x: position.x + 1, y: position.y, z: position.z },
      { x: position.x - 1, y: position.y, z: position.z },
      { x: position.x, y: position.y, z: position.z + 1 },
      { x: position.x, y: position.y, z: position.z - 1 },
    ];
    return workers
      .filter(
        (worker) =>
          !suspendedActors.has(worker) &&
          poses.get(worker)?.support === pose.support,
      )
      .flatMap((worker) => {
        const targets = approaches.map((target) => ({
          ...target,
          frame: pose.support,
        }));
        return [
          {
            worker,
            task: order.id,
            tree: row.id,
            target: targets[0],
            approaches: targets,
          },
        ];
      });
  });
  const occupiedActors = orders.flatMap((row) => {
    const state = row.get(ColonyTreeOrder);
    return state.phase === "working" && state.actor ? [state.actor] : [];
  });
  const claimed = orders.map((row) => ({
    task: row.id,
    actor: row.get(ColonyTreeOrder).actor,
  }));
  const assigned = new Set<EntityId>();
  const selectedApproaches = new Map<string, TreeCandidate["target"]>();
  return {
    claims: claimed,
    occupiedActors,
    candidates,
    lowerBound: (candidate) => {
      const actor = poses.get(candidate.worker)?.local;
      return actor
        ? Math.min(
            ...candidate.approaches.map((target) => distance(actor, target)),
          )
        : 0;
    },
    estimate: (candidate) => {
      const result = ctx.routeToAny({
        actor: candidate.worker,
        targets: candidate.approaches,
      });
      if (result.status !== "reachable") return null;
      selectedApproaches.set(
        `${candidate.worker}\0${candidate.task}`,
        candidate.approaches[result.targetIndex],
      );
      return result.cost;
    },
    apply: (assignments) => {
      for (const assignment of assignments) {
        const candidate = candidates.find(
          (item) =>
            item.worker === assignment.worker && item.task === assignment.task,
        );
        if (!candidate) continue;
        assigned.add(assignment.task);
        const target =
          selectedApproaches.get(`${candidate.worker}\0${candidate.task}`) ??
          candidate.target;
        ctx.write(ColonyTreeOrder, candidate.task, {
          tree: candidate.tree,
          actor: candidate.worker,
          phase: "working",
          stage: active.get(candidate.tree)!.state.stage,
          seconds: 0,
          approachX: target.x,
          approachY: target.y,
          approachZ: target.z,
          reason: "",
        });
        ctx.action(move(candidate.worker, target));
      }
    },
    progress: () => {
      for (const row of orders) {
        const order = row.get(ColonyTreeOrder),
          treeRow = trees.find((tree) => tree.id === order.tree);
        if (!treeRow) {
          if (order.actor !== null)
            ctx.write(ColonyTreeOrder, row.id, {
              ...order,
              actor: null,
              phase: "blocked",
              reason: "Tree unavailable",
            });
          continue;
        }
        if (order.actor === null || assigned.has(row.id)) continue;
        if (order.phase === "blocked" && order.reason === "Extracting") {
          const accepted = ctx.outcomes.find(
            (outcome) =>
              outcome.action.kind === "extract-resource" &&
              outcome.action.source === order.tree,
          );
          if (
            accepted?.result.accepted ||
            treeRow.get(FiniteResource).quantity === 0
          ) {
            ctx.write(ColonyTree, treeRow.id, { phase: "chopped" });
            ctx.write(ColonyTreeOrder, row.id, {
              ...order,
              actor: null,
              phase: "complete",
              reason: "",
            });
          } else if (accepted && !accepted.result.accepted) {
            ctx.write(ColonyTreeOrder, row.id, {
              ...order,
              actor: null,
              reason: accepted.result.reason ?? "Extraction refused",
            });
          }
          continue;
        }
        if (order.phase !== "working") continue;
        const rejected = ctx.outcomes.some(
          (outcome) =>
            outcome.action.kind === "move" &&
            outcome.action.entity === order.actor &&
            outcome.action.destination.x === order.approachX &&
            outcome.action.destination.z === order.approachZ &&
            !outcome.result.accepted,
        );
        if (rejected) {
          ctx.write(ColonyTreeOrder, row.id, {
            ...order,
            actor: null,
            phase: "blocked",
            reason: "Adjacent approach unreachable",
          });
          continue;
        }
        const position = positions.get(order.tree),
          pose = poses.get(order.tree),
          actorPose = poses.get(order.actor);
        if (!position || !pose || !actorPose) {
          ctx.write(ColonyTreeOrder, row.id, {
            ...order,
            actor: null,
            phase: "blocked",
            reason: "Tree contact unavailable",
          });
          continue;
        }
        if (destinations.has(order.actor)) continue;
        if (
          Math.hypot(
            actorPose.world.x - position.x,
            actorPose.world.z - position.z,
          ) > 1.5
        ) {
          ctx.action(
            move(order.actor, {
              x: order.approachX,
              y: order.approachY,
              z: order.approachZ,
              frame: pose.support,
            }),
          );
          continue;
        }
        const total = order.stage === "fell" ? 3 : 2;
        const next = Math.min(
          total,
          order.seconds + Math.max(0, ctx.clock.delta),
        );
        if (next < total) {
          ctx.write(ColonyTreeOrder, row.id, { ...order, seconds: next });
          continue;
        }
        if (order.stage === "fell") {
          ctx.write(ColonyTree, treeRow.id, { phase: "felled" });
          ctx.write(ColonyTreeOrder, row.id, {
            ...order,
            actor: null,
            phase: "queued",
            stage: "chop",
            seconds: 0,
            reason: "Ready to chop",
          });
          continue;
        }
        ctx.action(extractResource(order.actor, treeRow.id));
        ctx.write(ColonyTreeOrder, row.id, {
          ...order,
          phase: "blocked",
          reason: "Extracting",
        });
      }
    },
  };
};

/** Reconcile one claimed order with native movement/work; never settle cargo. */
function progressClaimedDig(
  ctx: WriteContext,
  id: EntityId,
  state: DigOrder,
  position: Vec3,
) {
  if (state.actor === null) return;
  if (state.phase === "approaching") {
    const failedMove = ctx.outcomes.find((outcome) => {
      if (
        outcome.action.kind !== "move" ||
        outcome.action.entity !== state.actor ||
        outcome.result.accepted
      )
        return false;
      const destination = outcome.action.destination;
      return (
        destination.x === state.approachX &&
        destination.y === state.approachY &&
        destination.z === state.approachZ
      );
    });
    if (failedMove) {
      ctx.write(ColonyDigOrder, id, {
        ...state,
        actor: null,
        phase: "blocked",
        reason: failedMove.result.reason ?? "movement did not complete",
      });
      return;
    }
    if (distance(position, orderPoint(state)) <= 0.05) {
      ctx.write(ColonyDigOrder, id, {
        ...state,
        phase: "excavating",
        reason: "",
      });
      ctx.action(
        excavate(
          state.actor,
          { x: state.cellX, y: state.cellY, z: state.cellZ },
          state.expected,
          air,
        ),
      );
    } else {
      const supportY = Math.round(state.approachY / verticalMetres - 0.5);
      const [support, clearance] = ctx.terrainMaterials([
        [Math.round(state.approachX), supportY, Math.round(state.approachZ)],
        [
          Math.round(state.approachX),
          supportY + 1,
          Math.round(state.approachZ),
        ],
      ]);
      if (support === air || clearance !== air) {
        ctx.write(ColonyDigOrder, id, {
          ...state,
          actor: null,
          phase: "queued",
          reason: "Approach changed",
        });
        return;
      }
      // Move owns route repair.  Reissuing the same destination is idempotent
      // while its route is healthy, and asks the native owner to rebuild when
      // topology invalidation left the retained terrain route waiting.
      ctx.action(move(state.actor, orderPoint(state)));
    }
  } else if (state.phase === "excavating") {
    if (
      ctx.query(query(ExcavationWork)).some((item) => item.id === state.actor)
    )
      return;
    const material = ctx.terrainMaterials([
      [state.cellX, state.cellY, state.cellZ],
    ])[0];
    if (material !== air) {
      const failed = ctx.outcomes.find(
        (outcome) =>
          outcome.action.kind === "excavate" &&
          outcome.action.entity === state.actor &&
          outcome.action.x === state.cellX &&
          outcome.action.y === state.cellY &&
          outcome.action.z === state.cellZ &&
          !outcome.result.accepted,
      );
      ctx.write(ColonyDigOrder, id, {
        ...state,
        actor: null,
        phase: "blocked",
        reason: failed?.result.reason ?? "excavation did not complete",
      });
      return;
    }
    // Rust already released the finite ground pile. Hauling is independent.
    ctx.removeAuthoredEntity(id);
  }
}

function digApproaches(
  state: Pick<DigOrder, "cellX" | "cellY" | "cellZ">,
  designatedCells: ReadonlySet<string>,
): readonly (Vec3 & { readonly frame: null })[] {
  const horizontal = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;
  const vertical = [-2, -1, 0, 1] as const;
  return horizontal.flatMap(([dx, dz]) =>
    vertical.flatMap((dy) => {
      const x = state.cellX + dx;
      const y = state.cellY + dy;
      const z = state.cellZ + dz;
      return designatedCells.has(`${x},${y},${z}`)
        ? []
        : [{ x, y: (y + 0.5) * verticalMetres, z, frame: null }];
    }),
  );
}

type DigCandidateFacts = {
  readonly workers: ReadonlySet<EntityId>;
  readonly bodies: ReadonlySet<EntityId>;
  readonly positions: ReadonlyMap<EntityId, WorldPose>;
  readonly occupied: ReadonlySet<EntityId>;
  readonly designatedCells: ReadonlySet<string>;
  readonly standingCells: ReadonlySet<string>;
};

function candidatesForDigOrder(
  order: EntityId,
  state: DigOrder,
  material: number | undefined,
  facts: DigCandidateFacts,
): readonly DigCandidate[] {
  const cellKey = `${state.cellX},${state.cellY},${state.cellZ}`;
  if (
    state.actor !== null ||
    facts.standingCells.has(cellKey) ||
    material === undefined ||
    material === air
  )
    return [];
  const expected = state.expected >= 0 ? state.expected : material;
  if (material !== expected) return [];
  const approaches = digApproaches(state, facts.designatedCells);
  if (!approaches.length) return [];
  return [...facts.workers]
    .filter(
      (worker) =>
        !facts.occupied.has(worker) &&
        facts.positions.has(worker) &&
        facts.bodies.has(worker),
    )
    .map((worker) => ({
      worker,
      task: order,
      order,
      cell: { x: state.cellX, y: state.cellY, z: state.cellZ },
      expected,
      approaches,
      cost: Number.POSITIVE_INFINITY,
    }));
}

function digProvider(
  ctx: WriteContext,
  suspendedActors: ReadonlySet<EntityId>,
): PreparedWorkProvider<DigCandidate> {
  const orders = ctx.query(query(ColonyDigOrder));
  const workers = new Set(
    ctx
      .query(query(Worker))
      .filter((row) => !row.get(Worker).guest)
      .map((row) => row.id),
  );
  const bodies = new Set(ctx.query(query(Body)).map((row) => row.id));
  const positions = new Map(
    ctx.worldPoses([...bodies.keys()]).map((pose) => [pose.id, pose]),
  );
  const supported = new Set(ctx.query(query(Support)).map((row) => row.id));
  // Scheduling eligibility only: the native excavation owner still checks
  // occupied support at admission and completion, including movement races.
  const standingCells = new Set(
    [...positions.values()]
      // Idle workers standing on a designation are eligible to take that job:
      // assignment first moves them to a legal approach. Non-workers remain a
      // physical obstruction until they leave.
      .filter((pose) => !supported.has(pose.id) && !workers.has(pose.id))
      .map(
        (pose) =>
          `${Math.round(pose.world.x)},${Math.round(pose.world.y / verticalMetres - 0.5)},${Math.round(pose.world.z)}`,
      ),
  );
  const obstructed = (state: { cellX: number; cellY: number; cellZ: number }) =>
    standingCells.has(`${state.cellX},${state.cellY},${state.cellZ}`);
  const excavating = new Set(
    ctx.query(query(ExcavationWork)).map((row) => row.id),
  );
  const deliveries = ctx
    .query(query(DeliveryTask))
    .map((row) => row.get(DeliveryTask));
  const occupied = new Set<EntityId>([
    ...excavating,
    ...ctx.query(query(ConstructionSite)).flatMap((row) => {
      const site = row.get(ConstructionSite);
      return site.worker === null ? [] : [site.worker];
    }),
    ...deliveries.flatMap((task) => (task.actor ? [task.actor] : [])),
  ]);
  const claims = orders.map((row) => ({
    task: row.id,
    actor: row.get(ColonyDigOrder).actor,
  }));

  // Keep every order claimed, but only inspect a rotating bounded window.  The
  // native terrain APIs have their own input bounds and old orders must not
  // make one tick exceed them.
  const windowSize = Math.min(128, orders.length);
  const windowStart = orders.length ? (ctx.clock.tick * 32) % orders.length : 0;
  const activeOrders = orders.length
    ? Array.from(
        { length: windowSize },
        (_, index) => orders[(windowStart + index) % orders.length],
      )
    : [];
  const cells = activeOrders.map((row) => {
    const state = row.get(ColonyDigOrder);
    return [state.cellX, state.cellY, state.cellZ] as [number, number, number];
  });
  const materials = cells.length ? ctx.terrainMaterials(cells) : [];
  const currentMaterial = new Map(
    activeOrders.map((row, index) => [row.id, materials[index]]),
  );
  const designatedCells = new Set(
    activeOrders.map((row) => {
      const state = row.get(ColonyDigOrder);
      return `${state.cellX},${state.cellY},${state.cellZ}`;
    }),
  );
  // Candidate discovery is three-dimensional. Native navigation filters
  // nearby supports by actual material, clearance, obstacles and excavation
  // reach; a top-surface-per-column projection would hide caves.
  const candidateFacts: DigCandidateFacts = {
    workers,
    bodies,
    positions,
    occupied,
    designatedCells,
    standingCells,
  };
  const candidates = activeOrders.flatMap((row) =>
    candidatesForDigOrder(
      row.id,
      row.get(ColonyDigOrder),
      currentMaterial.get(row.id),
      candidateFacts,
    ),
  );
  const claimByTask = new Map(claims.map((claim) => [claim.task, claim.actor]));
  const prepared = candidates.filter(
    (candidate) =>
      !occupied.has(candidate.worker) &&
      claimByTask.get(candidate.task) === null,
  );
  const best = new Map<
    string,
    { approach: Vec3 & { readonly frame: null }; cost: number }
  >();
  const evaluated = new Set<string>();
  const ensureCosts = (candidate: DigCandidate) => {
    const key = `${candidate.worker}\0${candidate.task}`;
    if (evaluated.has(key)) return;
    evaluated.add(key);
    const result = ctx.routeToAny({
      actor: candidate.worker,
      targets: candidate.approaches,
      excavationTarget: [candidate.cell.x, candidate.cell.y, candidate.cell.z],
    });
    if (result.status === "reachable")
      best.set(key, {
        approach: candidate.approaches[result.targetIndex],
        cost: result.cost,
      });
  };
  let assigned = new Set<EntityId>();
  return {
    claims,
    candidates: prepared,
    occupiedActors: [...occupied],
    lowerBound: (candidate) => {
      const actor = positions.get(candidate.worker)?.world;
      return actor
        ? Math.min(
            ...candidate.approaches.map((approach) =>
              distance(actor, approach),
            ),
          )
        : 0;
    },
    estimate: (candidate) => {
      ensureCosts(candidate);
      return best.get(`${candidate.worker}\0${candidate.task}`)?.cost ?? null;
    },
    apply(assignments) {
      assigned = new Set(assignments.map((assignment) => assignment.task));
      for (const assignment of assignments) {
        const candidate = prepared.find(
          (item) =>
            item.worker === assignment.worker && item.task === assignment.task,
        );
        if (candidate) ensureCosts(candidate);
        const approach = best.get(
          `${assignment.worker}\0${assignment.task}`,
        )?.approach;
        if (!candidate || !approach) continue;
        const state = orders
          .find((row) => row.id === candidate.order)
          ?.get(ColonyDigOrder);
        if (!state) continue;
        ctx.write(ColonyDigOrder, candidate.order, {
          ...state,
          expected: candidate.expected,
          actor: candidate.worker,
          phase: "approaching",
          reason: "",
          approachX: approach.x,
          approachY: approach.y,
          approachZ: approach.z,
        });
        ctx.action(move(candidate.worker, approach));
      }
    },
    progress() {
      for (const row of activeOrders) {
        const state = row.get(ColonyDigOrder);
        if (state.actor !== null && suspendedActors.has(state.actor)) continue;
        if (obstructed(state)) {
          if (state.actor && excavating.has(state.actor))
            ctx.action(cancelWork(state.actor));
          if (
            state.actor !== null ||
            state.phase !== "blocked" ||
            state.reason !== "Someone is standing on this tile"
          ) {
            ctx.write(ColonyDigOrder, row.id, {
              ...state,
              actor: null,
              phase: "blocked",
              reason: "Someone is standing on this tile",
            });
          }
          continue;
        }
        if (assigned.has(row.id)) continue;
        if (!state.actor) continue;
        const pose = positions.get(state.actor);
        if (!pose) continue;
        progressClaimedDig(ctx, row.id, state, pose.world);
      }
    },
  };
}

function planGroundStockDeliveries(ctx: WriteContext) {
  const pantry = entity("colony.pantry");
  const stockContainers = new Set(
    ctx.query(query(GroundStock)).map((row) => row.id),
  );
  const tasks = ctx.query(query(DeliveryTask));
  const existing = new Set(tasks.map((row) => row.get(DeliveryTask).sourceLot));
  const taskIds = new Set(tasks.map((row) => row.id));
  for (const row of ctx.query(query(MaterialLot))) {
    const lot = row.get(MaterialLot);
    if (
      !stockContainers.has(lot.container) ||
      !spoilKinds.has(lot.kind) ||
      lot.quantity <= 0 ||
      existing.has(row.id)
    )
      continue;
    const source = lot.container;
    const taskId = entity(`${row.id}.delivery`);
    if (taskIds.has(taskId)) continue;
    ctx.createAuthoredEntity({
      id: taskId,
      components: {
        [DeliveryTask.id]: {
          actor: null,
          sourceLot: row.id,
          source,
          destination: pantry,
          material: lot.kind,
          quantity: lot.quantity,
          phase: "idle",
        },
      },
    });
    existing.add(row.id);
    taskIds.add(taskId);
  }
}

export function colonyGroundStockPhase(ctx: WriteContext) {
  const stockContainers = new Set(
    ctx.query(query(GroundStock)).map((row) => row.id),
  );
  for (const row of ctx.query(query(DeliveryTask))) {
    const task = row.get(DeliveryTask);
    if (task.phase === "complete" && stockContainers.has(task.source))
      ctx.removeAuthoredEntity(row.id);
  }
  planGroundStockDeliveries(ctx);
}

function colonySiteSuppliesPhase(ctx: WriteContext) {
  const sites = ctx.query(query(ConstructionSite));
  const start = sites.length ? (ctx.clock.tick * 4) % sites.length : 0;
  const active = Array.from(
    { length: Math.min(3, sites.length) },
    (_, offset) => sites[(start + offset) % sites.length],
  );
  planSiteSupplies(ctx, {
    sourceContainers: [entity("colony.lumber"), entity("colony.pantry")],
    batchQuantity: 3,
    requirements: [
      ...active.flatMap((row) => {
        const site = row.get(ConstructionSite);
        const definition = colonyEnvironment.structures.catalog.find(
          (item) => item.id === site.catalog,
        );
        return definition
          ? definition.materials.map(({ kind: material, quantity }) => ({
              destination: row.id,
              material,
              quantity,
            }))
          : [];
      }),
      ...ctx
        .query(query(Emitter, EmissionOrder))
        .filter((row) => row.get(EmissionOrder).enabled)
        .slice(0, 8)
        .flatMap((row) => {
          const definition = colonyEnvironment.emissions?.find(
            (item) => item.id === row.get(Emitter).catalog,
          );
          return definition
            ? [
                {
                  destination: row.id,
                  material: definition.materialKind,
                  quantity: definition.quantity,
                },
              ]
            : [];
        }),
    ],
  });
}

const emissionRequirements = new Map(
  (colonyEnvironment.emissions ?? []).map((definition) => [
    definition.id,
    definition,
  ]),
);

export const colonyWorkSystem = createWorkSystem({
  id: "colony.work",
  version: 1,
  reads: [
    EmissionOrder,
    EmissionWork,
    Emitter,
    GroundStock,
    StockpileCell,
    ColonyDigOrder,
    ColonyTree,
    ColonyTreeOrder,
    ColonyTreePolicy,
    FiniteResource,
    Worker,
    Body,
    Traversal,
    Position,
    Container,
    SealedContainer,
    ConstructionSite,
    ConstructionApproach,
    DeconstructionApproach,
    DeconstructionOrder,
    LotWater,
    Destination,
    Support,
    Surface,
    MaterialLot,
    StagedProcess,
    ProcessAttendanceWork,
    ExcavationWork,
    DeliveryTask,
    DeliveryControl,
    WaterSupplyOrder,
    WaterSupplyWork,
  ],
  writes: [
    EmissionWork,
    ColonyDigOrder,
    ColonyTree,
    ColonyTreeOrder,
    MaterialLot,
    DeliveryTask,
    ConstructionApproach,
    DeconstructionApproach,
    DeconstructionOrder,
    WaterSupplyWork,
    ProcessAttendanceWork,
  ],
  phases: [
    colonyProcessWaterPhase,
    processSupplyPhase,
    colonySiteSuppliesPhase,
    colonyGroundStockPhase,
    (ctx) =>
      planStockpileDeliveries(ctx, { filterProfiles: colonyStockpileProfiles }),
  ],
  providers: [
    deliveryProvider,
    digProvider,
    (ctx, suspendedActors) => treeWorkProvider(ctx, suspendedActors),
    (ctx, suspendedActors) =>
      constructionWorkProvider(
        ctx,
        {
          workers: ctx
            .query(query(Worker))
            .filter((row) => !row.get(Worker).guest)
            .map((row) => row.id),
        },
        suspendedActors,
      ),
    (ctx, suspendedActors) =>
      deconstructionWorkProvider(ctx, ctx.query(query(Worker)).filter((row) => !row.get(Worker).guest).map((row) => row.id), suspendedActors),
    (ctx, suspendedActors) =>
    emissionWorkProvider(
        ctx,
        ctx
          .query(query(Worker))
          .filter((row) => !row.get(Worker).guest)
          .map((row) => row.id),
        emissionRequirements,
        suspendedActors,
      ),
    (ctx, suspendedActors) => waterSupplyProvider(ctx, suspendedActors),
    (ctx, suspendedActors) => processAttendanceProvider(ctx, ctx.query(query(Worker)).filter((row) => !row.get(Worker).guest).map((row) => row.id), suspendedActors),
  ],
});

/** Turns native excavation piles into ordinary shared delivery work. */
export function digOrderId(x: number, y: number, z: number): EntityId {
  return entity(`colony.dig.${x}.${y}.${z}`);
}

export function cancelDigAction(actor: EntityId) {
  return cancelWork(actor);
}

/** Sites request stock through the same finite deliveries as every other task. */
