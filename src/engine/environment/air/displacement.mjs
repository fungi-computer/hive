import { changeQuantity } from "../arithmetic.mjs";
import { assert, sum } from "./data.mjs";

// One completed wall occupies four voxels; digging opens one. This is a bound
// per physical edit, not a batch of every actor's edits or a domain resize.
const MAX_EDIT_CELLS = 4;
const lexical = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function membership(old, next) {
  const added = [],
    removed = [];
  for (let i = 0; i < old.n; i++) {
    if (!old.fluid[i] && next.fluid[i]) added.push(i);
    if (old.fluid[i] && !next.fluid[i]) removed.push(i);
  }
  assert(
    added.length + removed.length <= MAX_EDIT_CELLS &&
      !(added.length && removed.length),
    "air geometry edit requires at most four monotone volume cells",
  );
  if (added.length || removed.length)
    for (const key of ["closedFaces", "openSides"])
      assert(
        JSON.stringify(old.definition[key]) ===
          JSON.stringify(next.definition[key]),
        "air volume edit cannot simultaneously change explicit openings",
      );
  return { added, removed };
}

function passages(g) {
  const graph = Array.from({ length: g.n }, () => []);
  for (const face of g.faces) {
    if (face.i >= 0) graph[face.i].push({ to: face.j, faceId: face.id });
    if (face.j >= 0) graph[face.j].push({ to: face.i, faceId: face.id });
  }
  for (const edges of graph) edges.sort((a, b) => lexical(a.faceId, b.faceId));
  return graph;
}

// Unit-length actual faces, stable face-ID tie break. Only the candidate itself
// and already filled cells can carry a parcel; a planned opening is not air.
function outdoorPath(graph, filled, start) {
  const parent = new Int32Array(graph.length).fill(-2),
    queue = [start];
  parent[start] = -1;
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    for (const edge of graph[at]) {
      if (edge.to < 0) {
        const cells = [];
        for (let i = at; i >= 0; i = parent[i]) cells.push(i);
        return { cells: cells.reverse(), faceId: edge.faceId };
      }
      if (!filled[edge.to] || parent[edge.to] !== -2) continue;
      parent[edge.to] = at;
      queue.push(edge.to);
    }
  }
  return null;
}

function nextParcel(g, graph, filled, pending, importing) {
  const candidates = [];
  for (const cell of pending) {
    const path = outdoorPath(graph, filled, cell);
    if (path) candidates.push({ cell, ...path });
  }
  // Remove the deepest cell first so closing an exit cannot strand a later
  // removal. Open a reachable frontier first; never use an unfilled donor.
  candidates.sort(
    (a, b) =>
      (importing ? 1 : -1) * (a.cells.length - b.cells.length) ||
      lexical(g.cellIds[a.cell], g.cellIds[b.cell]),
  );
  assert(candidates.length, "air volume edit needs a real open route outdoors");
  return candidates[0];
}

function shift(values, path, importing) {
  if (importing) {
    for (let i = 0; i < path.length - 1; i++)
      values[path[i]] = values[path[i + 1]];
    values[path.at(-1)] = 0; // Reference-temperature, smoke-free outdoor carrier.
    return 0;
  }
  const exported = values[path.at(-1)];
  for (let i = path.length - 1; i > 0; i--)
    values[path[i]] = values[path[i - 1]];
  values[path[0]] = 0;
  return exported;
}

function settle(old, next, state, candidate, added, removed, crossings) {
  const smokeTransferKg = sum(crossings.map((c) => c.smokeKg)),
    thermalTransferJ = sum(crossings.map((c) => c.heatJ)),
    airImportM3 = added.length * old.volume,
    airExportM3 = removed.length * old.volume;
  candidate.smokeBoundaryKg = changeQuantity(
    state.smokeBoundaryKg,
    smokeTransferKg,
  );
  candidate.heatBoundaryJ = changeQuantity(
    state.heatBoundaryJ,
    thermalTransferJ,
  );
  candidate.airImportM3 = changeQuantity(state.airImportM3, airImportM3);
  candidate.airExportM3 = changeQuantity(state.airExportM3, airExportM3);
  assert(
    Math.abs(sum(candidate.smokeKg) + smokeTransferKg - sum(state.smokeKg)) <=
      1e-10 &&
      Math.abs(sum(candidate.heatJ) + thermalTransferJ - sum(state.heatJ)) <=
        1e-5,
    "air displacement must account every scalar parcel",
  );
  const volumeChangeM3 = (sum(next.fluid) - sum(old.fluid)) * old.volume;
  assert(
    Math.abs(volumeChangeM3 - airImportM3 + airExportM3) <= 1e-10,
    "air displacement volume mismatch",
  );
  return {
    state: candidate,
    receipt: {
      addedCells: added.map((i) => old.cellIds[i]),
      removedCells: removed.map((i) => old.cellIds[i]),
      boundaryCrossings: crossings,
      volumeChangeM3,
      airImportM3,
      airExportM3,
      smokeTransferKg,
      thermalTransferJ,
    },
  };
}

/** Private conservative edit remap. Scratch paths never become saved state;
 * all failures leave the caller's original field and geometry untouched. */
export function displace(old, next, state) {
  const { added, removed } = membership(old, next),
    importing = added.length > 0,
    g = importing ? next : old,
    graph = passages(g),
    filled = Int8Array.from(old.fluid),
    pending = new Set(importing ? added : removed),
    candidate = {
      ...state,
      smokeKg: [...state.smokeKg],
      heatJ: [...state.heatJ],
    },
    crossings = [];
  while (pending.size) {
    const path = nextParcel(g, graph, filled, pending, importing);
    crossings.push({
      cellId: g.cellIds[path.cell],
      faceId: path.faceId,
      direction: importing ? "import" : "export",
      volumeM3: g.volume,
      smokeKg: shift(candidate.smokeKg, path.cells, importing),
      heatJ: shift(candidate.heatJ, path.cells, importing),
    });
    filled[path.cell] = importing ? 1 : 0;
    pending.delete(path.cell);
  }
  return settle(old, next, state, candidate, added, removed, crossings);
}
