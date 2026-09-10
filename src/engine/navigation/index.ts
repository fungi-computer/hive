/** Physical navigation owns admitted edges and cost-aware routes. Geometry and
 * game access remain explicit capabilities; no world clock or items live here. */
import type { Footing } from "../world/footing.ts";
export type { Footing } from "../world/footing.ts";
export type Profile = Readonly<{
  clearanceVoxels: number;
  maxWadingDepthM: number;
  flatTicks: number;
  upTicks: number;
  downTicks: number;
}>;
export type Link = Readonly<{
  id: string;
  from: Footing;
  to: Footing;
  duration: number;
  via: readonly Footing[];
}>;
export type Edge = Readonly<{
  from: Footing;
  to: Footing;
  kind: "flat" | "up" | "down" | "stair";
  link: string | null;
  duration: number;
  clearanceVoxels: number;
  sweep: readonly Footing[];
}>;
export type Space = {
  point(
    at: readonly [number, number, number],
  ): "solid" | "empty" | "unresolved";
  face(
    axis: "x" | "y" | "z",
    at: readonly [number, number, number],
  ): "closed" | "open" | "unresolved";
  /** Query eligibility for this occupied/swept cell relative to the actual
   * body base; physical point/face clearance remains navigation-owned. */
  access(
    at: Footing,
    body: Readonly<{ footing: Footing; profile: Profile }>,
  ): "allowed" | "blocked" | "needs-data";
  links: readonly Link[];
};
export type Admission =
  { kind: "edge"; edge: Edge } | { kind: "blocked" | "needs-data" };
const key = (p: Footing) => `${p.x},${p.y},${p.z}`;
const compareKey = (a: Footing, b: Footing) =>
  key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
const at = (p: Footing): [number, number, number] => [p.x, p.y, p.z];
const same = (a: Footing, b: Footing) => key(a) === key(b);
const copy = (p: Footing): Footing => Object.freeze({ x: p.x, y: p.y, z: p.z });
const safePoint = (p: Footing): boolean =>
  [p.x, p.y, p.z].every(Number.isSafeInteger);
function checkedPoint(p: Footing) {
  if (!safePoint(p)) throw new Error("invalid navigation footing");
}
function checkedProfile(p: Profile) {
  if (
    ![p.clearanceVoxels, p.flatTicks, p.upTicks, p.downTicks].every(
      (n) => Number.isSafeInteger(n) && n > 0 && n <= 4096,
    ) ||
    p.clearanceVoxels > 32 ||
    !Number.isFinite(p.maxWadingDepthM) ||
    p.maxWadingDepthM < 0
  )
    throw new Error("invalid navigation profile");
}
function clearance(
  space: Space,
  p: Footing,
  height: number,
  profile: Profile,
): "clear" | "blocked" | "needs-data" {
  for (let offset = 0; offset < height; offset++) {
    const y = p.y + offset;
    if (!Number.isSafeInteger(y)) return "needs-data";
    const access = space.access({ x: p.x, y, z: p.z }, { footing: p, profile });
    if (access !== "allowed") return access;
    const material = space.point([p.x, y, p.z]);
    if (material === "unresolved") return "needs-data";
    if (material === "solid") return "blocked";
    if (y > p.y) {
      const face = space.face("y", [p.x, y, p.z]);
      if (face === "unresolved") return "needs-data";
      if (face === "closed") return "blocked";
    }
  }
  return "clear";
}
function supported(
  space: Space,
  p: Footing,
): "supported" | "blocked" | "needs-data" {
  const below = Number.isSafeInteger(p.y - 1)
      ? space.point([p.x, p.y - 1, p.z])
      : "unresolved",
    face = space.face("y", at(p));
  if (below === "solid" || face === "closed") return "supported";
  for (const link of space.links) {
    if (same(link.from, p) || same(link.to, p)) {
      checkedLink(link);
      return "supported";
    }
  }
  return below === "unresolved" || face === "unresolved"
    ? "needs-data"
    : "blocked";
}
/** Real support and body volume are distinct from access/knowledge permission. */
export function standing(
  space: Space,
  p: Footing,
  profile: Profile,
): "supported" | "blocked" | "needs-data" {
  checkedPoint(p);
  checkedProfile(profile);
  const room = clearance(space, p, profile.clearanceVoxels, profile);
  return room === "clear" ? supported(space, p) : room;
}
function checkedLink(link: Link): void {
  if (
    !link.id ||
    link.id.length > 160 ||
    !Number.isSafeInteger(link.duration) ||
    link.duration < 1 ||
    link.duration > 4096 ||
    link.via.length > 64
  )
    throw new Error("invalid navigation link");
  const points = [link.from, ...link.via, link.to];
  for (let i = 0; i < points.length; i++) {
    checkedPoint(points[i]);
    if (i === 0) continue;
    const a = points[i - 1],
      b = points[i];
    // A declared stair route names every crossed horizontal cell. Vertical
    // rise is explicit, bounded content geometry, not an ordinary-step waiver.
    if (
      Math.abs(a.x - b.x) + Math.abs(a.z - b.z) !== 1 ||
      Math.abs(a.y - b.y) > 32
    )
      throw new Error("invalid navigation link sweep");
  }
}
function crossing(
  space: Space,
  a: Footing,
  b: Footing,
  height: number,
): "clear" | "blocked" | "needs-data" {
  const axis = a.x !== b.x ? "x" : "z",
    plane = axis === "x" ? Math.max(a.x, b.x) : Math.max(a.z, b.z);
  for (let offset = 0; offset < height; offset++) {
    const y = Math.max(a.y, b.y) + offset;
    if (!Number.isSafeInteger(y)) return "needs-data";
    const p: [number, number, number] = [a.x, y, a.z];
    p[axis === "x" ? 0 : 2] = plane;
    const face = space.face(axis, p);
    if (face === "unresolved") return "needs-data";
    if (face === "closed") return "blocked";
  }
  return "clear";
}
function swept(
  space: Space,
  points: readonly Footing[],
  height: number,
  profile: Profile,
): "clear" | "blocked" | "needs-data" {
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      room = clearance(space, p, height, profile);
    if (room !== "clear") return room;
    if (i === 0) continue;
    const prior = points[i - 1],
      high = Math.max(prior.y, p.y);
    // Lift/lower within both columns, then cross the actual separating plane.
    for (const column of [prior, p]) {
      // A step's supporting block occupies the low destination voxel. Only the
      // higher-foot sweep may cross horizontally; the low column retains its
      // own vertical sweep up to that elevation.
      if (column.y === high) {
        const upper = clearance(space, column, height, profile);
        if (upper !== "clear") return upper;
      } else {
        const clear = clearance(
          space,
          column,
          height + Math.abs(prior.y - p.y),
          profile,
        );
        if (clear !== "clear") return clear;
      }
    }
    const crossed = crossing(space, prior, p, height);
    if (crossed !== "clear") return crossed;
  }
  return "clear";
}
type EdgeChoice = {
  kind: Edge["kind"];
  duration: number;
  points: readonly Footing[];
  link: string | null;
};
function ordinaryChoice(
  from: Footing,
  to: Footing,
  profile: Profile,
): EdgeChoice | null {
  const horizontal = Math.abs(to.x - from.x) + Math.abs(to.z - from.z),
    dy = to.y - from.y;
  if (horizontal !== 1 || Math.abs(dy) > 1) return null;
  return {
    kind: dy === 0 ? "flat" : dy > 0 ? "up" : "down",
    duration:
      dy === 0
        ? profile.flatTicks
        : dy > 0
          ? profile.upTicks
          : profile.downTicks,
    points: [from, to],
    link: null,
  };
}
/** Candidate enumeration is separate from current clearance. Parallel content
 * identities compete on paid cost; definition order grants no priority. */
function edgeChoices(
  space: Space,
  from: Footing,
  to: Footing,
  profile: Profile,
): EdgeChoice[] {
  const ordinary = ordinaryChoice(from, to, profile);
  const candidates: EdgeChoice[] = ordinary ? [ordinary] : [];
  const identities = new Set<string>();
  for (const link of space.links) {
    checkedLink(link);
    if (identities.has(link.id))
      throw new Error("duplicate navigation link identity");
    identities.add(link.id);
    if (!(
      (same(link.from, from) && same(link.to, to)) ||
      (same(link.to, from) && same(link.from, to))
    ))
      continue;
    candidates.push({
      kind: "stair",
      duration: link.duration,
      link: link.id,
      points: same(link.from, from)
        ? [from, ...link.via, to]
        : [from, ...link.via.toReversed(), to],
    });
  }
  candidates.sort(
    (left, right) =>
      left.duration - right.duration ||
      ((left.link ?? "") < (right.link ?? "")
        ? -1
        : (left.link ?? "") > (right.link ?? "")
          ? 1
          : 0),
  );
  return candidates;
}
export function admitEdge(
  space: Space,
  from: Footing,
  to: Footing,
  profile: Profile,
): Admission {
  checkedPoint(from);
  checkedPoint(to);
  checkedProfile(profile);
  for (const p of [from, to]) {
    const support = standing(space, p, profile);
    if (support !== "supported") return { kind: support };
  }
  let unknown = false;
  for (const candidate of edgeChoices(space, from, to, profile)) {
    const result = swept(
      space,
      candidate.points,
      profile.clearanceVoxels,
      profile,
    );
    if (result !== "clear") {
      unknown ||= result === "needs-data";
      continue;
    }
    return {
      kind: "edge",
      edge: Object.freeze({
        from: copy(from),
        to: copy(to),
        kind: candidate.kind,
        link: candidate.link,
        duration: candidate.duration,
        clearanceVoxels: profile.clearanceVoxels,
        sweep: Object.freeze(candidate.points.map(copy)),
      }),
    };
  }
  return { kind: unknown ? "needs-data" : "blocked" };
}

function linkStillSupports(space: Space, edge: Edge): boolean {
  if (edge.kind !== "stair") return edge.link === null;
  const link = space.links.find((candidate) => candidate.id === edge.link);
  if (!link) return false;
  checkedLink(link);
  const forward = [link.from, ...link.via, link.to];
  const current = same(link.from, edge.from) ? forward : forward.toReversed();
  return (
    current.length === edge.sweep.length &&
    current.every((at, i) => same(at, edge.sweep[i]))
  );
}
export function edgeStillClear(
  space: Space,
  edge: Edge,
  profile: Profile,
): boolean {
  checkedProfile(profile);
  return (
    linkStillSupports(space, edge) &&
    supported(space, edge.from) === "supported" &&
    supported(space, edge.to) === "supported" &&
    swept(space, edge.sweep, edge.clearanceVoxels, profile) === "clear"
  );
}

type Candidate = { point: Footing; cost: number };
function cheaper(a: Candidate, b: Candidate): boolean {
  return (
    a.cost < b.cost || (a.cost === b.cost && compareKey(a.point, b.point) < 0)
  );
}
/** Private frontier of the bounded shortest-path query; no scheduled work. */
class Frontier {
  private entries: Candidate[] = [];
  get size() {
    return this.entries.length;
  }
  push(value: Candidate): void {
    let index = this.entries.length;
    this.entries.push(value);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!cheaper(value, this.entries[parent])) break;
      this.entries[index] = this.entries[parent];
      index = parent;
    }
    this.entries[index] = value;
  }
  take(): Candidate {
    const first = this.entries[0],
      last = this.entries.pop()!;
    if (!this.entries.length) return first;
    let index = 0;
    while (index * 2 + 1 < this.entries.length) {
      let child = index * 2 + 1;
      if (
        child + 1 < this.entries.length &&
        cheaper(this.entries[child + 1], this.entries[child])
      )
        child++;
      if (!cheaper(this.entries[child], last)) break;
      this.entries[index] = this.entries[child];
      index = child;
    }
    this.entries[index] = last;
    return first;
  }
}

/** Route search is bounded Dijkstra with deterministic cost/coordinate ties. */
export function route(
  space: Space,
  from: Footing,
  to: Footing,
  profile: Profile,
  maxVisited = 4096,
):
  | { kind: "route"; edges: readonly Edge[]; ticks: number }
  | { kind: "blocked" | "needs-data" | "budget" } {
  checkedPoint(from);
  checkedPoint(to);
  checkedProfile(profile);
  if (!Number.isSafeInteger(maxVisited) || maxVisited < 1 || maxVisited > 4096)
    throw new Error("invalid route budget");
  for (const point of [from, to]) {
    const status = standing(space, point, profile);
    if (status !== "supported") return { kind: status };
  }
  const open = new Frontier(),
    costs = new Map([[key(from), 0]]),
    previous = new Map<string, Edge>();
  open.push({ point: from, cost: 0 });
  let visited = 0,
    unknown = false;
  while (open.size) {
    const current = open.take();
    if (costs.get(key(current.point)) !== current.cost) continue;
    if (++visited > maxVisited) return { kind: "budget" };
    if (same(current.point, to)) {
      const edges: Edge[] = [];
      let cursor = to;
      while (!same(cursor, from)) {
        const edge = previous.get(key(cursor))!;
        edges.unshift(edge);
        cursor = edge.from;
      }
      return {
        kind: "route",
        edges: Object.freeze(edges),
        ticks: current.cost,
      };
    }
    const candidates: Footing[] = [];
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ])
      for (const dy of [0, 1, -1]) {
        const next = {
          x: current.point.x + dx,
          y: current.point.y + dy,
          z: current.point.z + dz,
        };
        if (safePoint(next)) candidates.push(next);
        else unknown = true;
      }
    for (const link of space.links) {
      if (same(link.from, current.point)) candidates.push(link.to);
      else if (same(link.to, current.point)) candidates.push(link.from);
    }
    const considered = new Set<string>();
    for (const next of candidates) {
      const id = key(next);
      if (considered.has(id)) continue;
      considered.add(id);
      const admitted = admitEdge(space, current.point, next, profile);
      if (admitted.kind !== "edge") {
        unknown ||= admitted.kind === "needs-data";
        continue;
      }
      const cost = current.cost + admitted.edge.duration;
      if (cost >= (costs.get(id) ?? Infinity)) continue;
      costs.set(id, cost);
      previous.set(id, admitted.edge);
      open.push({ point: next, cost });
    }
  }
  return { kind: unknown ? "needs-data" : "blocked" };
}

/** The admitted edge remains authoritative until its safe endpoint. Queued
 * destinations are only intent and are checked again before the next edge. */
export type Traversal = {
  edge: Edge;
  elapsed: number;
  remaining: readonly Footing[];
};
export type Mobile = Footing & { traversal: Traversal | null };
export type Advance = "idle" | "moving" | "arrived" | "waiting" | "blocked";

function checkedIntent(destinations: readonly Footing[]): void {
  if (destinations.length > 4096)
    throw new Error("invalid queued route budget");
  for (const destination of destinations) checkedPoint(destination);
}

export function beginRoute(
  body: Mobile,
  space: Space,
  destinations: readonly Footing[],
  profile: Profile,
): Admission | { kind: "idle" } {
  if (body.traversal && body.traversal.elapsed > 0)
    throw new Error("cannot replace a paid navigation edge");
  checkedPoint(body);
  checkedProfile(profile);
  checkedIntent(destinations);
  if (!destinations.length) {
    body.traversal = null;
    return { kind: "idle" };
  }
  const admitted = admitEdge(space, body, destinations[0], profile);
  if (admitted.kind !== "edge") return admitted;
  body.traversal = {
    edge: admitted.edge,
    elapsed: 0,
    remaining: Object.freeze(destinations.slice(1).map(copy)),
  };
  return admitted;
}

/** Stop at the next safe footing, never rewind a partly traversed edge. The
 * caller retains pending activity cleanup/custody until this returns to idle. */
export function stopRoute(body: Mobile): void {
  if (!body.traversal) return;
  if (body.traversal.elapsed === 0) body.traversal = null;
  else body.traversal.remaining = Object.freeze([]);
}

/** One call consumes at most one clock tick and never performs work on arrival.
 * A changed obstruction holds exact progress; it cannot snap an active body. */
export function advanceRoute(
  body: Mobile,
  space: Space,
  profile: Profile,
): Advance {
  const travel = body.traversal;
  if (!travel) return "idle";
  if (!edgeStillClear(space, travel.edge, profile)) return "waiting";
  travel.elapsed++;
  if (travel.elapsed < travel.edge.duration) return "moving";
  Object.assign(body, copy(travel.edge.to));
  body.traversal = null;
  if (!travel.remaining.length) return "arrived";
  const next = beginRoute(body, space, travel.remaining, profile);
  return next.kind === "edge" ? "moving" : "blocked";
}

export function position(body: Mobile): Footing {
  const travel = body.traversal;
  if (!travel) return { x: body.x, y: body.y, z: body.z };
  const points = travel.edge.sweep;
  const progress =
    (travel.elapsed / travel.edge.duration) * (points.length - 1);
  const segment = Math.min(Math.floor(progress), points.length - 2);
  const fraction = progress - segment,
    a = points[segment],
    b = points[segment + 1];
  // The admitted sweep lifts before crossing an upward step, and crosses
  // before lowering on descent. Linear diagonal interpolation would put the
  // body inside the supporting step despite a clear admitted envelope.
  const horizontal =
    a.y === b.y
      ? fraction
      : b.y > a.y
        ? Math.max(0, fraction * 2 - 1)
        : Math.min(1, fraction * 2);
  const vertical =
    b.y > a.y ? Math.min(1, fraction * 2) : Math.max(0, fraction * 2 - 1);
  return {
    x: a.x + (b.x - a.x) * horizontal,
    y: a.y + (b.y - a.y) * vertical,
    z: a.z + (b.z - a.z) * horizontal,
  };
}

/** Relational restore law for admitted facts, separate from current route
 * eligibility. Queued goals may become obstructed without corrupting a save. */
export function traversalProblem(
  space: Space,
  body: Mobile,
  profile: Profile,
): string | null {
  checkedPoint(body);
  checkedProfile(profile);
  const travel = body.traversal;
  if (!travel) return null;
  const edge = travel.edge;
  if (
    !same(body, edge.from) ||
    edge.sweep.length < 2 ||
    !same(edge.sweep[0], edge.from) ||
    !same(edge.sweep.at(-1)!, edge.to)
  )
    return "edge endpoints disagree with body";
  if (edge.clearanceVoxels !== profile.clearanceVoxels)
    return "edge envelope disagrees with body and payload";
  if (edge.kind === "stair") {
    if (!linkStillSupports(space, edge))
      return "admitted stair link is missing or changed";
    if (
      space.links.find((link) => link.id === edge.link)!.duration !==
      edge.duration
    )
      return "stair duration disagrees with registered link";
  } else {
    const expected = ordinaryChoice(edge.from, edge.to, profile);
    if (
      !expected ||
      edge.kind !== expected.kind ||
      edge.link !== null ||
      edge.sweep.length !== 2 ||
      edge.duration !== expected.duration
    )
      return "ordinary edge disagrees with registered step policy";
  }
  return null;
}

/** A reroute changes only intent after the paid edge. Its timing, geometry and
 * elapsed progress remain untouched until the current endpoint is reached. */
export function queueAfterEdge(
  body: Mobile,
  destinations: readonly Footing[],
): void {
  if (!body.traversal || body.traversal.elapsed === 0)
    throw new Error("no paid edge to retain");
  checkedIntent(destinations);
  body.traversal.remaining = Object.freeze(destinations.map(copy));
}
