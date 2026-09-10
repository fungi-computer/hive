import type { Body, Clearing } from "./model.ts";
import {
  route as findRoute,
  beginRoute,
  queueAfterEdge,
  advanceRoute,
  stopRoute,
  position,
  standing,
  type Edge,
  type Footing,
} from "./engine/navigation/index.ts";
import {
  createNavigationSpaces,
  bodyProfile,
  bodyContact,
  carryingProfile,
} from "./navigation-space.ts";

export type RoutePlan = Readonly<{ edges: readonly Edge[]; ticks: number }>;
type RouteIntent = {
  carrying?: boolean;
  bed?: string;
};
/** One current geometry projection per assignment/execution phase. Callers ask
 * for routes or advance one body; they never own edge timing or reset fields.
 * A physical edit ends the phase: its next caller constructs a fresh view. */
export function movement(state: Clearing) {
  const spaces = createNavigationSpaces(state);
  function forBody(body: Body) {
    const base = bodyProfile(state, body);
    function route(
      from: Footing,
      target: Footing,
      intent: RouteIntent = {},
    ): RoutePlan | null {
      const profile = carryingProfile(base, intent.carrying === true);
      const contact = intent.bed
        ? { kind: "bed" as const, site: intent.bed }
        : bodyContact(body);
      const found = findRoute(spaces(contact), from, target, profile);
      return found.kind === "route"
        ? Object.freeze({ edges: found.edges, ticks: found.ticks })
        : null;
    }
    return Object.freeze({
      route,
      standing(at: Footing): boolean {
        return standing(spaces(bodyContact(body)), at, base) === "supported";
      },
      closest(
        from: Footing,
        targets: readonly Footing[],
        intent: RouteIntent = {},
      ): RoutePlan | null {
        let best: RoutePlan | null = null;
        for (const target of targets) {
          const candidate = route(from, target, intent);
          if (candidate && (!best || candidate.ticks < best.ticks))
            best = candidate;
        }
        return best;
      },
    });
  }
  function continuationRoute(body: Body, target: Footing): RoutePlan | null {
    const origin =
      body.traversal && body.traversal.elapsed > 0
        ? body.traversal.edge.to
        : body;
    return forBody(body).route(origin, target);
  }
  function start(body: Body, plan: RoutePlan): boolean {
    const admitted = beginRoute(
      body,
      spaces(bodyContact(body)),
      plan.edges.map((edge) => edge.to),
      bodyProfile(state, body),
    );
    if (admitted.kind !== "edge" && admitted.kind !== "idle") return false;
    body.mode = "walk";
    return true;
  }
  return Object.freeze({
    forBody,
    start,
    canGo(body: Body, target: Footing): boolean {
      return continuationRoute(body, target) !== null;
    },
    go(body: Body, target: Footing): boolean {
      const plan = continuationRoute(body, target);
      if (!plan) return false;
      if (body.traversal && body.traversal.elapsed > 0) {
        queueAfterEdge(
          body,
          plan.edges.map((edge) => edge.to),
        );
        return true;
      }
      return start(body, plan);
    },
    advance(body: Body) {
      const outcome = advanceRoute(
        body,
        spaces(bodyContact(body)),
        bodyProfile(state, body),
      );
      if (body.traversal) face(body, body.traversal.edge.to);
      return outcome;
    },
  });
}

export function face(body: Footing & { dir: number }, target: Footing): void {
  const dx = target.x - body.x,
    dz = target.z - body.z;
  body.dir = dx > 0 ? 1 : dx < 0 ? 3 : dz < 0 ? 2 : 0;
}
export function stopWalking(body: Body): void {
  stopRoute(body);
}
export function visualPosition(body: Body): Footing {
  return position(body);
}
export function routeDestination(body: Body, plan: RoutePlan): Footing {
  return plan.edges.at(-1)?.to ?? body;
}

export type BodyRoutes = ReturnType<ReturnType<typeof movement>["forBody"]>;
