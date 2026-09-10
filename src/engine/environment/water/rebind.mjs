import {
  changeQuantity,
  compensatedSum,
  UnresolvedQuantityError,
} from "../arithmetic.mjs";
import { check, freeze, WATER_DENSITY } from "./geometry.mjs";

function compatible(before, after) {
  const a = before.definition,
    b = after.definition;
  check(
    a.id === b.id &&
      b.revision > a.revision &&
      JSON.stringify(a.spacingM) === JSON.stringify(b.spacingM) &&
      JSON.stringify(a.soils) === JSON.stringify(b.soils) &&
      a.fallMPerS === b.fallMPerS &&
      a.spreadMPerS === b.spreadMPerS &&
      a.pressureWetFraction === b.pressureWetFraction,
    "water rebind requires newer geometry with unchanged units and rules",
  );
}

function remap(old, state, next) {
  const massKg = next.nodes.map(() => 0),
    removedPoreWater = [],
    displaced = [];
  for (const [index, node] of old.nodes.entries()) {
    const target = next.index.get(node.id),
      successor = next.nodes[target];
    const amount = state.massKg[index];
    if (node.kind === "soil") {
      if (successor?.kind === "soil") {
        check(
          node.soil.id === successor.soil.id,
          "soil conversion requires an explicit material operation",
        );
        massKg[target] = amount;
      } else {
        // The same coordinate may survive as a void. Its pore stock leaves
        // with spoil; retaining it as liquid too would duplicate that water.
        removedPoreWater.push({
          id: node.id,
          at: node.at,
          soilId: node.soil.id,
          massKg: amount,
        });
      }
    } else if (successor?.kind === "void") massKg[target] = amount;
    else if (amount > 0) displaced.push({ index, amount });
  }
  for (const node of next.nodes) {
    if (
      node.kind === "soil" &&
      old.nodes[old.index.get(node.id)]?.kind !== "soil"
    )
      throw new Error(
        "new porous coverage requires its finite source counterpart",
      );
  }
  return { massKg, removedPoreWater, displaced };
}

/** Construction can push liquid into immediate surviving void neighbors through
 * actual OLD open faces. It cannot teleport into a remote empty cavity or use a
 * cell that the same edit fills. An unsettled local plan leaves the edit waiting;
 * this deterministic neighbor policy does not prove no other allocation exists.
 * This is work-driven displacement, not passive pressure or a momentum model. */
function displace(old, next, staged) {
  const flows = [];
  for (const source of staged.displaced) {
    let remaining = source.amount;
    for (const edge of old.neighbors[source.index]) {
      const oldTarget = old.nodes[edge.to],
        target = next.index.get(oldTarget.id);
      if (oldTarget.kind !== "void" || next.nodes[target]?.kind !== "void")
        continue;
      const space = next.nodes[target].capacityKg - staged.massKg[target],
        amount = Math.min(remaining, space);
      if (!(amount > 0)) continue;
      let debit, credit;
      try {
        debit = changeQuantity(remaining, -amount);
        credit = changeQuantity(staged.massKg[target], amount);
      } catch (error) {
        if (!(error instanceof UnresolvedQuantityError)) throw error;
        continue;
      }
      remaining = debit;
      staged.massKg[target] = credit;
      flows.push({
        faceId: old.faces[edge.face].id,
        from: old.nodes[source.index].id,
        to: oldTarget.id,
        massKg: amount,
      });
      if (remaining === 0) break;
    }
    if (remaining > 0) return null;
  }
  return flows;
}

function volumeChanges(old, state, next, massKg) {
  const amounts = new Map();
  old.nodes.forEach((node, i) =>
    amounts.set(node.id, {
      id: node.id,
      beforeM3: node.kind === "void" ? state.massKg[i] / WATER_DENSITY : 0,
      afterM3: 0,
    }),
  );
  next.nodes.forEach((node, i) => {
    const entry = amounts.get(node.id) ?? {
      id: node.id,
      beforeM3: 0,
      afterM3: 0,
    };
    entry.afterM3 = node.kind === "void" ? massKg[i] / WATER_DENSITY : 0;
    amounts.set(node.id, entry);
  });
  return [...amounts.values()]
    .filter((entry) => entry.beforeM3 !== entry.afterM3)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** This candidate grants neither an excavation command nor an external source.
 * The physical-completion owner must pair every pore export with the existing
 * material source record and obtain gas-volume admission before publishing it. */
export function rebindWater(old, state, next) {
  compatible(old, next);
  const staged = remap(old, state, next),
    flows = displace(old, next, staged);
  if (flows === null)
    return freeze({
      status: "blocked",
      reason: "liquid-displacement-unsettled",
    });
  const exportedKg = compensatedSum(
    staged.removedPoreWater.map((entry) => entry.massKg),
  );
  return {
    status: "applied",
    state: {
      ...state,
      identity: next.identity,
      massKg: staged.massKg,
      boundaryKg: changeQuantity(state.boundaryKg, -exportedKg),
    },
    receipt: freeze({
      oldIdentity: old.identity,
      newIdentity: next.identity,
      boundaryKg: -exportedKg,
      removedPoreWater: staged.removedPoreWater,
      flows,
      liquidChanges: volumeChanges(old, state, next, staged.massKg),
    }),
  };
}
