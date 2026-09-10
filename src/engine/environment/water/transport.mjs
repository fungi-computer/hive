import { changeQuantity, UnresolvedQuantityError } from "../arithmetic.mjs";
import { WATER_DENSITY } from "./geometry.mjs";

const mobile = (node, amount) => Math.max(0, amount - node.retainedKg);
function head(g, node, amount) {
  return (
    node.baseM +
    (g.definition.spacingM[1] * mobile(node, amount)) /
      (node.capacityKg - node.retainedKg)
  );
}
function touching(g, face, node, amount, other) {
  if (amount <= 0) return 0;
  if (node.kind === "soil") return 1;
  const fraction = amount / node.capacityKg;
  if (face.axis !== 1) return fraction;
  return other.at[1] < node.at[1] ? 1 : fraction === 1 ? 1 : 0;
}
function request(g, face, masses, dtS) {
  const a = g.nodes[face.a],
    b = g.nodes[face.b];
  // Retained soil moisture is a capacity/rate rule, not a second reservoir.
  const soilIndex =
    a.kind === "soil" && b.kind === "void"
      ? face.a
      : b.kind === "soil" && a.kind === "void"
        ? face.b
        : null;
  if (soilIndex !== null) {
    const voidIndex = soilIndex === face.a ? face.b : face.a,
      soil = g.nodes[soilIndex],
      water = g.nodes[voidIndex];
    if (masses[soilIndex] < soil.retainedKg) {
      return {
        face,
        from: voidIndex,
        to: soilIndex,
        absorption: true,
        quantity: Math.min(
          soil.retainedKg - masses[soilIndex],
          soil.soil.absorbMPerS *
            WATER_DENSITY *
            face.areaM2 *
            dtS *
            touching(g, face, water, masses[voidIndex], soil),
        ),
      };
    }
  }
  const difference = head(g, a, masses[face.a]) - head(g, b, masses[face.b]);
  if (difference === 0) return null;
  const from = difference > 0 ? face.a : face.b,
    to = difference > 0 ? face.b : face.a;
  const donor = g.nodes[from],
    receiver = g.nodes[to];
  const soilRate = Math.min(
    donor.soil?.seepMPerS ?? Infinity,
    receiver.soil?.absorbMPerS ?? Infinity,
  );
  const speed =
    soilRate !== Infinity
      ? soilRate
      : face.axis === 1
        ? g.definition.fallMPerS
        : g.definition.spreadMPerS;
  const donorSlope =
    g.definition.spacingM[1] / (donor.capacityKg - donor.retainedKg);
  const receiverSlope =
    g.definition.spacingM[1] / (receiver.capacityKg - receiver.retainedKg);
  // At most1/6 of a pair's equalizing quantity per substep: six concurrent
  // voxel faces cannot all move a cell past its neighbors' initial heads.
  const equalizeKg = Math.abs(difference) / (donorSlope + receiverSlope) / 6;
  return {
    face,
    from,
    to,
    quantity: Math.min(
      equalizeKg,
      speed *
        WATER_DENSITY *
        face.areaM2 *
        dtS *
        touching(g, face, donor, masses[from], receiver),
    ),
  };
}

/** All requests see one snapshot. Aggregate shared donor and receiver budgets
 * before applying any face. Incoming water is usable on the next substep only. */
export function transferStep(g, massKg, dtS) {
  const requests = g.faces
    .map((face) => request(g, face, massKg, dtS))
    .filter((r) => r && r.quantity > 0);
  const outgoing = new Float64Array(massKg.length),
    incoming = new Float64Array(massKg.length),
    absorbed = new Float64Array(massKg.length);
  for (const r of requests) {
    outgoing[r.from] += r.quantity;
    incoming[r.to] += r.quantity;
    if (r.absorption) absorbed[r.to] += r.quantity;
  }
  const available = massKg.map((amount, i) => mobile(g.nodes[i], amount));
  const space = massKg.map((amount, i) => g.nodes[i].capacityKg - amount);
  const retentionSpace = massKg.map((amount, i) =>
    Math.max(0, g.nodes[i].retainedKg - amount),
  );
  const remaining = [...available],
    receiving = [...space],
    retaining = [...retentionSpace],
    next = [...massKg],
    flows = [];
  let unresolved = 0;
  for (const r of requests) {
    const factor = Math.min(
      1,
      available[r.from] / outgoing[r.from],
      space[r.to] / incoming[r.to],
      r.absorption ? retentionSpace[r.to] / absorbed[r.to] : 1,
    );
    const quantity = Math.min(
      r.quantity * factor,
      remaining[r.from],
      receiving[r.to],
      next[r.from],
      g.nodes[r.to].capacityKg - next[r.to],
      r.absorption ? retaining[r.to] : Infinity,
    );
    if (quantity <= 0) continue;
    // Apply neither side when this quantity cannot be represented safely at
    // both stocks. The arithmetic owner defines resolution, not this solver.
    let debit, credit;
    try {
      debit = changeQuantity(next[r.from], -quantity);
      credit = changeQuantity(next[r.to], quantity);
    } catch (error) {
      if (!(error instanceof UnresolvedQuantityError)) throw error;
      unresolved++;
      continue;
    }
    next[r.from] = debit;
    next[r.to] = credit;
    remaining[r.from] -= quantity;
    receiving[r.to] -= quantity;
    if (r.absorption) retaining[r.to] -= quantity;
    flows.push({
      faceId: r.face.id,
      from: g.nodes[r.from].id,
      to: g.nodes[r.to].id,
      massKg: quantity,
    });
  }
  return {
    massKg: next,
    flows,
    work: { faces: g.faces.length, requests: requests.length, unresolved },
  };
}
