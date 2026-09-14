import { component, query } from "../sdk/authoring";
import { Body, Container, Destination, MaterialLot, Position, Support, Surface, exchangeFieldWater, move } from "../sdk/common";
import { shouldRetryWorkTask, type PreparedWorkProvider } from "../sdk/work-system";
import type { EntityId, MoveDestination, WriteContext } from "../contracts";
import { Worker } from "./colony-components";
import { OwnedByParty, PartyMember } from "../sdk/party";
import { acknowledgeWorkAttempt, beginRouteWorkAttempt, continueFieldWaterWorkAttempt, workAttemptsFor } from "../sdk/work-attempt";

export type WaterSupplyPhase = "queued" | "complete" | "blocked";
type WaterSupplyState = {
  request: number; phase: WaterSupplyPhase;
  x: number; y: number; z: number; reason: string;
};
export const WaterSupplyWork = component<WaterSupplyState>("colony.water-supply-work", { version: 2, fields: {
  request: "number", phase: "string", x: "number", y: "number", z: "number", reason: "string",
} });

export const WaterSupplyOrder = component<{
  revision: number;
  consumer: EntityId | null;
  party: EntityId | null;
}>("colony.water-supply-order", {
  version: 4,
  fields: {
    revision: "number",
    consumer: "nullable-entity",
    party: "nullable-entity",
  },
});

type WaterOption = { readonly cell: readonly [number, number, number]; readonly approaches: readonly MoveDestination[] };
type Candidate = { readonly worker: EntityId; readonly task: EntityId; readonly vessel: EntityId; readonly options: readonly WaterOption[] };
const WATER_CONTACT_CENTER_LIMIT = 16;
const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function waterSupplyProvider(ctx: WriteContext, suspended: ReadonlySet<EntityId>): PreparedWorkProvider<Candidate> {
  const nativeRows = [...ctx.query(query(WaterSupplyWork, WaterSupplyOrder))].sort((a, b) => a.id.localeCompare(b.id));
  const attempts = new Map(workAttemptsFor(ctx, nativeRows.map(row => row.id)).map(attempt => [attempt.key.task, attempt]));
  const owners = new Map(ctx.query(query(OwnedByParty)).map(row => [row.id, row.get(OwnedByParty).party]));
  const liveDemandRows = nativeRows.filter(row => {
    if (attempts.has(row.id)) return false;
    const state = row.get(WaterSupplyWork), order = row.get(WaterSupplyOrder), party = owners.get(row.id);
    return (state.phase === "queued" || state.phase === "blocked" && shouldRetryWorkTask(row.id, ctx.clock.tick)) &&
      order.revision === state.request && !!party && order.party === party;
  });
  const claims = nativeRows.map((row) => ({
    task: row.id,
    actor: attempts.get(row.id)?.worker ?? null,
  }));
  if (!liveDemandRows.length && !attempts.size) {
    return {
      claims,
      candidates: [],
      lowerBound: () => Number.POSITIVE_INFINITY,
      estimate: () => null,
      apply: () => {},
      progress: () => {},
    };
  }
  const members = new Map(ctx.query(query(PartyMember)).map(row => [row.id, row.get(PartyMember).party]));
  const demandedParties = new Set(liveDemandRows.map(row => owners.get(row.id)).filter((party): party is EntityId => !!party));
  const activeWorkers = new Set([...attempts.values()].map(attempt => attempt.worker));
  const lots = ctx.workMaterialFacts().lots;
  const pailContainers = new Set(lots.filter(lot => lot.kind === "pail").map(lot => lot.container));
  const workers = [...ctx.query(query(Worker, Body, Position))]
    .filter(row => {
      const party = members.get(row.id);
      return !row.get(Worker).guest && !suspended.has(row.id) && pailContainers.has(row.id) &&
        ((party !== undefined && demandedParties.has(party)) || activeWorkers.has(row.id));
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const pails = new Map<EntityId, EntityId>(lots.filter(lot => lot.kind === "pail" && workers.some(worker => worker.id === lot.container)).map(lot => [lot.container, lot.id]));
  const poses = new Map((workers.length ? ctx.worldPoses(workers.map(row => row.id)) : []).map(pose => [pose.id, pose.local]));
  const centers = workers.flatMap(worker => { const pose = poses.get(worker.id); return pose ? [[Math.round(pose.x), Math.round(pose.y), Math.round(pose.z)] as [number, number, number]] : []; });
  // KernelPort deliberately accepts at most sixteen centers. Query every
  // current worker in stable batches so larger colonies retain the same
  // planning coverage without turning a bounded native call into a crash.
  const contacts: Array<ReturnType<WriteContext["waterContacts"]>[number]> = [];
  for (let offset = 0; offset < centers.length; offset += WATER_CONTACT_CENTER_LIMIT) {
    contacts.push(...ctx.waterContacts(centers.slice(offset, offset + WATER_CONTACT_CENTER_LIMIT)));
  }
  const candidates: Candidate[] = [];
  for (const row of liveDemandRows) {
    const state = row.get(WaterSupplyWork), party = owners.get(row.id), order = row.get(WaterSupplyOrder);
    const retryBlocked = state.phase === "blocked" && shouldRetryWorkTask(row.id, ctx.clock.tick);
    if ((state.phase !== "queued" && !retryBlocked) || order.revision !== state.request || !party || order.party !== party) continue;
    for (const worker of workers) {
      const vessel = pails.get(worker.id);
      if (!vessel || members.get(worker.id) !== party) continue;
      const options = contacts.map(contact => ({ cell: contact.at, approaches: contact.approaches })).filter(option => option.approaches.length).slice(0, 8);
      if (options.length) candidates.push({ worker: worker.id, task: row.id, vessel, options });
    }
  }
  const selected = new Map<string, { cell: readonly [number, number, number]; approach: MoveDestination }>();
  return {
    claims,
    candidates,
    lowerBound: (candidate) => {
      const pose = poses.get(candidate.worker);
      return pose
        ? Math.min(
            ...candidate.options.flatMap((option) =>
              option.approaches.map((target) =>
                Math.hypot(pose.x - target.x, pose.z - target.z),
              ),
            ),
          )
        : Number.POSITIVE_INFINITY;
    },
    estimate: (candidate) => {
      const targets = candidate.options.flatMap((option) =>
        option.approaches.map((approach) => ({ option, approach })),
      );
      const result = ctx.routeToAny({
        actor: candidate.worker,
        targets: targets.map((target) => target.approach),
      });
      if (result.status !== "reachable") return null;
      const target = targets[result.targetIndex];
      if (!target) return null;
      selected.set(`${candidate.task}\0${candidate.worker}`, {
        cell: target.option.cell,
        approach: target.approach,
      });
      return result.cost;
    },
    apply: (assignments) => {
      for (const assignment of assignments) {
        const candidate = candidates.find(
            (item) =>
              item.task === assignment.task &&
              item.worker === assignment.worker,
          ),
          party = owners.get(assignment.task),
          target = selected.get(`${assignment.task}\0${assignment.worker}`);
        if (!candidate || !party || !target) continue;
        beginRouteWorkAttempt(
          ctx,
          assignment.task,
          assignment.worker,
          party,
          target.approach,
        );
      }
    },
    progress: () => {
      for (const row of nativeRows) {
        const attempt = attempts.get(row.id);
        if (!attempt || attempt.phase.kind !== "outcome") continue;
        const state = row.get(WaterSupplyWork),
          phase = attempt.phase,
          activity = phase.activity;
        if (
          suspended.has(attempt.worker) &&
          (phase.result.kind !== "completed" || activity.kind === "route")
        ) {
          ctx.write(WaterSupplyWork, row.id, {
            ...state,
            phase: "blocked",
            reason: "Drafted",
          });
          acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
          continue;
        }
        if (phase.result.kind !== "completed") {
          ctx.write(WaterSupplyWork, row.id, {
            ...state,
            phase: "blocked",
            reason:
              phase.result.kind === "blocked"
                ? phase.result.reason
                : phase.result.cause,
          });
          acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
          continue;
        }
        if (activity.kind === "route") {
          const pail = pails.get(attempt.worker),
            contact = contacts.find((item) =>
              item.approaches.some(
                (approach) =>
                  approach.x === activity.destination.x &&
                  approach.y === activity.destination.y &&
                  approach.z === activity.destination.z,
              ),
            );
          if (!pail || !contact) {
            ctx.write(WaterSupplyWork, row.id, {
              ...state,
              phase: "blocked",
              reason: "worker unavailable",
            });
            acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
            continue;
          }
          continueFieldWaterWorkAttempt(
            ctx,
            attempt.key,
            phase.operation.sequence,
            pail,
            contact.at,
            "withdraw",
            1,
          );
        } else if (activity.kind === "field-water") {
          ctx.write(WaterSupplyWork, row.id, {
            ...state,
            phase: "complete",
            x: activity.cell[0],
            y: activity.cell[1],
            z: activity.cell[2],
            reason: "",
          });
          acknowledgeWorkAttempt(ctx, attempt.key, phase.operation.sequence);
        }
      }
    },
  };
}
