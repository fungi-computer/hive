import { DeconstructionOrder } from "../sdk/deconstruction-work";
import { SealedContainer } from "../sdk/construction";
import { StagedProcess } from "../sdk/process-supply";
import { waterSupplyProvider, WaterSupplyOrder, WaterSupplyWork } from "./colony-water-work";
import { Worker } from "./colony-components";
import { component, entity, query } from "../sdk/authoring";
import {
  createWorkSystem,
  shouldRetryWorkTask,
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
  ExcavationOrder,
  MaterialLot,
  FiniteResource,
  ResourceSite,
  LotWater,
  Position,
  Support,
  Surface,
  Traversal,
  move,
} from "../sdk/common";
import type { EntityId, QueryRow, Vec3, WorldPose, WriteContext } from "../contracts";
import { colonyEnvironment } from "./colony-environment";
import { OwnedByParty, PartyMember } from "../sdk/party";
import { acknowledgeWorkAttempt, beginRouteWorkAttempt, continueFieldWaterWorkAttempt, continueResourceEstablishWorkAttempt, continueResourceExtractWorkAttempt, continueResourceTendWorkAttempt, interruptWorkAttempt, workAttempt, workAttemptsFor } from "../sdk/work-attempt";

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

/** Own the worker-as-task route used by Draft/Go. Automatic work providers must
 * see that actor as occupied until the route completes or Undraft interrupts it,
 * and the route's terminal receipt must be acknowledged exactly once. */
function manualRouteProvider(ctx: WriteContext, suspendedActors: ReadonlySet<EntityId>): PreparedWorkProvider {
  const attempts = ctx.query(query(Worker)).flatMap(row => {
    const attempt = ctx.workAttemptForWorker?.(row.id);
    return attempt?.key.task === row.id ? [attempt] : [];
  });
  return {
    claims: attempts.map(attempt => ({ task: attempt.key.task, actor: attempt.worker })),
    candidates: [],
    occupiedActors: attempts.map(attempt => attempt.worker),
    lowerBound: () => 0,
    estimate: () => null,
    apply: () => {},
    progress: () => {
      for (const attempt of attempts) {
        if (attempt.phase.kind === "outcome")
          acknowledgeWorkAttempt(ctx, attempt.key, attempt.phase.operation.sequence);
        else if (attempt.phase.kind === "executing" && !suspendedActors.has(attempt.worker))
          interruptWorkAttempt(ctx, attempt.key, attempt.phase.operation.sequence, "cancelled");
      }
    },
  };
}

/** Shared finite tended-resource work owner. It emits only native physical actions. */
export function resourceWorkProvider(ctx: WriteContext, suspendedActors: ReadonlySet<EntityId>): PreparedWorkProvider<ResourceCandidate> {
  const nativeOrders = [...ctx.query(query(ColonyResourceOrder))].sort((a, b) => a.id.localeCompare(b.id));
  const nativeSites = new Map(ctx.query(query(ResourceSite)).map(row => [row.id, row.get(ResourceSite)]));
  const nativeDefinitions = new Map(colonyEnvironment.resourceSites?.map(definition => [definition.id, definition]) ?? []);
  const nativeOwners = new Map(ctx.query(query(OwnedByParty)).map(row => [row.id, row.get(OwnedByParty).party]));
  const nativeMembers = new Map(ctx.query(query(PartyMember)).map(row => [row.id, row.get(PartyMember).party]));
  const nativeWorkers = ctx.query(query(Worker, Body, Position)).filter(row => !row.get(Worker).guest && !suspendedActors.has(row.id));
  const nativeAttempts = new Map(workAttemptsFor(ctx, nativeOrders.map(row => row.id)).map(attempt => [attempt.key.task, attempt]));
  const nativeFacts = ctx.workMaterialFacts();
  const nativePails = new Map<EntityId, EntityId>(
    nativeFacts.lots
      .filter(
        (lot) =>
          lot.kind === "pail" &&
          nativeWorkers.some((worker) => worker.id === lot.container),
      )
      .map((lot) => [lot.container, lot.id]),
  );
  const nativeWaterByVessel = new Map<EntityId, number>();
  for (const lot of nativeFacts.lots)
    if (lot.kind === "water" && lot.quantity > 0)
      nativeWaterByVessel.set(
        lot.container,
        (nativeWaterByVessel.get(lot.container) ?? 0) + lot.quantity,
      );
  const nativeCandidates: ResourceCandidate[] = [];
  for (const row of nativeOrders) {
    if (nativeAttempts.has(row.id)) continue;
    const state = row.get(ColonyResourceOrder), site = nativeSites.get(state.site), definition = nativeDefinitions.get(state.definition), party = nativeOwners.get(row.id);
    const stage = site && definition ? (site.stage >= definition.stages.length ? "harvest" : "tend") : "sow";
    const retryBlocked = state.status === "blocked" && shouldRetryWorkTask(row.id, ctx.clock.tick);
    if (!definition || !party || (state.status !== "queued" && !retryBlocked)) continue;
    if (stage !== "sow" && !site) continue;
    if (stage !== "sow" && stage !== "harvest" && site!.nextDue > ctx.clock.now) continue;
    for (const worker of nativeWorkers) {
      const pail = nativePails.get(worker.id);
      const waterNeeded =
        stage === "tend" ? definition.stages[site!.stage]?.waterPortions : 0;
      if (
        nativeMembers.get(worker.id) !== party ||
        (stage === "tend" &&
          (!pail ||
            waterNeeded === undefined ||
            (nativeWaterByVessel.get(pail) ?? 0) < waterNeeded))
      )
        continue;
      nativeCandidates.push({
        worker: worker.id,
        task: row.id,
        vessel: nativePails.get(worker.id),
        approaches: [
          {
            x: state.cellX + 1,
            y: (state.cellY + 0.5) * colonyEnvironment.world.verticalMetres,
            z: state.cellZ,
            frame: null,
          },
        ],
      });
    }
  }
  const nativePoses = new Map((nativeWorkers.length ? ctx.worldPoses(nativeWorkers.map(row => row.id)) : []).map(pose => [pose.id, pose.local]));
  const nativeSelected = new Map<string, ResourceCandidate["approaches"][number]>();
  return {
    claims: nativeOrders.map((row) => ({
      task: row.id,
      actor: nativeAttempts.get(row.id)?.worker ?? null,
    })),
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

/** Tended resources request finite field water through the same visible fetch
 * work as brewing. A pail must actually contain enough water before tending is
 * eligible; the scheduler never invents water or retries a doomed deposit. */
function colonyResourceWaterPhase(ctx: WriteContext): void {
  const resources = ctx.query(query(ColonyResourceOrder));
  const sites = new Map(
    ctx
      .query(query(ResourceSite))
      .map((row) => [row.id, row.get(ResourceSite)]),
  );
  const owners = new Map(
    ctx
      .query(query(OwnedByParty))
      .map((row) => [row.id, row.get(OwnedByParty).party]),
  );
  const members = new Map(
    ctx
      .query(query(PartyMember))
      .map((row) => [row.id, row.get(PartyMember).party]),
  );
  const waterOrders = ctx.query(query(WaterSupplyOrder, WaterSupplyWork));
  const attempts = new Map(
    workAttemptsFor(
      ctx,
      waterOrders.map((row) => row.id),
    ).map((attempt) => [attempt.key.task, attempt]),
  );
  const facts = ctx.workMaterialFacts();
  const pailsByParty = new Map<EntityId, EntityId[]>();
  for (const lot of facts.lots) {
    if (lot.kind !== "pail" || lot.quantity <= 0) continue;
    const party = members.get(lot.container);
    if (party)
      pailsByParty.set(party, [...(pailsByParty.get(party) ?? []), lot.id]);
  }
  const waterByVessel = new Map<EntityId, number>();
  for (const lot of facts.lots)
    if (lot.kind === "water" && lot.quantity > 0)
      waterByVessel.set(
        lot.container,
        (waterByVessel.get(lot.container) ?? 0) + lot.quantity,
      );
  const byConsumer = new Map<EntityId, typeof waterOrders>();
  for (const row of waterOrders) {
    const consumer = row.get(WaterSupplyOrder).consumer;
    if (consumer)
      byConsumer.set(consumer, [...(byConsumer.get(consumer) ?? []), row]);
  }
  let revision = waterOrders.reduce(
    (max, row) => Math.max(max, row.get(WaterSupplyOrder).revision),
    0,
  );
  for (const row of resources) {
    const state = row.get(ColonyResourceOrder),
      site = sites.get(state.site),
      owner = owners.get(row.id);
    const definition = colonyEnvironment.resourceSites?.find(
      (item) => item.id === state.definition,
    );
    const stage =
      site && definition ? definition.stages[site.stage] : undefined;
    const existing = byConsumer.get(row.id) ?? [];
    const active = existing.filter(
      (demand) =>
        demand.get(WaterSupplyWork).phase !== "complete" ||
        attempts.has(demand.id),
    );
    const enough =
      owner &&
      stage &&
      (pailsByParty.get(owner) ?? []).some(
        (pail) => (waterByVessel.get(pail) ?? 0) >= stage.waterPortions,
      );
    for (const demand of existing)
      if (
        !attempts.has(demand.id) &&
        (demand.get(WaterSupplyWork).phase === "complete" ||
          enough ||
          !stage ||
          state.status === "complete")
      )
        ctx.removeAuthoredEntity(demand.id);
    if (
      !owner ||
      !site ||
      !stage ||
      site.nextDue > ctx.clock.now ||
      enough ||
      active.length
    )
      continue;
    if (waterOrders.length >= 256 || revision >= 0xffffffff)
      throw new Error("water demand capacity exhausted");
    revision += 1;
    const demand = entity(`colony.water-resource.${row.id}.${site.stage}`);
    ctx.createAuthoredEntity(
      {
        id: demand,
        components: {
          [WaterSupplyOrder.id]: { revision, consumer: row.id, party: owner },
          [WaterSupplyWork.id]: {
            request: revision,
            phase: "queued",
            x: 0,
            y: 0,
            z: 0,
            reason: "",
          },
        },
      },
      { kind: "party", party: owner },
    );
  }
}
/** Content identity for a finite resource. Presentation derives lifecycle from
 * the native resource and material facts, so this marker never becomes a
 * second mutable lifecycle owner. */
export const ColonyTree = component<{ kind: string }>("colony.tree", {
  version: 1,
  fields: { kind: "string" },
});
/** Player intent binding for one durable job occurrence. It carries no
 * physical lifecycle or progress state. */
export const ColonyTreePolicy = component<{ designated: boolean; party: EntityId | null; job: EntityId | null }>(
  "colony.tree-policy",
  { version: 3, fields: { designated: "boolean", party: "nullable-entity", job: "nullable-entity" } },
);

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
export function colonyGroundStockPhase(ctx: WriteContext) {
  const stockContainers = new Set(
    ctx.query(query(GroundStock)).map((row) => row.id),
  );
  for (const row of ctx.query(query(DeliveryTask))) {
    const task = row.get(DeliveryTask);
    if ((task.custody === "delivered" || task.custody === "dropped") && stockContainers.has(task.source))
      ctx.removeAuthoredEntity(row.id);
  }
}

export const colonyWorkSystem = createWorkSystem({
  id: "colony.work",
  version: 1,
  reads: [
    OwnedByParty,
    PartyMember,
    GroundStock,
    StockpileCell,
    ExcavationOrder,
    FiniteResource,
    ResourceSite,
    Worker,
    Body,
    Traversal,
    Position,
    Container,
    SealedContainer,
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
    MaterialLot,
    DeliveryTask,
    DeconstructionOrder,
    WaterSupplyOrder,
    WaterSupplyWork,
    ColonyResourceOrder,
  ],
  phases: [
    colonyResourceWaterPhase,
    colonyGroundStockPhase,
    (ctx) =>
      planStockpileDeliveries(ctx, { filterProfiles: colonyStockpileProfiles, batchQuantity: 3 }),
  ],
  providers: [
    manualRouteProvider,
    deliveryProvider,
    (ctx, suspendedActors) => waterSupplyProvider(ctx, suspendedActors),
    resourceWorkProvider,
  ],
});

/** Sites request stock through the same finite deliveries as every other task. */
