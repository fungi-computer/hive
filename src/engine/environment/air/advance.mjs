import { assert, sum } from "./data.mjs";
import { predict, momentumRate } from "./momentum.mjs";
import { project, projectionDiagnostics } from "./projection.mjs";
import { transport, transportDiagnostics } from "./transport.mjs";
import { copyState, validateState } from "./state.mjs";
import {
  admitRequest,
  budget,
  LIMITS,
  newWork,
  proposedStep,
} from "./request.mjs";

function trialStep(g, state, requestedDtS, forcing, work) {
  const beforeRate = momentumRate(g, state.velocityMPS);
  assert(Number.isFinite(beforeRate), "finite air momentum rate");
  let dtS = Math.min(
    requestedDtS,
    beforeRate > 0 ? 0.45 / beforeRate : Infinity,
  );
  for (let halving = 0; halving <= LIMITS.maxHalvings; halving++) {
    assert(
      dtS >= LIMITS.minDtS &&
        dtS <= LIMITS.maxDtS &&
        state.timeS + dtS > state.timeS,
      "representable reduced air timestep",
    );
    budget(work, "trials", "maxTrials");
    const projected = project(g, predict(g, state, dtS), work);
    const courant =
      Math.max(beforeRate, momentumRate(g, projected.velocity)) * dtS;
    const accepted =
      courant <= 0.45000000001
        ? transport(g, state, projected.velocity, dtS, forcing)
        : null;
    if (accepted)
      return {
        ...accepted,
        dtS,
        divergenceM3S: projected.divergence,
        momentumCourant: courant,
      };
    budget(work, "rejected", "maxRejected");
    dtS /= 2;
  }
  throw new Error("air halving budget exhausted; input uncommitted");
}

function newReceipt(g, state) {
  return {
    startS: state.timeS,
    endS: state.timeS,
    cellIds: [...g.cellIds],
    faceIds: g.faces.map((f) => f.id),
    airM3: Array(g.faces.length).fill(0),
    smokeKg: Array(g.faces.length).fill(0),
    heatJ: Array(g.faces.length).fill(0),
    sourceSmokeKg: Array(g.n).fill(0),
    sourceHeatJ: Array(g.n).fill(0),
    steps: [],
  };
}

function recordStep(receipt, prior, next, trial, forcing) {
  for (const [field, source] of [
    ["airM3", "air"],
    ["smokeKg", "smoke"],
    ["heatJ", "heat"],
  ])
    for (let k = 0; k < receipt[field].length; k++)
      receipt[field][k] += trial.receipt[source][k];
  for (const source of forcing.sources) {
    receipt.sourceSmokeKg[source.cell] += trial.dtS * source.smokeKgS;
    receipt.sourceHeatJ[source.cell] += trial.dtS * source.heatJS;
  }
  receipt.endS = next.timeS;
  receipt.steps.push({
    startS: prior.timeS,
    endS: next.timeS,
    dtS: trial.dtS,
    divergenceM3S: trial.divergenceM3S,
    scalarCourant: trial.courant,
    momentumCourant: trial.momentumCourant,
  });
}

function checkReceipt(g, input, state, receipt) {
  const smoke = input.smokeKg.map((m, i) => m + receipt.sourceSmokeKg[i]);
  const heat = input.heatJ.map((m, i) => m + receipt.sourceHeatJ[i]);
  for (const face of g.faces) {
    for (const [values, transfer] of [
      [smoke, receipt.smokeKg[face.k]],
      [heat, receipt.heatJ[face.k]],
    ]) {
      if (face.i >= 0) values[face.i] -= transfer;
      if (face.j >= 0) values[face.j] += transfer;
    }
  }
  const maxError = (actual, expected) =>
    actual.reduce((v, n, i) => Math.max(v, Math.abs(n - expected[i])), 0);
  const residual = {
    smokeKg: maxError(smoke, state.smokeKg),
    heatJ: maxError(heat, state.heatJ),
  };
  assert(
    residual.smokeKg <= 1e-10 && residual.heatJ <= 1e-5,
    "air per-cell source/face receipt mismatch",
  );
  return {
    ...residual,
    totalSourceSmokeKg: sum(receipt.sourceSmokeKg),
    totalSourceHeatJ: sum(receipt.sourceHeatJ),
    boundarySmokeKg: state.smokeBoundaryKg - input.smokeBoundaryKg,
    boundaryHeatJ: state.heatBoundaryJ - input.heatBoundaryJ,
    airImportM3: state.airImportM3 - input.airImportM3,
    airExportM3: state.airExportM3 - input.airExportM3,
  };
}

export function advance(g, identity, input, intervalS, options) {
  validateState(g, identity, input);
  const request = admitRequest(g, input, intervalS, options),
    work = newWork(request);
  const forcing = { sources: request.sources },
    receipt = newReceipt(g, input),
    before = transportDiagnostics(g);
  let state = copyState(input),
    elapsed = 0,
    compensation = 0;
  try {
    while (elapsed < intervalS) {
      assert(
        work.accepted < work.maxAccepted,
        "air accepted step budget exhausted; input uncommitted",
      );
      const trial = trialStep(
        g,
        state,
        proposedStep(elapsed, compensation, request),
        forcing,
        work,
      );
      budget(work, "accepted", "maxAccepted");
      const increment = trial.dtS - compensation,
        nextElapsed = elapsed + increment;
      compensation = nextElapsed - elapsed - increment;
      elapsed = nextElapsed;
      const next = copyState({ ...trial.state, timeS: input.timeS + elapsed });
      validateState(g, identity, next);
      recordStep(receipt, state, next, trial, forcing);
      state = next;
    }
    assert(
      state.timeS === request.endS,
      "air solved interval must reach its timestamp",
    );
    receipt.balance = checkReceipt(g, input, state, receipt);
  } catch (error) {
    error.partial = {
      committed: false,
      work: { ...work },
      lastSolvedTimeS: state.timeS,
    };
    throw error;
  }
  const after = transportDiagnostics(g);
  work.scalarFaceEvaluations =
    after.scalarFaceEvaluations - before.scalarFaceEvaluations;
  work.scalarStages = after.scalarEulerStages - before.scalarEulerStages;
  work.scalarWorkspaceBytes = after.scalarWorkspaceBytes;
  work.projectionWorkspaceBytes = projectionDiagnostics(g).workspaceBytes;
  return { state, receipt, work };
}
