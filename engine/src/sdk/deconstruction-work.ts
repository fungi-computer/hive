import { component, entity, query } from "./authoring";
import { ConstructionSite } from "./construction";
import { OwnedByParty, PartyMember } from "./party";
import {
  Body,
  Container,
  Destination,
  ExcavationWork,
  MaterialLot,
  Support,
  Traversal,
} from "./common";
import type { PreparedWorkProvider } from "./work-system";
import {
  acknowledgeWorkAttempt,
  beginRouteWorkAttempt,
  continueDeconstructionWorkAttempt,
  interruptWorkAttempt,
  workAttempt,
} from "./work-attempt";
import type {
  ConstructionAccessContact,
  DeconstructionAccess,
  EntityId,
  EntityRecord,
  WriteContext,
} from "../contracts";

type DeconstructionOrderState = {
  site: EntityId;
  contactX: number;
  contactY: number;
  contactZ: number;
  salvageQuantity: number;
  workSeconds: number;
  status: "queued" | "complete" | "blocked";
  reason: string;
  retryKey: string;
};
export const DeconstructionOrder = component<DeconstructionOrderState>(
  "hive.deconstruction-order",
  {
    version: 4,
    fields: {
      site: "string",
      contactX: "number",
      contactY: "number",
      contactZ: "number",
      salvageQuantity: "number",
      workSeconds: "number",
      status: "string",
      reason: "string",
      retryKey: "string",
    },
  },
);

type Candidate = {
  readonly worker: EntityId;
  readonly task: EntityId;
  readonly site: EntityId;
  readonly contacts: readonly ConstructionAccessContact[];
  readonly party: EntityId;
};
const target = (contact: ConstructionAccessContact) => ({
  x: contact.x,
  y: contact.y,
  z: contact.z,
  frame: contact.frame,
});
const distance = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const sameTarget = (
  a: { x: number; y: number; z: number; frame: EntityId | null },
  b: ConstructionAccessContact,
) => a.x === b.x && a.y === b.y && a.z === b.z && a.frame === b.frame;
const retryKey = (
  info: DeconstructionAccess | undefined,
  party: EntityId | undefined,
  workers: readonly EntityId[],
  members: ReadonlyMap<EntityId, EntityId>,
  quantities: ReadonlyMap<EntityId, number>,
  containers: ReadonlyMap<EntityId, { readonly capacity: number }>,
) => {
  const freeCapacity = workers
    .filter((worker) => members.get(worker) === party)
    .reduce(
      (maximum, worker) =>
        Math.max(
          maximum,
          (containers.get(worker)?.capacity ?? 0) -
            (quantities.get(worker) ?? 0),
        ),
      0,
    );
  const contacts =
    info?.contacts
      .map(
        (contact) =>
          `${contact.x},${contact.y},${contact.z},${contact.frame},${contact.kind}`,
      )
      .join(";") ?? "";
  return `${info?.status ?? "missing"}|${info?.salvageQuantity ?? 0}|${info?.workSeconds ?? 0}|${contacts}|${freeCapacity}`;
};

/** Queue intent owns target/progress/result facts; native WorkAttempt owns attendance. */
export const queueDeconstruction = (site: EntityId): EntityRecord => {
  const id = entity(`deconstruction-order.${site.length}:${site}`);
  return {
    id,
    components: {
      [DeconstructionOrder.id]: {
        site,
        contactX: 0,
        contactY: 0,
        contactZ: 0,
        salvageQuantity: 0,
        workSeconds: 0,
        status: "queued",
        reason: "",
        retryKey: "",
      },
    },
  };
};

export function deconstructionWorkProvider(
  ctx: WriteContext,
  workers: readonly EntityId[],
  suspendedActors: ReadonlySet<EntityId>,
): PreparedWorkProvider<Candidate> {
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
  const owners = new Map(
    ctx
      .query(query(OwnedByParty))
      .map((row) => [row.id, row.get(OwnedByParty).party] as const),
  );
  const members = new Map(
    ctx
      .query(query(PartyMember))
      .map((row) => [row.id, row.get(PartyMember).party] as const),
  );
  const bodies = new Map(
    ctx.query(query(Body)).map((row) => [row.id, row.get(Body)] as const),
  );
  const containers = new Map(
    ctx
      .query(query(Container))
      .map((row) => [row.id, row.get(Container)] as const),
  );
  const traversals = new Set(ctx.query(query(Traversal)).map((row) => row.id));
  const destinations = new Set(
    ctx.query(query(Destination)).map((row) => row.id),
  );
  const supports = new Set(ctx.query(query(Support)).map((row) => row.id));
  const excavations = new Set(
    ctx.query(query(ExcavationWork)).map((row) => row.id),
  );
  const quantities = new Map<EntityId, number>();
  for (const row of ctx.query(query(MaterialLot))) {
    const lot = row.get(MaterialLot);
    quantities.set(
      lot.container,
      (quantities.get(lot.container) ?? 0) + lot.quantity,
    );
  }
  const siteIds = [
    ...new Set(orders.map((row) => row.get(DeconstructionOrder).site)),
  ];
  const access = new Map(
    (siteIds.length ? ctx.deconstructionAccess(siteIds) : []).map(
      (row) => [row.site, row] as const,
    ),
  );
  const attempts = new Map(
    (ctx.workAttempts?.(orders.map((row) => row.id)) ?? []).map(
      (attempt) => [attempt.key.task, attempt] as const,
    ),
  );
  const poses = new Map<EntityId, { x: number; y: number; z: number }>();
  for (let i = 0; i < workers.length; i += 128)
    for (const pose of ctx.worldPoses(workers.slice(i, i + 128)))
      poses.set(pose.id, pose.world);

  const liveSites = new Set<EntityId>();
  const candidates: Candidate[] = [];
  for (const row of orders) {
    const state = row.get(DeconstructionOrder);
    const site = sites.get(state.site);
    const info = access.get(state.site);
    const party = owners.get(state.site);
    const attempt = attempts.get(row.id);
    const currentRetryKey = retryKey(
      info,
      party,
      workers,
      members,
      quantities,
      containers,
    );
    // Establish stable first-order ownership before attempt/status branching.
    // A committed deconstruction can remove its site before reconciliation.
    if (liveSites.has(state.site)) {
      if (!attempt) ctx.removeAuthoredEntity(row.id);
      continue;
    }
    liveSites.add(state.site);
    if (attempt) continue;
    if (
      !site ||
      !info ||
      site.phase !== "finished" ||
      info.status !== "ready" ||
      !info.contacts.length ||
      !party
    ) {
      if (!site) ctx.removeAuthoredEntity(row.id);
      continue;
    }
    if (
      state.status === "complete" ||
      (state.status === "blocked" && state.retryKey === currentRetryKey)
    )
      continue;
    for (const worker of workers) {
      const body = bodies.get(worker),
        pose = poses.get(worker),
        container = containers.get(worker);
      if (
        suspendedActors.has(worker) ||
        !pose ||
        !body ||
        body.speed <= 0 ||
        !container ||
        !traversals.has(worker) ||
        destinations.has(worker) ||
        supports.has(worker) ||
        excavations.has(worker) ||
        members.get(worker) !== party ||
        (quantities.get(worker) ?? 0) + info.salvageQuantity >
          container.capacity
      )
        continue;
      candidates.push({
        worker,
        task: row.id,
        site: state.site,
        contacts: info.contacts,
        party,
      });
    }
  }
  const routed = new Map<string, ConstructionAccessContact>();
  const byPair = new Map(
    candidates.map((candidate) => [
      `${candidate.task}\\0${candidate.worker}`,
      candidate,
    ]),
  );
  const claims = orders.flatMap((row) => {
    const attempt = attempts.get(row.id);
    return attempt ? [{ task: row.id, actor: attempt.worker }] : [];
  });
  return {
    claims,
    occupiedActors: [
      ...new Set([...attempts.values()].map((attempt) => attempt.worker)),
    ],
    candidates,
    lowerBound: (candidate) => {
      const pose = poses.get(candidate.worker);
      return pose
        ? Math.min(
            ...candidate.contacts.map((contact) => distance(pose, contact)),
          )
        : Number.POSITIVE_INFINITY;
    },
    estimate: (candidate) => {
      const result = ctx.routeToAny({
        actor: candidate.worker,
        targets: candidate.contacts.map(target),
      });
      if (result.status !== "reachable") return null;
      const contact = candidate.contacts[result.targetIndex];
      if (!contact) return null;
      routed.set(`${candidate.task}\\0${candidate.worker}`, contact);
      return result.cost;
    },
    apply: (assignments) => {
      for (const assignment of assignments) {
        const candidate = byPair.get(
          `${assignment.task}\\0${assignment.worker}`,
        );
        const contact =
          candidate && routed.get(`${assignment.task}\\0${assignment.worker}`);
        if (candidate && contact)
          beginRouteWorkAttempt(
            ctx,
            candidate.task,
            candidate.worker,
            candidate.party,
            target(contact),
          );
      }
    },
    progress: () => {
      for (const row of orders) {
        const attempt = workAttempt(ctx, row.id);
        if (!attempt) continue;
        const state = row.get(DeconstructionOrder),
          info = access.get(state.site),
          phase = attempt.phase;
        // A retained route outcome must be acknowledged while drafted so the
        // worker is released and the queued task can be assigned again. A
        // completed deconstruction outcome is different: its physical effect
        // is already committed and must be reconciled exactly once.
        if (
          suspendedActors.has(attempt.worker) &&
          !(
            phase.kind === "outcome" &&
            phase.result.kind === "completed" &&
            phase.activity.kind === "deconstruction"
          )
        ) {
          if (phase.kind === "executing")
            interruptWorkAttempt(
              ctx,
              attempt.key,
              phase.operation.sequence,
              "workerUnavailable",
            );
          else if (phase.kind === "outcome")
            acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
          continue;
        }
        const activity =
          phase.kind === "executing" || phase.kind === "outcome"
            ? phase.activity
            : null;
        if (
          phase.kind === "executing" &&
          (!info || info.status !== "ready" || !activity ||
            (activity.kind === "route" && !info.contacts.some((contact) => sameTarget(activity.destination, contact))) ||
            (activity.kind === "deconstruction" && (!info.contacts.some((contact) => sameTarget(activity.contact, contact)) || !sites.has(activity.site))) ||
            (activity.kind !== "route" && activity.kind !== "deconstruction"))
        ) {
          interruptWorkAttempt(
            ctx,
            attempt.key,
            phase.operation.sequence,
            "accessLost",
          );
          continue;
        }
        if (phase.kind !== "outcome") continue;
        if (phase.result.kind !== "completed") {
          ctx.write(DeconstructionOrder, row.id, {
            ...state,
            status: "blocked",
            reason: (phase.result.kind === "blocked"
              ? phase.result.reason
              : "Deconstruction was interrupted"
            ).slice(0, 512),
            retryKey: retryKey(
              info,
              owners.get(state.site),
              workers,
              members,
              quantities,
              containers,
            ),
          });
          acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
          continue;
        }
        const completedActivity = phase.activity;
        if (completedActivity.kind === "route") {
          const contact = info?.contacts.find((item) =>
            sameTarget(completedActivity.destination, item),
          );
          if (contact && info) {
            // Persist the exact native admission facts before continuing. The
            // site may disappear before the deconstruction outcome is read.
            ctx.write(DeconstructionOrder, row.id, {
              ...state,
              contactX: contact.x,
              contactY: contact.y,
              contactZ: contact.z,
              salvageQuantity: info.salvageQuantity,
              workSeconds: info.workSeconds,
            });
            continueDeconstructionWorkAttempt(
              ctx,
              attempt.key,
              phase.operation.sequence,
              state.site,
              contact,
            );
          } else
            acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
        } else if (completedActivity.kind === "deconstruction") {
          ctx.write(DeconstructionOrder, row.id, {
            ...state,
            contactX: completedActivity.contact.x,
            contactY: completedActivity.contact.y,
            contactZ: completedActivity.contact.z,
            salvageQuantity: info?.salvageQuantity ?? state.salvageQuantity,
            workSeconds: info?.workSeconds ?? state.workSeconds,
            status: "complete",
            reason: "",
            retryKey: "",
          });
          acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
        } else
          acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
      }
    },
  };
}
