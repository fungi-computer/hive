import { constructionWorkProvider } from "../sdk/construction-work";
import { DeconstructionOrder, deconstructionWorkProvider } from "../sdk/deconstruction-work";
import { planSiteSupplies } from "../sdk/site-supplies";
import { StagedProcess, processSupplyPhase } from "../sdk/process-supply";
import { processAttendanceProvider } from "../sdk/process-attendance";
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
  Body,
  Container,
  Destination,
  ExcavationWork,
  MaterialLot,
  FiniteResource,
  ResourceSite,
  LotWater,
  Position,
  Support,
  Surface,
  Traversal,
  move,
  cancelWork,
} from "../sdk/common";
import type { EntityId, QueryRow, Vec3, WorldPose, WriteContext } from "../contracts";
import { colonyEnvironment } from "./colony-environment";
import { OwnedByParty, PartyMember } from "../sdk/party";
import { acknowledgeWorkAttempt, beginRouteWorkAttempt, continueFieldWaterWorkAttempt, continueResourceEstablishWorkAttempt, continueResourceExtractWorkAttempt, continueResourceTendWorkAttempt, continueDeconstructionWorkAttempt, continueExcavationWorkAttempt, interruptWorkAttempt, workAttempt } from "../sdk/work-attempt";

export type ColonyResourceStage = "sow" | "tend" | "harvest";
export type ColonyResourceStatus = "queued" | "blocked" | "complete";
type ColonyResourceOrderState = {
  definition: string; cellX: number; cellY: number; cellZ: number; site: EntityId;
  stage: ColonyResourceStage; status: ColonyResourceStatus; workSeconds: number; reason: string;
};
export const ColonyResourceOrder = component<ColonyResourceOrderState>("colony.resource-order", { version: 2, fields: {
  definition: "string", cellX: "number", cellY: "number", cellZ: "number", site: "entity", stage: "string", status: "string", workSeconds: "number", reason: "string",
} });

type ResourceOrderRow = QueryRow<ColonyResourceOrderState>;
type ResourceDefinition = NonNullable<typeof colonyEnvironment.resourceSites>[number];
type ResourceCandidate = {
  readonly worker: EntityId;
  readonly task: EntityId;
  readonly vessel?: EntityId;
  readonly approaches: readonly { readonly x: number; readonly y: number; readonly z: number; readonly frame: EntityId | null }[];
};

/** Shared finite tended-resource work owner. It emits only native physical actions. */
export function resourceWorkProvider(ctx: WriteContext, suspendedActors: ReadonlySet<EntityId>): PreparedWorkProvider<ResourceCandidate> {
  const nativeOrders = [...ctx.query(query(ColonyResourceOrder))].sort((a, b) => a.id.localeCompare(b.id));
  const nativeSites = new Map(ctx.query(query(ResourceSite)).map(row => [row.id, row.get(ResourceSite)]));
  const nativeDefinitions = new Map(colonyEnvironment.resourceSites?.map(definition => [definition.id, definition]) ?? []);
  const nativeOwners = new Map(ctx.query(query(OwnedByParty)).map(row => [row.id, row.get(OwnedByParty).party]));
  const nativeMembers = new Map(ctx.query(query(PartyMember)).map(row => [row.id, row.get(PartyMember).party]));
  const nativeWorkers = ctx.query(query(Worker, Body, Position)).filter(row => !row.get(Worker).guest && !suspendedActors.has(row.id));
  const nativeAttempts = new Map((ctx.workAttempts?.(nativeOrders.map(row => row.id)) ?? []).map(attempt => [attempt.key.task, attempt]));
  const nativeFacts = ctx.workMaterialFacts();
  const nativePails = new Map<EntityId, EntityId>(nativeFacts.lots.filter(lot => lot.kind === "pail" && nativeWorkers.some(worker => worker.id === lot.container)).map(lot => [lot.container, lot.id]));
  const nativeCandidates: ResourceCandidate[] = [];
  for (const row of nativeOrders) {
    if (nativeAttempts.has(row.id)) continue;
    const state = row.get(ColonyResourceOrder), site = nativeSites.get(state.site), definition = nativeDefinitions.get(state.definition), party = nativeOwners.get(row.id);
    const stage = site && definition ? (site.stage >= definition.stages.length ? "harvest" : "tend") : "sow";
    const retryBlocked = state.status === "blocked" && ctx.clock.tick % 8 === 0;
    if (!definition || !party || (state.status !== "queued" && !retryBlocked)) continue;
    if (stage !== "sow" && !site) continue;
    if (stage !== "sow" && stage !== "harvest" && site!.nextDue > ctx.clock.now) continue;
    for (const worker of nativeWorkers) {
      if (nativeMembers.get(worker.id) !== party || (stage === "tend" && !nativePails.has(worker.id))) continue;
      nativeCandidates.push({ worker: worker.id, task: row.id, vessel: nativePails.get(worker.id), approaches: [{ x: state.cellX + 1, y: (state.cellY + 0.5) * colonyEnvironment.world.verticalMetres, z: state.cellZ, frame: null }] });
    }
  }
  const nativePoses = new Map((nativeWorkers.length ? ctx.worldPoses(nativeWorkers.map(row => row.id)) : []).map(pose => [pose.id, pose.local]));
  const nativeSelected = new Map<string, ResourceCandidate["approaches"][number]>();
  return {
    claims: nativeOrders.filter(row => nativeAttempts.has(row.id)).map(row => ({ task: row.id, actor: nativeAttempts.get(row.id)?.worker ?? null })),
    candidates: nativeCandidates,
    lowerBound: candidate => { const pose = nativePoses.get(candidate.worker), target = candidate.approaches[0]; return pose ? Math.hypot(pose.x - target.x, pose.z - target.z) : Number.POSITIVE_INFINITY; },
    estimate: candidate => { const result = ctx.routeToAny({ actor: candidate.worker, targets: candidate.approaches }); if (result.status !== "reachable") return null; nativeSelected.set(`${candidate.task}\0${candidate.worker}`, candidate.approaches[result.targetIndex]); return result.cost; },
    apply: assignments => { for (const assignment of assignments) { const candidate = nativeCandidates.find(item => item.task === assignment.task && item.worker === assignment.worker), party = nativeOwners.get(assignment.task); if (!candidate || !party) continue; beginRouteWorkAttempt(ctx, assignment.task, assignment.worker, party, nativeSelected.get(`${assignment.task}\0${assignment.worker}`) ?? candidate.approaches[0]); } },
    progress: () => { for (const row of nativeOrders) { const attempt = nativeAttempts.get(row.id); if (!attempt || attempt.phase.kind !== "outcome") continue; const state = row.get(ColonyResourceOrder), phase = attempt.phase, definition = nativeDefinitions.get(state.definition), site = nativeSites.get(state.site), stage = site && definition ? (site.stage >= definition.stages.length ? "harvest" : "tend") : state.stage; if (suspendedActors.has(attempt.worker) && (phase.result.kind !== "completed" || phase.activity.kind === "route")) { ctx.write(ColonyResourceOrder, row.id, { ...state, status: "blocked", reason: "Drafted" }); acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence); continue; } if (phase.result.kind !== "completed") { ctx.write(ColonyResourceOrder, row.id, { ...state, status: "blocked", reason: phase.result.kind === "blocked" ? phase.result.reason : phase.result.cause }); acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence); continue; } if (phase.activity.kind === "route") { const cell = [state.cellX, state.cellY, state.cellZ] as const, vessel = nativePails.get(attempt.worker); if (stage === "sow") continueResourceEstablishWorkAttempt(ctx, attempt.key, phase.operation.sequence, state.site, state.definition, cell); else if (stage === "tend" && vessel) continueResourceTendWorkAttempt(ctx, attempt.key, phase.operation.sequence, state.site, vessel); else if (stage === "harvest") continueResourceExtractWorkAttempt(ctx, attempt.key, phase.operation.sequence, state.site); else { ctx.write(ColonyResourceOrder, row.id, { ...state, status: "blocked", reason: "worker unavailable" }); acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence); } } else if (phase.activity.kind === "resource-extract") { ctx.write(ColonyResourceOrder, row.id, { ...state, status: "complete", reason: "", workSeconds: 0 }); acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence); } else if (phase.activity.kind === "resource-establish" || phase.activity.kind === "resource-tend") { ctx.write(ColonyResourceOrder, row.id, { ...state, stage: "tend", status: "queued", reason: "", workSeconds: 0 }); acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence); } } },
  };
}

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
  const orders = ctx.query(query(WaterSupplyOrder, WaterSupplyWork));
  const deliveries = ctx.query(query(DeliveryTask)).map(row => row.get(DeliveryTask));
  const ordersByProcess = new Map<EntityId, typeof orders>();
  for (const order of orders) {
    const process = order.get(WaterSupplyOrder).process;
    if (process) ordersByProcess.set(process, [...(ordersByProcess.get(process) ?? []), order]);
  }
  const revision = orders.reduce((max, row) => Math.max(max, row.get(WaterSupplyOrder).revision), 0);
  const processes = ctx.query(query(StagedProcess)).slice().sort((a, b) => a.id.localeCompare(b.id));
  let nextRevision = revision;
  for (const row of processes) {
    const process = row.get(StagedProcess);
    if (process.phase !== "waiting") continue;
    const requirements = ctx.processRequirements(process.definition, process.station);
    const water = requirements.inputs.find(input => input.material === "water");
    if (!water) continue;
    const destination = `${process.station}:${water.port}`;
    const quantity = lots.filter(lot => lot.container === destination && lot.kind === "water" && lot.quantity > 0)
      .reduce((sum, lot) => sum + lot.quantity, 0);
    const inFlight = deliveries.filter(task =>
      task.custody !== "delivered" && task.destination === destination && task.material === "water"
    ).reduce((sum, task) => sum + task.quantity, 0);
    const existing = ordersByProcess.get(row.id) ?? [];
    if (quantity + inFlight >= water.quantity) {
      for (const order of existing)
        if (order.get(WaterSupplyWork).phase === "queued") ctx.removeAuthoredEntity(order.id);
      continue;
    }
    if (existing.length) continue;
    if (orders.length >= 256 || nextRevision >= 0xffffffff) throw new Error("water demand capacity exhausted");
    nextRevision += 1;
    // The supplied/in-flight amount is part of the durable demand identity.
    // A multi-portion requirement therefore cannot reuse the first fetch's
    // accepted operation receipt for a later portion.
    const id = entity(`colony.water-process.${row.id}.${quantity + inFlight}`);
    const owner = ctx.query(query(OwnedByParty)).find(candidate => candidate.id === row.id)?.get(OwnedByParty);
    ctx.createAuthoredEntity({ id, components: {
      [WaterSupplyOrder.id]: { revision: nextRevision, process: row.id, party: owner?.party ?? null },
      [WaterSupplyWork.id]: { request: nextRevision, phase: "queued", x: 0, y: 0, z: 0, reason: "" },
    } }, owner ? { kind: "party", party: owner.party } : { kind: "host" });
    ordersByProcess.set(row.id, []);
  }
}
export type ColonyTreePhase = "standing" | "felled" | "chopped";
export const ColonyTree = component<{ phase: ColonyTreePhase }>("colony.tree", {
  version: 1,
  fields: { phase: "string" },
});
type TreeOrderState = {
  tree: EntityId;
  phase: "queued" | "working" | "blocked" | "complete";
  stage: "fell" | "chop";
  seconds: number;
  reason: string;
};
export const ColonyTreeOrder = component<TreeOrderState>("colony.tree-order", {
  version: 3,
  fields: {
    tree: "entity",
    phase: "string",
    stage: "string",
    seconds: "number",
    reason: "string",
  },
});
export const ColonyTreePolicy = component<{ designated: boolean }>(
  "colony.tree-policy",
  { version: 1, fields: { designated: "boolean" } },
);

type DigOrder = {
  cellX: number;
  cellY: number;
  cellZ: number;
  expected: number;
  status: "queued" | "blocked";
  reason: string;
};
export const ColonyDigOrder = component<DigOrder>("colony.dig-order", {
  version: 2,
  fields: {
    cellX: "number",
    cellY: "number",
    cellZ: "number",
    expected: "number",
    status: "string",
    reason: "string",
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
    materialCategories: { bread: "food", malt: "brewing", mugwort: "brewing" },
    allowedCategories: ["food", "brewing"],
  },
  spoil: {
    materialCategories: { "soil-spoil": "raw", "stone-spoil": "raw" },
    allowedCategories: ["raw"],
  },
};
const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

type TreeCandidate = {
  readonly worker: EntityId;
  readonly task: EntityId;
  readonly tree: EntityId;
  readonly target: Vec3 & { frame: EntityId | null };
  readonly approaches: readonly (Vec3 & { frame: EntityId | null })[];
};
export const treeWorkProvider = (
  ctx: WriteContext,
  suspendedActors: ReadonlySet<EntityId>,
): PreparedWorkProvider<TreeCandidate> => {
  const workers = ctx.query(query(Worker, Body, Position)).filter(row => !row.get(Worker).guest).map(row => row.id);
  const memberships = new Map(ctx.query(query(PartyMember)).map(row => [row.id, row.get(PartyMember).party]));
  const trees = ctx.query(query(ColonyTree, Position, Container, FiniteResource));
  const orders = [...ctx.query(query(ColonyTreeOrder))].sort((a, b) => a.id.localeCompare(b.id));
  const treeOwners = new Map(ctx.query(query(OwnedByParty)).map(row => [row.id, row.get(OwnedByParty).party]));
  const policies = new Map(ctx.query(query(ColonyTreePolicy)).map(row => [row.id, row.get(ColonyTreePolicy)]));
  const attempts = new Map((ctx.workAttempts?.(orders.map(row => row.id)) ?? []).map(attempt => [attempt.key.task, attempt]));
  const active = new Map<EntityId, { id: EntityId; state: TreeOrderState }>(orders.map(row => [row.get(ColonyTreeOrder).tree, { id: row.id, state: row.get(ColonyTreeOrder) }]));
  const positions = new Map(ctx.query(query(Position)).map(row => [row.id, row.get(Position)]));
  const poses = new Map(ctx.worldPoses([...new Set([...workers, ...trees.map(row => row.id)])]).map(p => [p.id, p]));
  const candidates: TreeCandidate[] = [];
  for (const row of trees) {
    const tree = row.get(ColonyTree), order = active.get(row.id), policy = policies.get(row.id), party = treeOwners.get(row.id), position = positions.get(row.id), pose = poses.get(row.id);
    const retryBlocked = order?.state.phase === "blocked" && order.state.reason !== "Not designated" && ctx.clock.tick % 8 === 0;
    if (!order || !policy?.designated || !position || !pose || attempts.has(order.id) || (order.state.phase !== "queued" && !retryBlocked) || (order.state.stage === "fell" && tree.phase !== "standing") || (order.state.stage === "chop" && tree.phase !== "felled")) continue;
    const approaches = [
      { x: position.x + 1, y: position.y, z: position.z, frame: pose.support },
      { x: position.x - 1, y: position.y, z: position.z, frame: pose.support },
      { x: position.x, y: position.y, z: position.z + 1, frame: pose.support },
      { x: position.x, y: position.y, z: position.z - 1, frame: pose.support },
    ];
    for (const worker of workers) {
      const workerPose = poses.get(worker);
      if (suspendedActors.has(worker) || (party && memberships.get(worker) !== party) || workerPose?.support !== pose.support) continue;
      candidates.push({ worker, task: order.id, tree: row.id, target: approaches[0], approaches });
    }
  }
  const selected = new Map<string, TreeCandidate["target"]>();
  return {
    claims: orders.map(row => ({ task: row.id, actor: attempts.get(row.id)?.worker ?? null })),
    occupiedActors: [...attempts.values()].map(attempt => attempt.worker),
    candidates,
    lowerBound: candidate => {
      const pose = poses.get(candidate.worker)?.local;
      return pose ? Math.min(...candidate.approaches.map(target => distance(pose, target))) : Number.POSITIVE_INFINITY;
    },
    estimate: candidate => {
      const result = ctx.routeToAny({ actor: candidate.worker, targets: candidate.approaches });
      if (result.status !== "reachable") return null;
      selected.set(`${candidate.worker}\0${candidate.task}`, candidate.approaches[result.targetIndex]);
      return result.cost;
    },
    apply: assignments => {
      for (const assignment of assignments) {
        const candidate = candidates.find(item => item.worker === assignment.worker && item.task === assignment.task), party = candidate && treeOwners.get(candidate.tree);
        if (!candidate || !party) continue;
        beginRouteWorkAttempt(ctx, candidate.task, candidate.worker, party, selected.get(`${candidate.worker}\0${candidate.task}`) ?? candidate.target);
      }
    },
    progress: () => {
      for (const row of orders) {
        const state = row.get(ColonyTreeOrder), treeRow = trees.find(tree => tree.id === state.tree), attempt = attempts.get(row.id), policy = policies.get(state.tree);
        if (state.phase === "complete") continue;
        if (attempt?.phase.kind === "executing" && suspendedActors.has(attempt.worker)) {
          interruptWorkAttempt(ctx, attempt.key, attempt.phase.operation.sequence, "workerUnavailable");
          continue;
        }
        if (attempt?.phase.kind === "outcome") {
          const phase = attempt.phase;
          if (suspendedActors.has(attempt.worker)) {
            if (phase.result.kind !== "completed") {
              ctx.write(ColonyTreeOrder, row.id, { ...state, phase: "blocked", reason: phase.result.kind === "blocked" ? phase.result.reason : phase.result.cause });
              acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
            } else if (phase.activity.kind === "route") {
              // A route outcome is movement only. Drafting must release the
              // worker before felling/chopping can be admitted.
              ctx.write(ColonyTreeOrder, row.id, { ...state, phase: "queued", reason: "" });
              acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
            } else if (phase.activity.kind === "resource-extract") {
              // Rust has already committed the extraction; reconcile its
              // canonical tree/order state exactly once before acknowledgement.
              if (treeRow) ctx.write(ColonyTree, treeRow.id, { phase: "chopped" });
              ctx.write(ColonyTreeOrder, row.id, { ...state, phase: "complete", seconds: 0, reason: "" });
              acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
            } else {
              acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
            }
            continue;
          }
          if (phase.result.kind !== "completed") {
            ctx.write(ColonyTreeOrder, row.id, { ...state, phase: policy?.designated ? "blocked" : "blocked", reason: phase.result.kind === "blocked" ? phase.result.reason : phase.result.cause });
            acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
            continue;
          }
          if (!treeRow || !policy?.designated) {
            ctx.write(ColonyTreeOrder, row.id, { ...state, phase: "blocked", reason: !treeRow ? "Tree unavailable" : "Not designated" });
            acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
            continue;
          }
          const phaseActivity = phase.activity;
          if (phaseActivity.kind === "route") {
            const total = state.stage === "fell" ? 3 : 2;
            const next = Math.min(total, state.seconds + Math.max(0, ctx.clock.delta));
            if (next < total) {
              ctx.write(ColonyTreeOrder, row.id, { ...state, phase: "working", seconds: next, reason: state.stage === "fell" ? "Felling" : "Chopping" });
              continue;
            }
            if (state.stage === "fell") {
              ctx.write(ColonyTree, treeRow.id, { phase: "felled" });
              ctx.write(ColonyTreeOrder, row.id, { ...state, phase: "queued", stage: "chop", seconds: 0, reason: "Ready to chop" });
              acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
            } else {
              continueResourceExtractWorkAttempt(ctx, attempt.key, phase.operation.sequence, treeRow.id);
              ctx.write(ColonyTreeOrder, row.id, { ...state, phase: "working", reason: "Extracting" });
            }
            continue;
          }
          if (phaseActivity.kind === "resource-extract") {
            ctx.write(ColonyTree, treeRow.id, { phase: "chopped" });
            ctx.write(ColonyTreeOrder, row.id, { ...state, phase: "complete", seconds: 0, reason: "" });
            acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
          }
          continue;
        }
        if (!treeRow || !policy?.designated) continue;
        if (!attempt) {
          if (state.phase === "working") ctx.write(ColonyTreeOrder, row.id, { ...state, phase: "blocked", reason: "Waiting for worker" });
          continue;
        }
      }
    },
  };
};

/** Reconcile one claimed order with native movement/work; never settle cargo. */
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
    (state.status === "blocked" && (state.reason !== "Someone is standing on this tile" || facts.standingCells.has(cellKey))) ||
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

export function digProvider(
  ctx: WriteContext,
  suspendedActors: ReadonlySet<EntityId>,
): PreparedWorkProvider<DigCandidate> {
  const orders = ctx.query(query(ColonyDigOrder));
  const attempts = new Map((ctx.workAttempts?.(orders.map(row => row.id)) ?? []).map(attempt => [attempt.key.task, attempt]));
  const orderOwners = new Map(ctx.query(query(OwnedByParty)).map((row) => [row.id, row.get(OwnedByParty).party]));
  const memberships = new Map(ctx.query(query(PartyMember)).map((row) => [row.id, row.get(PartyMember).party]));
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
    [...attempts.values()].map((attempt) => attempt.worker),
  );
  const deliveries = ctx
    .query(query(DeliveryTask))
    .map((row) => row.get(DeliveryTask));
  const occupied = new Set<EntityId>(excavating);
  const claims = orders.map((row) => ({ task: row.id, actor: attempts.get(row.id)?.worker ?? null }));

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
  ).filter((candidate) => {
    const owner = orderOwners.get(candidate.order);
    return !owner || memberships.get(candidate.worker) === owner;
  });
  const claimByTask = new Map(claims.map((claim) => [claim.task, claim.actor]));
  const prepared = candidates.filter(
    (candidate) =>
      !occupied.has(candidate.worker) &&
      !attempts.has(candidate.task) &&
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
        const party = orderOwners.get(candidate.order);
        if (!party) continue;
        ctx.write(ColonyDigOrder, candidate.order, { ...state, expected: candidate.expected, status: "queued", reason: "" });
        beginRouteWorkAttempt(ctx, candidate.order, candidate.worker, party, approach);
      }
    },
    progress() {
      for (const row of activeOrders) {
        const state = row.get(ColonyDigOrder);
        const owner = orderOwners.get(row.id);
        const attempt = attempts.get(row.id);
        if (owner && attempt && memberships.get(attempt.worker) !== owner) continue;
        if (attempt && suspendedActors.has(attempt.worker)) {
          if (attempt.phase.kind === "executing") {
            interruptWorkAttempt(ctx, attempt.key, attempt.phase.operation.sequence, "workerUnavailable");
          } else if (attempt.phase.kind === "outcome") {
            const phase = attempt.phase;
            if (phase.result.kind !== "completed") {
              ctx.write(ColonyDigOrder, row.id, { ...state, status: "blocked", reason: phase.result.kind === "blocked" ? phase.result.reason : `interrupted:${phase.result.cause}` });
              acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
            } else if (phase.activity.kind === "route") {
              if (state.status !== "queued" || state.reason !== "")
                ctx.write(ColonyDigOrder, row.id, { ...state, status: "queued", reason: "" });
              acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
            } else if (phase.activity.kind === "excavation") {
              ctx.removeAuthoredEntity(row.id);
              acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
            } else acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
          }
          continue;
        }
        if (obstructed(state)) {
          if (state.status !== "blocked" || state.reason !== "Someone is standing on this tile") {
            ctx.write(ColonyDigOrder, row.id, {
              ...state,
              status: "blocked",
              reason: "Someone is standing on this tile",
            });
          }
          continue;
        }
        if (assigned.has(row.id)) continue;
        if (!attempt || attempt.phase.kind !== "outcome") continue;
        const phase = attempt.phase;
        if (phase.result.kind !== "completed") {
          ctx.write(ColonyDigOrder, row.id, {
            ...state,
            status: "blocked",
            reason: phase.result.kind === "blocked"
              ? phase.result.reason
              : `interrupted:${phase.result.cause}`,
          });
          acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
          continue;
        }
        if (phase.activity.kind === "route") continueExcavationWorkAttempt(ctx, attempt.key, phase.operation.sequence, [state.cellX, state.cellY, state.cellZ], state.expected, air);
        else if (phase.activity.kind === "excavation") { ctx.removeAuthoredEntity(row.id); acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence); }
      }
    },
  };
}

function planGroundStockDeliveries(ctx: WriteContext) {
  const ownedStores = ctx.query(query(Container, OwnedByParty));
  const stockOwners = new Map(ctx.query(query(GroundStock, OwnedByParty)).map(row => [row.id, row.get(OwnedByParty).party]));
  const stockContainers = new Set(stockOwners.keys());
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
    const party = stockOwners.get(source);
    const pantry = ownedStores.filter(row => row.get(OwnedByParty).party === party).map(row => row.id).sort()[0];
    if (!pantry) continue;
    const taskId = entity(`${row.id}.delivery`);
    if (taskIds.has(taskId)) continue;
    ctx.createAuthoredEntity({
      id: taskId,
      components: {
        [DeliveryTask.id]: {
          version: 2,
          party: party ?? entity("host"),
          sourceLot: row.id,
          source,
          destination: pantry,
          material: lot.kind,
          quantity: lot.quantity,
          custody: "available",
            ground: null,
        },
      },
    }, party ? { kind: "party", party } : { kind: "host" });
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
    if ((task.custody === "delivered" || task.custody === "dropped") && stockContainers.has(task.source))
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
  const owners = new Map(ctx.query(query(OwnedByParty)).map(row => [row.id, row.get(OwnedByParty).party]));
  const grouped = new Map<EntityId, typeof active>();
  for (const row of active) {
    const party = owners.get(row.id);
    if (party) grouped.set(party, [...(grouped.get(party) ?? []), row]);
  }
  for (const [party, partySites] of grouped) planSiteSupplies(ctx, {
    sourceContainers: ctx.query(query(Container, OwnedByParty)).filter(row => row.get(OwnedByParty).party === party).map(row => row.id).sort(),
    batchQuantity: 3,
    requirements: [
      ...partySites.flatMap((row) => {
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
    ],
  });
}

export const colonyWorkSystem = createWorkSystem({
  id: "colony.work",
  version: 1,
  reads: [
    OwnedByParty,
    PartyMember,
    GroundStock,
    StockpileCell,
    ColonyDigOrder,
    ColonyTree,
    ColonyTreeOrder,
    ColonyTreePolicy,
    FiniteResource,
    ResourceSite,
    Worker,
    Body,
    Traversal,
    Position,
    Container,
    SealedContainer,
    ConstructionSite,
    DeconstructionOrder,
    LotWater,
    Destination,
    Support,
    Surface,
    MaterialLot,
    StagedProcess,
    ColonyResourceOrder,
    ExcavationWork,
    DeliveryTask,
    DeliveryControl,
    WaterSupplyOrder,
    WaterSupplyWork,
  ],
  writes: [
    ColonyDigOrder,
    ColonyTree,
    ColonyTreeOrder,
    MaterialLot,
    DeliveryTask,
    DeconstructionOrder,
    WaterSupplyOrder,
    WaterSupplyWork,
    ColonyResourceOrder,
  ],
  phases: [
    processSupplyPhase,
    colonyProcessWaterPhase,
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
    (ctx, suspendedActors) => waterSupplyProvider(ctx, suspendedActors),
    resourceWorkProvider,
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
