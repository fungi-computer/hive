import { changeQuantity, UnresolvedQuantityError } from "../arithmetic.mjs";
import { WATER_DENSITY } from "./geometry.mjs";

const full = (g, mass, i) =>
  g.nodes[i].kind === "void" && mass[i] === g.nodes[i].capacityKg;
const wetConduit = (g, mass, i) =>
  g.nodes[i].kind === "void" &&
  mass[i] / g.nodes[i].capacityKg >= g.definition.pressureWetFraction;
const head = (g, mass, i) =>
  g.nodes[i].baseM +
  (mass[i] / g.nodes[i].capacityKg) * g.definition.spacingM[1];
function sourceSurface(g, mass, i) {
  const node = g.nodes[i];
  if (node.kind !== "void" || mass[i] <= 0) return false;
  if (!full(g, mass, i)) return true;
  // A completely flooded sealed component has no free-surface pressure anchor.
  // A full cell only anchors at an actual open face to an empty cell above it.
  return g.neighbors[i].some(
    ({ to }) =>
      g.nodes[to].at[1] === node.at[1] + 1 &&
      g.nodes[to].kind === "void" &&
      mass[to] === 0,
  );
}

/** Highest-head sources claim still-unvisited full cells. Each full cell and
 * each partial source visits its neighbors once. This produces a parent forest,
 * not a separate flood search for every possible donor/receiver pair. */
function wetForest(g, mass) {
  const sources = [];
  for (let i = 0; i < g.nodes.length; i++)
    if (sourceSurface(g, mass, i))
      sources.push({ i, height: head(g, mass, i) });
  sources.sort((a, b) => b.height - a.height || a.i - b.i);
  if (sources.length === 0) return { paths: [], visits: 0 };
  const parents = new Array(mass.length).fill(null),
    receivers = new Map();
  let visits = 0;
  for (const { i: source, height } of sources) {
    if (parents[source]) continue;
    const root = { source, previous: null, at: source, face: null, depth: 0 };
    const queue = [root];
    if (wetConduit(g, mass, source)) parents[source] = root;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const previous = queue[cursor];
      for (const edge of g.neighbors[previous.at]) {
        visits++;
        const to = edge.to,
          node = g.nodes[to];
        if (to === source || node.kind !== "void") continue;
        if (wetConduit(g, mass, to)) {
          if (parents[to] || head(g, mass, to) > height) continue;
          const path = {
            source,
            previous,
            at: to,
            face: edge.face,
            depth: previous.depth + 1,
          };
          parents[to] = path;
          queue.push(path);
          continue;
        }
        // Direct faces are handled by the local phase. A pressure path has
        // at least one full intermediate cell and a genuinely lower head.
        if (previous.depth === 0 || head(g, mass, to) >= height) continue;
        const prior = receivers.get(to);
        const path = {
          source,
          previous,
          at: to,
          face: edge.face,
          depth: previous.depth + 1,
          height,
        };
        if (
          !prior ||
          height > prior.height ||
          (height === prior.height && path.depth < prior.depth)
        )
          receivers.set(to, path);
      }
    }
  }
  return {
    paths: [...receivers.values()].sort(
      (a, b) => b.height - a.height || a.source - b.source || a.at - b.at,
    ),
    visits,
  };
}

/** An approximate pressure redistribution through already full physical voids.
 * This phase receives its own fraction of the host interval; its face capacities
 * cannot spend the local phase's time again. Shared necks spend one budget. */
export function pressureStep(g, mass, dtS, pathBudget) {
  const forest = wetForest(g, mass);
  if (forest.paths.length === 0)
    return {
      massKg: mass,
      flows: [],
      work: {
        faces: forest.visits,
        requests: 0,
        unresolved: 0,
        pathFaces: 0,
        pressureDeferred: 0,
      },
    };
  const next = [...mass],
    available = [...mass],
    space = mass.map((amount, i) => g.nodes[i].capacityKg - amount),
    throughput = g.faces.map(
      (face) =>
        WATER_DENSITY *
        face.areaM2 *
        dtS *
        (face.axis === 1 ? g.definition.fallMPerS : g.definition.spreadMPerS),
    ),
    incident = mass.map(() => 0),
    retainedCrest = mass.map(() => -Infinity),
    flows = [];
  for (const path of forest.paths) {
    incident[path.source]++;
    incident[path.at]++;
  }
  let pathFaces = 0,
    unresolved = 0,
    deferred = 0;
  for (let index = 0; index < forest.paths.length; index++) {
    const path = forest.paths[index],
      from = path.source,
      to = path.at;
    if (pathFaces + path.depth > pathBudget) {
      deferred = forest.paths.length - index;
      break;
    }
    pathFaces += path.depth;
    const edges = [];
    for (let cursor = path; cursor.previous; cursor = cursor.previous)
      edges.push(cursor);
    let crest = retainedCrest[from];
    for (let cursor = path.previous; cursor.previous; cursor = cursor.previous)
      crest = Math.max(crest, head(g, mass, cursor.at));
    const crestStock = Math.max(
      0,
      ((crest - g.nodes[from].baseM) / g.definition.spacingM[1]) *
        g.nodes[from].capacityKg,
    );
    const slope =
      g.definition.spacingM[1] *
      (1 / g.nodes[from].capacityKg + 1 / g.nodes[to].capacityKg);
    let quantity = Math.min(
      available[from],
      space[to],
      next[from],
      g.nodes[to].capacityKg - next[to],
      next[from] - crestStock,
      (head(g, mass, from) - head(g, mass, to)) /
        slope /
        Math.max(2, incident[from], incident[to]),
    );
    for (const edge of edges)
      quantity = Math.min(quantity, throughput[edge.face]);
    if (!(quantity > 0)) continue;
    let debit, credit;
    try {
      debit = changeQuantity(next[from], -quantity);
      credit = changeQuantity(next[to], quantity);
    } catch (error) {
      if (!(error instanceof UnresolvedQuantityError)) throw error;
      unresolved++;
      continue;
    }
    next[from] = debit;
    next[to] = credit;
    available[from] -= quantity;
    retainedCrest[from] = crest;
    space[to] -= quantity;
    for (const edge of edges.reverse()) {
      throughput[edge.face] -= quantity;
      flows.push({
        faceId: g.faces[edge.face].id,
        from: g.nodes[edge.previous.at].id,
        to: g.nodes[edge.at].id,
        massKg: quantity,
      });
    }
  }
  return {
    massKg: flows.length ? next : mass,
    flows,
    work: {
      faces: forest.visits,
      requests: forest.paths.length,
      unresolved,
      pathFaces,
      pressureDeferred: deferred,
    },
  };
}
