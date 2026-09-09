import { assert, record, sum } from "./data.mjs";
import { admitDefinition, buildGeometry } from "./definition.mjs";
import { project } from "./projection.mjs";
import { copyState, validateState } from "./state.mjs";
import { LIMITS, newWork } from "./request.mjs";
import { displace } from "./displacement.mjs";

function kineticJ(g, velocities) {
  return sum(
    g.faces.map(
      (f) =>
        0.5 * g.model.densityKgM3 * f.area * f.distance * velocities[f.k] ** 2,
    ),
  );
}

function compatible(old, next) {
  for (const key of ["regionId", "origin", "size", "spacingM", "model"])
    assert(
      JSON.stringify(old[key]) === JSON.stringify(next[key]),
      "air rebind requires unchanged domain, voxel metric and model",
    );
  assert(
    next.revision > old.revision,
    "air rebind requires a newer geometry revision",
  );
}

export function rebind(g, identity, state, rawDefinition, options, identityOf) {
  validateState(g, identity, state);
  record(options, [], ["maxProjectionIterations"]);
  const maxProjectionIterations =
    options.maxProjectionIterations ?? LIMITS.maxProjectionIterations;
  assert(
    Number.isSafeInteger(maxProjectionIterations) &&
      maxProjectionIterations > 0 &&
      maxProjectionIterations <= LIMITS.maxProjectionIterations,
    "bounded rebind projection work",
  );
  const definition = admitDefinition(rawDefinition);
  compatible(g.definition, definition);
  const nextGeometry = buildGeometry(definition),
    nextIdentity = identityOf(definition);
  const displaced = displace(g, nextGeometry, state);
  const oldVelocity = new Map(
    g.faces.map((f) => [f.id, state.velocityMPS[f.k]]),
  );
  const mapped = nextGeometry.faces.map((f) => oldVelocity.get(f.id) ?? 0);
  const work = newWork({ maxSteps: 1, maxTrials: 1, maxProjectionIterations });
  const projected = project(nextGeometry, mapped, work),
    oldKineticJ = kineticJ(g, state.velocityMPS);
  const mappedKineticJ = kineticJ(nextGeometry, mapped),
    newKineticJ = kineticJ(nextGeometry, projected.velocity);
  const changeJ = newKineticJ - oldKineticJ;
  assert(
    Number.isFinite(changeJ) &&
      changeJ <= 1e-10 + 64 * Number.EPSILON * Math.max(1, oldKineticJ),
    "passive geometry change cannot create resolved kinetic energy",
  );
  const next = copyState({
    ...displaced.state,
    identity: nextIdentity,
    velocityMPS: Array.from(projected.velocity),
  });
  validateState(nextGeometry, nextIdentity, next);
  const newIds = new Set(nextGeometry.faces.map((f) => f.id));
  return {
    definition,
    state: next,
    receipt: {
      timeS: state.timeS,
      oldIdentity: identity,
      newIdentity: nextIdentity,
      newFaces: nextGeometry.faces
        .filter((f) => !oldVelocity.has(f.id))
        .map((f) => f.id),
      closedFaces: g.faces.filter((f) => !newIds.has(f.id)).map((f) => f.id),
      oldKineticJ,
      mappedKineticJ,
      newKineticJ,
      kineticChangeJ: changeJ,
      boundaryDissipationJ: Math.max(0, -changeJ),
      divergenceM3S: projected.divergence,
      ...displaced.receipt,
    },
    work,
  };
}
