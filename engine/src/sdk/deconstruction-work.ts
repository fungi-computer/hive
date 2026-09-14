import { component, entity, query } from "./authoring";
import { ConstructionSite, deconstruct } from "./construction";
import { OwnedByParty, PartyMember } from "./party";
import {
  Body,
  Container,
  Destination,
  ExcavationWork,
  MaterialLot,
  Support,
  Traversal,
  move,
} from "./common";
import type { PreparedWorkProvider } from "./work-system";
import { acknowledgeWorkAttempt, beginRouteWorkAttempt, continueDeconstructionWorkAttempt } from "./work-attempt";
import type {
  ConstructionAccessContact,
  DeconstructionAccess,
  EntityId,
  EntityRecord,
  QueryRow,
  WorldPose,
  WriteContext,
} from "../contracts";

type DeconstructionOrderState = {
  site: EntityId;
  actor: EntityId | null;
  phase:
    | "queued"
    | "approaching"
    | "working"
    | "submitting"
    | "blocked"
    | "complete";
  seconds: number;
  contactX: number;
  contactY: number;
  contactZ: number;
  reason: string;
  retryKey: string;
};
export const DeconstructionOrder = component<DeconstructionOrderState>(
  "hive.deconstruction-order",
  {
    version: 3,
    fields: {
      // The accepted physical action removes this target before its durable
      // receipt is reconciled on the following authored step.
      site: "string",
      actor: "nullable-entity",
      phase: "string",
      seconds: "number",
      contactX: "number",
      contactY: "number",
      contactZ: "number",
      reason: "string",
      retryKey: "string",
    },
  },
);

type DeconstructionApproachState = {
  order: EntityId;
  worker: EntityId;
  contactX: number;
  contactY: number;
  contactZ: number;
};
export const DeconstructionApproach = component<DeconstructionApproachState>(
  "hive.deconstruction-approach",
  {
    version: 2,
    fields: {
      order: "entity",
      worker: "entity",
      contactX: "number",
      contactY: "number",
      contactZ: "number",
    },
  },
);

type Candidate = {
  readonly worker: EntityId;
  readonly task: EntityId;
  readonly order: EntityId;
  readonly site: EntityId;
  readonly contacts: readonly ConstructionAccessContact[];
};
const distance = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const approachId = (order: EntityId) =>
  entity(`deconstruction-approach.${order.length}:${order}`);

/** Queue intent is an authored record; worker availability is deliberately irrelevant. */
export const queueDeconstruction = (site: EntityId): EntityRecord => {
  const id = entity(`deconstruction-order.${site.length}:${site}`);
  return {
    id,
    components: {
      [DeconstructionOrder.id]: {
        site,
        actor: null,
        phase: "queued",
        seconds: 0,
        contactX: 0,
        contactY: 0,
        contactZ: 0,
        reason: "",
        retryKey: "",
      },
    },
  };
};

type ApproachRow = {
  readonly id: EntityId;
  readonly state: DeconstructionApproachState;
};
type SiteState = {
  readonly catalog: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly orientation: string;
  readonly seconds: number;
  readonly phase: "planned" | "working" | "finished";
};
type DeconstructionFacts = {
  readonly orders: readonly QueryRow<DeconstructionOrderState>[];
  readonly sites: ReadonlyMap<EntityId, SiteState>;
  readonly access: ReadonlyMap<EntityId, DeconstructionAccess>;
  readonly approaches: ReadonlyMap<EntityId, ApproachRow>;
  readonly bodies: ReadonlyMap<EntityId, { readonly speed: number }>;
  readonly containers: ReadonlyMap<EntityId, { readonly capacity: number }>;
  readonly quantities: ReadonlyMap<EntityId, number>;
  readonly traversals: ReadonlySet<EntityId>;
  readonly positions: ReadonlyMap<EntityId, WorldPose>;
  readonly occupied: ReadonlySet<EntityId>;
  readonly workers: readonly EntityId[];
  readonly suspended: ReadonlySet<EntityId>;
};

function indexDeconstructionFacts(
  ctx: WriteContext,
  workers: readonly EntityId[],
  suspended: ReadonlySet<EntityId>,
): DeconstructionFacts {
  const orders = [...ctx.query(query(DeconstructionOrder))].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  if (orders.length > 256)
    throw new Error("deconstruction order bound exceeded");
  const sites = new Map(
    ctx
      .query(query(ConstructionSite))
      .map((row) => [row.id, row.get(ConstructionSite)] as const),
  );
  const requestedSites = [
    ...new Set(orders.map((row) => row.get(DeconstructionOrder).site)),
  ];
  const access = new Map(
    (requestedSites.length ? ctx.deconstructionAccess(requestedSites) : []).map(
      (row) => [row.site, row] as const,
    ),
  );
  const approaches = new Map(
    ctx
      .query(query(DeconstructionApproach))
      .map(
        (row) =>
          [
            row.get(DeconstructionApproach).order,
            { id: row.id, state: row.get(DeconstructionApproach) },
          ] as const,
      ),
  );
  const orderIds = new Set(orders.map((row) => row.id));
  for (const approach of approaches.values())
    if (!orderIds.has(approach.state.order))
      ctx.removeAuthoredEntity(approach.id);
  const bodies = new Map(
    ctx.query(query(Body)).map((row) => [row.id, row.get(Body)] as const),
  );
  const containers = new Map(
    ctx
      .query(query(Container))
      .map((row) => [row.id, row.get(Container)] as const),
  );
  const quantities = new Map<EntityId, number>();
  for (const row of ctx.query(query(MaterialLot))) {
    const lot = row.get(MaterialLot);
    quantities.set(
      lot.container,
      (quantities.get(lot.container) ?? 0) + lot.quantity,
    );
  }
  const traversals = new Set(ctx.query(query(Traversal)).map((row) => row.id));
  const positions = new Map(
    workers
      .flatMap((_, index) =>
        index % 128 === 0
          ? ctx.worldPoses(workers.slice(index, index + 128))
          : [],
      )
      .map((pose) => [pose.id, pose] as const),
  );
  const occupied = new Set<EntityId>([
    ...ctx.query(query(ExcavationWork)).map((row) => row.id),
    ...ctx.query(query(Destination)).map((row) => row.id),
    ...ctx.query(query(Support)).map((row) => row.id),
    ...[...approaches.values()].map(({ state }) => state.worker),
  ]);
  return {
    orders,
    sites,
    access,
    approaches,
    bodies,
    containers,
    quantities,
    traversals,
    positions,
    occupied,
    workers,
    suspended,
  };
}

type WorkerAvailability =
  | {
      readonly kind: "eligible";
      readonly capacity: number;
      readonly quantity: number;
      readonly pose: WorldPose | undefined;
    }
  | { readonly kind: "suspended" | "occupied" | "unavailable" };

function workerAvailability(
  facts: DeconstructionFacts,
  worker: EntityId,
): WorkerAvailability {
  if (facts.suspended.has(worker)) return { kind: "suspended" };
  if (facts.occupied.has(worker)) return { kind: "occupied" };
  const body = facts.bodies.get(worker);
  const container = facts.containers.get(worker);
  if (!body || body.speed <= 0 || !container || !facts.traversals.has(worker)) return { kind: "unavailable" };
  return {
    kind: "eligible",
    capacity: container.capacity,
    quantity: facts.quantities.get(worker) ?? 0,
    pose: facts.positions.get(worker),
  };
}

function workerRetryKey(facts: DeconstructionFacts, worker: EntityId): string {
  const availability = workerAvailability(facts, worker);
  if (availability.kind !== "eligible") return `${worker}:ineligible:${availability.kind}`;
  const pose = availability.pose?.world;
  const coordinates = pose ? `${pose.x},${pose.y},${pose.z}` : "?,?,?";
  return `${worker}:eligible:${availability.quantity}:${availability.capacity}:${coordinates}`;
}

function deconstructionRetryKey(
  facts: DeconstructionFacts,
  site: EntityId,
  rowAccess: DeconstructionAccess | undefined,
): string {
  const accessKey = rowAccess
    ? `${rowAccess.status}|${rowAccess.salvageQuantity}|${rowAccess.workSeconds}|${rowAccess.contacts.map((contact) => `${contact.x},${contact.y},${contact.z},${contact.kind}`).join(";")}`
    : "missing-access";
  const workerKey = facts.workers
    .map((worker) => workerRetryKey(facts, worker))
    .join("|");
  return `${site}|${accessKey}|${workerKey}`;
}

export function deconstructionWorkProvider(
  ctx: WriteContext,
  workers: readonly EntityId[],
  suspended: ReadonlySet<EntityId>,
): PreparedWorkProvider<Candidate> {
  const orders = [...ctx.query(query(DeconstructionOrder))].sort((a,b)=>a.id.localeCompare(b.id));
  const sites = new Map(ctx.query(query(ConstructionSite)).map(row=>[row.id,row.get(ConstructionSite)] as const));
  const owners = new Map(ctx.query(query(OwnedByParty)).map(row=>[row.id,row.get(OwnedByParty).party] as const));
  const members = new Map(ctx.query(query(PartyMember)).map(row=>[row.id,row.get(PartyMember).party] as const));
  const access = new Map((orders.length ? ctx.deconstructionAccess([...new Set(orders.map(row=>row.get(DeconstructionOrder).site))]) : []).map(row=>[row.site,row] as const));
  const attempts = new Map((ctx.workAttempts?.(orders.map(row=>row.id)) ?? []).map(attempt=>[attempt.key.task,attempt] as const));
  const poses = new Map(ctx.worldPoses(workers).map(pose=>[pose.id,pose.world] as const));
  const candidates: Candidate[]=[];
  for(const row of orders){const state=row.get(DeconstructionOrder),site=sites.get(state.site),info=access.get(state.site),party=owners.get(state.site);if(!site||site.phase!=="finished"||!info||info.status!=="ready"||!info.contacts.length||attempts.has(row.id)||!party)continue;for(const worker of workers){const pose=poses.get(worker);if(suspended.has(worker)||!pose||members.get(worker)!==party)continue;candidates.push({worker,task:row.id,order:row.id,site:state.site,contacts:info.contacts});}}
  const routes=new Map<string,ConstructionAccessContact>();const byPair=new Map(candidates.map(candidate=>[`${candidate.task}\0${candidate.worker}`,candidate]));
  return {
    claims: orders.filter(row=>attempts.has(row.id)).map(row=>({task:row.id,actor:attempts.get(row.id)?.worker??null})), occupiedActors:[...new Set([...attempts.values()].map(attempt=>attempt.worker))],
    candidates,
    lowerBound: candidate=>{const pose=poses.get(candidate.worker);return pose?Math.min(...candidate.contacts.map(contact=>distance(pose,contact))):Infinity;},
    estimate: candidate=>{const result=ctx.routeToAny({actor:candidate.worker,targets:candidate.contacts.map(contact=>({x:contact.x,y:contact.y,z:contact.z,frame:null}))});if(result.status!=="reachable")return null;const contact=candidate.contacts[result.targetIndex];if(!contact)return null;routes.set(`${candidate.task}\0${candidate.worker}`,contact);return result.cost;},
    apply: assignments=>{for(const assignment of assignments){const candidate=byPair.get(`${assignment.task}\0${assignment.worker}`),contact=candidate&&routes.get(`${assignment.task}\0${assignment.worker}`),party=candidate&&owners.get(candidate.site);if(!candidate||!contact||!party)continue;beginRouteWorkAttempt(ctx,candidate.task,candidate.worker,party,{x:contact.x,y:contact.y,z:contact.z,frame:null});}},
    progress:()=>{for(const row of orders){const attempt=attempts.get(row.id);if(!attempt||attempt.phase.kind!=="outcome")continue;const phase=attempt.phase;if(phase.result.kind!=="completed"){acknowledgeWorkAttempt(ctx,attempt.key,phase.operation.sequence);continue;}const activity=phase.activity;if(activity.kind==="route"){const state=row.get(DeconstructionOrder),info=access.get(state.site),contact=info?.contacts.find(item=>item.x===activity.destination.x&&item.y===activity.destination.y&&item.z===activity.destination.z);if(contact)continueDeconstructionWorkAttempt(ctx,attempt.key,phase.operation.sequence,state.site,contact);else acknowledgeWorkAttempt(ctx,attempt.key,phase.operation.sequence);}else if(activity.kind==="deconstruction"){ctx.removeAuthoredEntity(row.id);acknowledgeWorkAttempt(ctx,attempt.key,phase.operation.sequence);}}},
  };
}


function removeDeconstructionOrder(
  ctx: WriteContext,
  facts: DeconstructionFacts,
  order: EntityId,
): void {
  ctx.removeAuthoredEntity(order);
  const approach = facts.approaches.get(order);
  if (approach) ctx.removeAuthoredEntity(approach.id);
}

function removeDeconstructionApproach(
  ctx: WriteContext,
  facts: DeconstructionFacts,
  order: EntityId,
): void {
  const approach = facts.approaches.get(order);
  if (approach) ctx.removeAuthoredEntity(approach.id);
}

function settleDeconstructionOutcome(
  ctx: WriteContext,
  facts: DeconstructionFacts,
  row: QueryRow<DeconstructionOrderState>,
): boolean {
  const state = row.get(DeconstructionOrder);
  const outcome = ctx.outcomes.find(
    ({ action }) =>
      action.kind === "deconstruct" &&
      action.worker === state.actor &&
      action.site === state.site,
  );
  if (!outcome) return false;
  if (outcome.result.accepted) {
    removeDeconstructionOrder(ctx, facts, row.id);
  } else {
    removeDeconstructionApproach(ctx, facts, row.id);
    ctx.write(DeconstructionOrder, row.id, {
      ...state,
      actor: null,
      phase: "blocked",
      reason: (outcome.result.reason ?? "Deconstruction was rejected").slice(
        0,
        512,
      ),
      retryKey: deconstructionRetryKey(
        facts,
        state.site,
        facts.access.get(state.site),
      ),
    });
  }
  return true;
}

function reconcileDeconstructionOrders(
  ctx: WriteContext,
  facts: DeconstructionFacts,
) {
  const liveSites = new Set<EntityId>();
  const removedOrders = new Set<EntityId>();
  for (const row of facts.orders) {
    const state = row.get(DeconstructionOrder);
    if (
      !facts.sites.has(state.site) ||
      state.phase === "complete" ||
      liveSites.has(state.site)
    ) {
      removeDeconstructionOrder(ctx, facts, row.id);
      removedOrders.add(row.id);
      continue;
    }
    liveSites.add(state.site);
    if (settleDeconstructionOutcome(ctx, facts, row)) {
      removedOrders.add(row.id);
      continue;
    }
    if (state.actor !== null && !facts.approaches.has(row.id))
      ctx.write(DeconstructionOrder, row.id, {
        ...state,
        actor: null,
        phase: "queued",
        reason: "",
        retryKey: "",
      });
  }
  const activeOrders = facts.orders.filter((row) => !removedOrders.has(row.id));
  const claims = activeOrders.flatMap((row) => {
    const state = row.get(DeconstructionOrder);
    return facts.sites.has(state.site) && state.phase !== "complete"
      ? [{ task: row.id, actor: state.actor }]
      : [];
  });
  return { activeOrders, claims };
}

function orderCanStart(
  facts: DeconstructionFacts,
  row: QueryRow<DeconstructionOrderState>,
  access: DeconstructionAccess | undefined,
): access is DeconstructionAccess {
  const state = row.get(DeconstructionOrder);
  const site = facts.sites.get(state.site);
  if (
    !site ||
    site.phase !== "finished" ||
    state.actor !== null ||
    facts.approaches.has(row.id)
  )
    return false;
  if (!access || access.status !== "ready" || access.contacts.length === 0)
    return false;
  return (
    state.phase !== "blocked" ||
    state.retryKey !== deconstructionRetryKey(facts, state.site, access)
  );
}

function workerCanDeconstruct(
  facts: DeconstructionFacts,
  worker: EntityId,
  salvageQuantity: number,
): boolean {
  const availability = workerAvailability(facts, worker);
  return availability.kind === "eligible" && availability.pose !== undefined && availability.quantity + salvageQuantity <= availability.capacity;
}

function buildDeconstructionCandidates(
  facts: DeconstructionFacts,
  orders: readonly QueryRow<DeconstructionOrderState>[],
): Candidate[] {
  return orders.flatMap((row) => {
    const state = row.get(DeconstructionOrder);
    const rowAccess = facts.access.get(state.site);
    if (!orderCanStart(facts, row, rowAccess)) return [];
    return facts.workers
      .filter((worker) =>
        workerCanDeconstruct(facts, worker, rowAccess.salvageQuantity),
      )
      .map((worker) => ({
        worker,
        task: row.id,
        order: row.id,
        site: state.site,
        contacts: rowAccess.contacts,
      }));
  });
}

function beginDeconstructionAssignment(
  ctx: WriteContext,
  facts: DeconstructionFacts,
  candidates: readonly Candidate[],
) {
  const routed = new Map<
    string,
    { contact: ConstructionAccessContact; cost: number }
  >();
  return {
    lowerBound: (candidate: Candidate) => {
      const pose = facts.positions.get(candidate.worker)?.local;
      return pose
        ? Math.min(
            ...candidate.contacts.map((contact) => distance(pose, contact)),
          )
        : 0;
    },
    estimate: (candidate: Candidate) => {
      const result = ctx.routeToAny({
        actor: candidate.worker,
        targets: candidate.contacts.map((contact) => ({
          x: contact.x,
          y: contact.y,
          z: contact.z,
          frame: null,
        })),
      });
      if (result.status !== "reachable") return null;
      const contact = candidate.contacts[result.targetIndex];
      if (!contact) return null;
      routed.set(`${candidate.worker}\0${candidate.task}`, {
        contact,
        cost: result.cost,
      });
      return result.cost;
    },
    apply: (
      assignments: readonly {
        readonly worker: EntityId;
        readonly task: EntityId;
      }[],
    ) => {
      for (const assignment of assignments) {
        const candidate = candidates.find(
          (item) =>
            item.worker === assignment.worker && item.task === assignment.task,
        );
        const chosen =
          candidate && routed.get(`${assignment.worker}\0${assignment.task}`);
        if (!candidate || !chosen) continue;
        const state = facts.orders
          .find((row) => row.id === candidate.order)
          ?.get(DeconstructionOrder);
        if (!state) continue;
        ctx.write(DeconstructionOrder, candidate.order, {
          ...state,
          actor: candidate.worker,
          phase: "approaching",
          contactX: chosen.contact.x,
          contactY: chosen.contact.y,
          contactZ: chosen.contact.z,
          reason: "",
          retryKey: "",
        });
        ctx.createAuthoredEntity({
          id: approachId(candidate.order),
          components: {
            [DeconstructionApproach.id]: {
              order: candidate.order,
              worker: candidate.worker,
              contactX: chosen.contact.x,
              contactY: chosen.contact.y,
              contactZ: chosen.contact.z,
            },
          },
        });
        ctx.action(
          move(candidate.worker, {
            x: chosen.contact.x,
            y: chosen.contact.y,
            z: chosen.contact.z,
            frame: null,
          }),
        );
      }
    },
  };
}

type ApproachTarget = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly frame: null;
};

function releaseDeconstructionApproach(
  ctx: WriteContext,
  facts: DeconstructionFacts,
  row: QueryRow<DeconstructionOrderState>,
  approach: ApproachRow,
  phase: "queued" | "blocked",
  reason: string,
): void {
  const state = row.get(DeconstructionOrder);
  ctx.removeAuthoredEntity(approach.id);
  ctx.write(DeconstructionOrder, row.id, {
    ...state,
    actor: null,
    phase,
    reason,
    retryKey:
      phase === "blocked"
        ? deconstructionRetryKey(
            facts,
            state.site,
            facts.access.get(state.site),
          )
        : "",
  });
}

function matchingRejectedMove(
  ctx: WriteContext,
  worker: EntityId,
  target: ApproachTarget,
) {
  return ctx.outcomes.find(
    ({ action, result }) =>
      !result.accepted &&
      action.kind === "move" &&
      action.entity === worker &&
      action.destination.x === target.x &&
      action.destination.y === target.y &&
      action.destination.z === target.z &&
      action.destination.frame === target.frame,
  );
}

function validApproachAccess(
  facts: DeconstructionFacts,
  siteId: EntityId,
  approach: ApproachRow,
  target: ApproachTarget,
): DeconstructionAccess | undefined {
  const site = facts.sites.get(siteId);
  const access = facts.access.get(siteId);
  if (
    !site ||
    site.phase !== "finished" ||
    !access ||
    access.status !== "ready"
  )
    return undefined;
  return access.contacts.some(
    (contact) =>
      contact.x === target.x &&
      contact.y === target.y &&
      contact.z === target.z,
  )
    ? access
    : undefined;
}

function progressApproach(
  ctx: WriteContext,
  facts: DeconstructionFacts,
  row: QueryRow<DeconstructionOrderState>,
  approach: ApproachRow,
): void {
  if (facts.suspended.has(approach.state.worker)) {
    releaseDeconstructionApproach(ctx, facts, row, approach, "queued", "");
    return;
  }
  const target: ApproachTarget = {
    x: approach.state.contactX,
    y: approach.state.contactY,
    z: approach.state.contactZ,
    frame: null,
  };
  const pose = facts.positions.get(approach.state.worker);
  const state = row.get(DeconstructionOrder);
  const access = validApproachAccess(facts, state.site, approach, target);
  if (!pose || !access) {
    releaseDeconstructionApproach(
      ctx,
      facts,
      row,
      approach,
      "blocked",
      "Waiting for reachable site",
    );
    return;
  }
  const rejectedMove = matchingRejectedMove(ctx, approach.state.worker, target);
  if (rejectedMove) {
    const reason = (
      rejectedMove.result.reason ??
      "Movement to deconstruction contact was rejected"
    ).slice(0, 512);
    releaseDeconstructionApproach(ctx, facts, row, approach, "blocked", reason);
    return;
  }
  if (distance(pose.world, target) > 1e-7) {
    ctx.action(move(approach.state.worker, target));
    return;
  }
  const seconds = Math.min(state.seconds + ctx.clock.delta, access.workSeconds);
  const phase = seconds >= access.workSeconds ? "submitting" : "working";
  ctx.write(DeconstructionOrder, row.id, {
    ...state,
    actor: approach.state.worker,
    phase,
    seconds,
    reason: "",
    retryKey: "",
  });
  if (phase === "submitting")
    ctx.action(deconstruct(approach.state.worker, state.site));
}

function progressDeconstruction(
  ctx: WriteContext,
  facts: DeconstructionFacts,
  orders: readonly QueryRow<DeconstructionOrderState>[],
): void {
  for (const row of orders) {
    const approach = facts.approaches.get(row.id);
    if (approach && row.get(DeconstructionOrder).phase !== "submitting")
      progressApproach(ctx, facts, row, approach);
  }
}
