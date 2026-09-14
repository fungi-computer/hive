import { component, entity, query } from "./authoring";
import { GroundStock } from "./ground-stock";
import { ConstructionSite, SealedContainer } from "./construction";
import { WorkParticipation } from "./work-control";
import { PartyMember } from "./party";
import { createWorkSystem, type PreparedWorkProvider } from "./work-system";
import {
  MaterialLot,
  Body,
  Container,
  Position,
  Destination,
  ExcavationWork,
} from "./common";
import {
  beginRouteWorkAttempt,
  continueRouteWorkAttempt,
  continueMaterialTransferAttempt,
  continueMaterialDropAttempt,
  acknowledgeWorkAttempt,
} from "./work-attempt";
import type {
  EntityId,
  MoveDestination,
  Vec3,
  WorldPose,
  WriteContext,
} from "../contracts";

/** A delivery is an obligation. Labor is represented only by WorkAttempt. */
export type DeliveryCustody = "available" | "held" | "delivered" | "dropped";
export const isDeliveryCustody = (value: string): value is DeliveryCustody =>
  value === "available" ||
  value === "held" ||
  value === "delivered" ||
  value === "dropped";
export type DeliveryObligation =
  | { readonly version: 2; readonly kind: "available"; readonly lot: EntityId }
  | { readonly version: 2; readonly kind: "held"; readonly lot: EntityId }
  | { readonly version: 2; readonly kind: "delivered"; readonly lot: EntityId }
  | {
      readonly version: 2;
      readonly kind: "dropped";
      readonly lot: EntityId;
      readonly ground: EntityId;
    };
export function decodeDeliveryObligation(value: unknown): DeliveryObligation {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("delivery obligation must be an object");
  const row = value as Record<string, unknown>;
  if (
    row.version !== 2 ||
    typeof row.lot !== "string" ||
    typeof row.kind !== "string"
  )
    throw new Error("unsupported delivery obligation version or shape");
  const keys = Object.keys(row);
  if (
    row.kind === "available" ||
    row.kind === "held" ||
    row.kind === "delivered"
  ) {
    if (keys.length !== 3)
      throw new Error("delivery obligation custody shape is invalid");
    return { version: 2, kind: row.kind, lot: row.lot as EntityId };
  }
  if (
    row.kind === "dropped" &&
    typeof row.ground === "string" &&
    keys.length === 4
  )
    return {
      version: 2,
      kind: "dropped",
      lot: row.lot as EntityId,
      ground: row.ground as EntityId,
    };
  throw new Error("invalid delivery obligation custody");
}
export const DeliveryControl = component<{
  enabled: boolean;
  quantity: number;
}>("hive.delivery-control", {
  version: 1,
  fields: { enabled: "boolean", quantity: "number" },
});
const deliveryTaskDefinition = component<{
  version: 2;
  party: EntityId;
  sourceLot: EntityId;
  source: EntityId;
  destination: EntityId;
  material: string;
  quantity: number;
  custody: DeliveryCustody;
  ground: EntityId | null;
}>("hive.delivery-task", {
  version: 2,
  fields: {
    version: "number",
    party: "entity",
    sourceLot: "entity",
    source: "entity",
    destination: "entity",
    material: "string",
    quantity: "number",
    custody: "string",
    ground: "nullable-entity",
  },
});
export type DeliveryTaskValue = {
  readonly version: 2;
  readonly party: EntityId;
  readonly sourceLot: EntityId;
  readonly source: EntityId;
  readonly destination: EntityId;
  readonly material: string;
  readonly quantity: number;
  readonly custody: DeliveryCustody;
  readonly ground: EntityId | null;
};
export function decodeDeliveryTask(value: unknown): DeliveryTaskValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("delivery task must be an object");
  const row = value as Record<string, unknown>;
  const expected = [
    "version",
    "party",
    "sourceLot",
    "source",
    "destination",
    "material",
    "quantity",
    "custody",
    "ground",
  ];
  if (
    Object.keys(row).length !== expected.length ||
    expected.some((key) => !(key in row))
  )
    throw new Error("delivery task shape is incomplete");
  if (
    row.version !== 2 ||
    typeof row.material !== "string" ||
    typeof row.quantity !== "number" ||
    !Number.isSafeInteger(row.quantity) ||
    row.quantity <= 0
  )
    throw new Error("unsupported delivery task version or quantity");
  if (
    ![row.party, row.sourceLot, row.source, row.destination].every(
      (value) => typeof value === "string",
    )
  )
    throw new Error("delivery task entity field is invalid");
  const party = entity(row.party as string),
    sourceLot = entity(row.sourceLot as string),
    source = entity(row.source as string),
    destination = entity(row.destination as string);
  if (!isDeliveryCustody(String(row.custody)))
    throw new Error("invalid delivery task custody");
  const custody = String(row.custody) as DeliveryCustody;
  if ((custody === "dropped") !== (row.ground !== null))
    throw new Error("delivery task ground does not match custody");
  if (row.ground !== null && typeof row.ground !== "string")
    throw new Error("delivery task ground is invalid");
  const ground = row.ground === null ? null : entity(row.ground);
  return {
    version: 2,
    party,
    sourceLot,
    source,
    destination,
    material: row.material,
    quantity: row.quantity,
    custody,
    ground,
  };
}
export const DeliveryTask = {
  ...deliveryTaskDefinition,
  validate(value: unknown): value is DeliveryTaskValue {
    try {
      decodeDeliveryTask(value);
      return true;
    } catch {
      return false;
    }
  },
};

type Lot = {
  readonly id: EntityId;
  readonly container: EntityId;
  readonly kind: string;
  readonly quantity: number;
};
type Candidate = {
  readonly worker: EntityId;
  readonly task: EntityId;
  readonly actorPosition: Vec3;
  readonly sourceTarget: MoveDestination;
};
const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const target = (pose: WorldPose): MoveDestination => ({
  x: pose.local.x,
  y: pose.local.y,
  z: pose.local.z,
  frame: pose.support,
});

/**
 * Shared delivery owner. It does not inspect ActionOutcome and has no actor or
 * phase fields. Native attempts own route, transfer, and drop identity; the
 * MaterialLot container is the only physical custody fact.
 */
export function deliveryProvider(
  ctx: WriteContext,
  suspendedActors: ReadonlySet<EntityId>,
): PreparedWorkProvider<Candidate> {
  const taskRows = ctx.query(query(DeliveryTask));
  const tasks = taskRows.map((row) => ({
    id: row.id,
    state: decodeDeliveryTask(row.get(DeliveryTask)),
  }));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const attemptRows = ctx.workAttempts
    ? tasks.flatMap((_, index) =>
        index % 64 === 0
          ? ctx.workAttempts!(
              tasks.slice(index, index + 64).map(({ id }) => id),
            )
          : [],
      )
    : [];
  const attempts = new Map(
    attemptRows.map((attempt) => [attempt.key.task, attempt]),
  );
  const facts = ctx.workMaterialFacts();
  const lots = new Map(facts.lots.map((lot) => [lot.id, lot]));
  const containers = new Map(
    facts.containers.map((container) => [container.id, container]),
  );
  const sealed = new Set(
    facts.containers
      .filter((container) => container.sealed)
      .map((container) => container.id),
  );
  const members = new Map(
    ctx
      .query(query(PartyMember))
      .map((row) => [row.id, row.get(PartyMember).party]),
  );
  const controls = new Map(
    ctx
      .query(query(DeliveryControl))
      .map((row) => [row.id, row.get(DeliveryControl)]),
  );
  const bodies = new Map(
    ctx.query(query(Body)).map((row) => [row.id, row.get(Body)]),
  );
  const positions = new Map(
    ctx.query(query(Position)).map((row) => [row.id, row.get(Position)]),
  );
  const moving = new Set(ctx.query(query(Destination)).map((row) => row.id));
  const occupied = new Set(
    ctx.query(query(ExcavationWork)).map((row) => row.id),
  );
  // Native pose batches are all-or-nothing. Unbound construction sites and
  // other not-yet-placed containers intentionally have no position, so only
  // ask for entities with the canonical Position capability. A delivery to an
  // unbound destination remains in ordinary available custody until the
  // construction owner publishes its contact.
  const poseIds = [...positions.keys()];
  const poses = new Map(ctx.worldPoses(poseIds).map((pose) => [pose.id, pose]));
  const positionForContainer = (container: EntityId): WorldPose | undefined => {
    let current = container;
    const seen = new Set<EntityId>();
    for (let depth = 0; depth < 16 && !seen.has(current); depth++) {
      seen.add(current);
      const pose = poses.get(current);
      if (pose) return pose;
      const carrier = lots.get(current);
      if (!carrier) return undefined;
      current = carrier.container;
    }
    return undefined;
  };
  const quantityByContainer = new Map<EntityId, number>();
  for (const lot of lots.values())
    quantityByContainer.set(
      lot.container,
      (quantityByContainer.get(lot.container) ?? 0) + lot.quantity,
    );
  const hasCapacity = (id: EntityId, quantity: number) => {
    const capacity = containers.get(id)?.capacity;
    const used = quantityByContainer.get(id) ?? 0;
    return (
      Number.isSafeInteger(capacity) &&
      capacity! >= 0 &&
      Number.isSafeInteger(used) &&
      used + quantity <= capacity!
    );
  };
  const claims = tasks.map(({ id }) => ({
    task: id,
    actor: attempts.get(id)?.worker ?? null,
  }));
  const candidates: Candidate[] = [];
  for (const { id, state } of tasks) {
    const decoded = decodeDeliveryObligation({
      version: state.version,
      kind: state.custody,
      lot: state.sourceLot,
      ...(state.custody === "dropped" ? { ground: state.ground } : {}),
    });
    if (decoded.lot !== state.sourceLot)
      throw new Error("delivery lot identity mismatch");
    if (state.custody === "delivered" || attempts.has(id)) continue;
    const lot = lots.get(state.sourceLot);
    if (!lot || lot.kind !== state.material || lot.quantity < state.quantity)
      continue;
    if (
      state.source === state.destination ||
      state.quantity <= 0 ||
      !Number.isSafeInteger(state.quantity) ||
      !state.party
    )
      continue;
    const source = positionForContainer(lot.container);
    const destination = poses.get(state.destination);
    if (!source || !destination) continue;
    if (
      sealed.has(lot.container) ||
      sealed.has(state.destination) ||
      !hasCapacity(state.destination, state.quantity)
    )
      continue;
    for (const [worker, control] of controls) {
      if (
        !control.enabled ||
        suspendedActors.has(worker) ||
        occupied.has(worker) ||
        moving.has(worker) ||
        members.get(worker) !== state.party ||
        !bodies.has(worker)
      )
        continue;
      if (state.custody === "held" && lot.container !== worker) continue;
      if (lot.container !== worker && !hasCapacity(worker, state.quantity))
        continue;
      const pose = poses.get(worker);
      if (!pose) continue;
      candidates.push({
        worker,
        task: id,
        actorPosition: pose.world,
        sourceTarget:
          lot.container === worker ? target(destination) : target(source),
      });
    }
  }
  const selected = new Map<string, MoveDestination>();
  return {
    claims,
    occupiedActors: [...occupied],
    candidates,
    lowerBound: () => 0,
    estimate: (candidate) => {
      const task = taskById.get(candidate.task);
      if (!task) return null;
      const lot = lots.get(task.state.sourceLot);
      const source =
        lot?.container === candidate.worker
          ? undefined
          : ctx.routeCosts([
              { actor: candidate.worker, target: candidate.sourceTarget },
            ])[0];
      if (
        lot?.container !== candidate.worker &&
        (!source || source.status !== "reachable")
      )
        return null;
      const contacts = ctx.transferContacts({
        worker: candidate.worker,
        container: task.state.destination,
      });
      if (contacts.kind !== "ready") return null;
      const destination = ctx.routeToAny({
        actor: candidate.worker,
        targets: contacts.targets,
      });
      if (destination.status !== "reachable") return null;
      const contact = contacts.targets[destination.targetIndex];
      if (!contact) return null;
      selected.set(`${candidate.task}\0${candidate.worker}`, contact);
      // A holder is already at the pickup frontier: its estimate is one
      // destination route. A source lot needs the source leg plus a bounded
      // destination estimate from the same current pose.
      const destinationCost = destination.cost;
      const sourceCost =
        source && source.status === "reachable" ? source.cost : 0;
      return lot?.container === candidate.worker
        ? destinationCost
        : sourceCost + destinationCost;
    },
    apply: (assignments) => {
      for (const assignment of assignments) {
        const task = taskById.get(assignment.task);
        if (!task || attempts.has(task.id)) continue;
        const lot = lots.get(task.state.sourceLot);
        if (!lot) continue;
        const source = positionForContainer(lot.container);
        if (!source) continue;
        beginRouteWorkAttempt(
          ctx,
          task.id,
          assignment.worker,
          task.state.party,
          lot.container === assignment.worker
            ? (selected.get(`${task.id}\0${assignment.worker}`) ??
                target(poses.get(task.state.destination)!))
            : target(source),
        );
      }
    },
    progress: () => {
      for (const { id, state } of tasks) {
        let lot = lots.get(state.sourceLot);
        if (!lot) continue;
        if (
          state.custody === "dropped" &&
          lot.container !== state.destination
        ) {
          ctx.write(DeliveryTask, id, {
            ...state,
            source: lot.container,
            ground: null,
            custody: "available",
          });
          continue;
        }
        const attempt = attempts.get(id);
        if (!attempt || attempt.phase.kind !== "outcome") continue;
        if (attempt.phase.activity.kind === "material-transfer") {
          const committedLot = lots.get(attempt.phase.activity.lot);
          if (!committedLot)
            throw new Error("committed delivery lot is missing");
          lot = committedLot;
        }
        const sequence = attempt.phase.operation.sequence;
        const reconcileLotCustody = () => {
          if (lot.container === state.destination) {
            if (state.custody !== "delivered")
              ctx.write(DeliveryTask, id, {
                ...state,
                sourceLot: lot.id,
                custody: "delivered",
                ground: null,
              });
            return;
          }
          if (lot.container === attempt.worker && state.custody !== "held")
            ctx.write(DeliveryTask, id, {
              ...state,
              sourceLot: lot.id,
              custody: "held",
              ground: null,
            });
        };
        if (
          attempt.phase.result.kind === "blocked" ||
          attempt.phase.result.kind === "interrupted"
        ) {
          reconcileLotCustody();
          acknowledgeWorkAttempt(ctx, attempt.key, sequence);
          continue;
        }
        const activity = attempt.phase.activity;
        if (activity.kind === "route") {
          // A route outcome is complete and can be acknowledged even when the
          // worker is drafted. Preserve any real lot custody first, then leave
          // the worker immediately available for manual control.
          if (suspendedActors.has(attempt.worker)) {
            reconcileLotCustody();
            acknowledgeWorkAttempt(ctx, attempt.key, sequence);
            continue;
          }
          if (lot.container === attempt.worker) {
            // Pickup is already committed. Persist held custody in the same
            // authored candidate that admits the destination route.
            if (state.custody !== "held")
              ctx.write(DeliveryTask, id, {
                ...state,
                custody: "held",
                ground: null,
              });
            continueMaterialTransferAttempt(
              ctx,
              attempt.key,
              sequence,
              lot.id,
              attempt.worker,
              state.destination,
              state.quantity,
            );
          } else
            continueMaterialTransferAttempt(
              ctx,
              attempt.key,
              sequence,
              lot.id,
              lot.container,
              attempt.worker,
              state.quantity,
            );
        } else if (activity.kind === "material-transfer") {
          if (lot.container === state.destination) {
            reconcileLotCustody();
            acknowledgeWorkAttempt(ctx, attempt.key, sequence);
          } else if (lot.container === attempt.worker) {
            // Pickup is already physical truth. Record that custody in the
            // same candidate before either pausing or admitting the next leg.
            reconcileLotCustody();
            if (suspendedActors.has(attempt.worker)) {
              // Pickup is already committed and the lot remains in the real
              // worker container. Preserve that obligation for Undraft.
              acknowledgeWorkAttempt(ctx, attempt.key, sequence);
              continue;
            }
            const contacts = ctx.transferContacts({
              worker: attempt.worker,
              container: state.destination,
            });
            if (contacts.kind === "ready") {
              const route = ctx.routeToAny({
                actor: attempt.worker,
                targets: contacts.targets,
              });
              const selected =
                route.status === "reachable"
                  ? contacts.targets[route.targetIndex]
                  : undefined;
              if (selected)
                continueRouteWorkAttempt(ctx, attempt.key, sequence, selected);
              else
                continueMaterialDropAttempt(ctx, attempt.key, sequence, lot.id);
            } else
              continueMaterialDropAttempt(ctx, attempt.key, sequence, lot.id);
          }
        } else if (activity.kind === "material-drop") {
          ctx.write(DeliveryTask, id, {
            ...state,
            custody: "dropped",
            ground: lot.container,
          });
          acknowledgeWorkAttempt(ctx, attempt.key, sequence);
        }
        if (state.custody === "dropped" && lot.container !== state.destination)
          ctx.write(DeliveryTask, id, {
            ...state,
            source: lot.container,
            ground: null,
            custody: "available",
          });
      }
    },
  };
}

export const deliverySystem = createWorkSystem({
  id: "hive.delivery",
  version: 2,
  reads: [
    DeliveryTask,
    GroundStock,
    Position,
    Destination,
    Body,
    Container,
    SealedContainer,
    ConstructionSite,
    MaterialLot,
    DeliveryControl,
    PartyMember,
    WorkParticipation,
    ExcavationWork,
  ],
  writes: [DeliveryTask],
  providers: [deliveryProvider],
});
