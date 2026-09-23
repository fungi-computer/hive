// Observations only: no physical state, force, acceptance or pressure update.
// These identities diagnose the existing full-box, zero-heater gravity case.
import { integratedDivergence } from './projection.mjs';

export function donorEnergy(dual, beforeMass, afterMass, oldMomentum, velocity, advectedMomentum, transfers, kineticChangeJ) {
  let donorDissipationJ = 0, forwardRemainderJ = 0, linearWorkJ = 0;
  for (const edge of dual.interfaces) donorDissipationJ += Math.abs(transfers[edge.k]) * (velocity[edge.j] - velocity[edge.i]) ** 2 / 2;
  for (const node of dual.nodes) {
    const i = node.k, dm = afterMass[i] - beforeMass[i], dp = advectedMomentum[i] - oldMomentum[i], u = velocity[i];
    linearWorkJ += u * dp - u * u * dm / 2;
    forwardRemainderJ += (dp - u * dm) ** 2 / (2 * afterMass[i]);
  }
  return { donorDissipationJ, forwardRemainderJ, linearWorkJ, kineticChangeJ,
    donorPairingResidualJ: linearWorkJ + donorDissipationJ,
    finiteIdentityResidualJ: kineticChangeJ - linearWorkJ - forwardRemainderJ,
    combinedResidualJ: kineticChangeJ + donorDissipationJ - forwardRemainderJ };
}

export function bodyEnergy(dual, afterMass, oldVelocity, advectedMomentum, impulse, forcedMomentum, kineticChangeJ) {
  let oldVelocityWorkJ = 0, timeRemainderJ = 0, wallRemovalNormJ = 0;
  for (const node of dual.nodes) {
    const i = node.k, b = impulse[i], m = afterMass[i];
    oldVelocityWorkJ += oldVelocity[i] * b;
    timeRemainderJ += (advectedMomentum[i] / m - oldVelocity[i]) * b + b * b / (2 * m);
    if (node.fixed) wallRemovalNormJ += forcedMomentum[i] ** 2 / (2 * m);
  }
  return { oldVelocityWorkJ, timeRemainderJ, wallRemovalNormJ, kineticChangeJ,
    finiteIdentityResidualJ: kineticChangeJ - oldVelocityWorkJ - timeRemainderJ };
}

export function pressureEnergy(g, dual, mass, velocityAfter, impulse, potential, target, kineticChangeJ) {
  const divergence = integratedDivergence(g, velocityAfter);
  let correctionNormJ = 0, afterImpulseWorkJ = 0, impulseMetricResidualKgMS = 0, impulseMagnitudeKgMS = 0;
  let targetWorkJ = 0, residualWorkJ = 0, residualWorkBoundJ = 0, pinResidualM3S = 0;
  for (const face of g.faces) {
    const k = face.k, dp = impulse[k];
    correctionNormJ += dp * dp / (2 * mass[dual.faceNode[k]]);
    afterImpulseWorkJ += velocityAfter[k] * dp;
    impulseMagnitudeKgMS = Math.max(impulseMagnitudeKgMS, Math.abs(dp));
    impulseMetricResidualKgMS = Math.max(impulseMetricResidualKgMS, Math.abs(dp - face.area * (potential[face.i] - potential[face.j])));
  }
  for (let i = 0; i < g.n; i++) {
    const residual = divergence[i] - target[i];
    targetWorkJ += potential[i] * target[i]; residualWorkJ += potential[i] * residual;
    residualWorkBoundJ += Math.abs(potential[i] * residual);
    if (g.fixed[i]) pinResidualM3S = Math.max(pinResidualM3S, Math.abs(residual));
  }
  return { correctionNormJ, afterImpulseWorkJ, targetWorkJ, residualWorkJ, residualWorkBoundJ,
    pinResidualM3S, impulseMetricResidualKgMS, impulseMagnitudeKgMS, kineticChangeJ,
    gradientPairingResidualJ: afterImpulseWorkJ - targetWorkJ - residualWorkJ,
    finiteIdentityResidualJ: kineticChangeJ - afterImpulseWorkJ + correctionNormJ,
    combinedResidualJ: kineticChangeJ - targetWorkJ - residualWorkJ + correctionNormJ };
}

export function gravityEnergy(g, mass, velocity, transfer, dt, acceleration, observedPotentialChangeJ, bodyOldWorkJ) {
  let potentialFromFluxJ = 0, oldVelocityWorkJ = 0, donorGapJ = 0;
  for (const face of g.faces) {
    const a = acceleration[face.axis], v = velocity[face.k], rhoI = mass[face.i] / g.volume, rhoJ = mass[face.j] / g.volume;
    const worldAxis = ['x', 'y', 'z'].indexOf(g.axes[face.axis]);
    potentialFromFluxJ += transfer[face.k] * -a * (g.cells[face.j].center[worldAxis] - g.cells[face.i].center[worldAxis]);
    oldVelocityWorkJ += v * dt * (mass[face.i] / 2 + mass[face.j] / 2) * a;
    donorGapJ += -dt * a * g.volume * Math.abs(v) * (rhoI - rhoJ) / 2;
  }
  return { potentialFromFluxJ, observedPotentialChangeJ, oldVelocityWorkJ, donorGapJ,
    pairedGapJ: oldVelocityWorkJ + potentialFromFluxJ,
    donorGapResidualJ: oldVelocityWorkJ + potentialFromFluxJ - donorGapJ,
    potentialResidualJ: observedPotentialChangeJ - potentialFromFluxJ,
    externalBodyWorkJ: bodyOldWorkJ - oldVelocityWorkJ };
}

export function averagingEnergy(dual, oldMass, secondMass, oldMomentum, secondMomentum, oldK, secondK, averageK) {
  let jensenJ = 0;
  for (const face of dual.faceNode.keys()) {
    const i = dual.faceNode[face], a = oldMass[i], b = secondMass[i];
    const jump = oldMomentum[face] / a - secondMomentum[face] / b;
    jensenJ -= a * b / (4 * (a + b)) * jump * jump;
  }
  const kineticChangeJ = averageK - (oldK + secondK) / 2;
  return { jensenJ, kineticChangeJ, residualJ: kineticChangeJ - jensenJ };
}

export function acceptedEnergy(first, second, finalProjection, average, change) {
  let donorDissipationJ = 0, forwardRemainderJ = 0, gravityGapJ = 0, gravityTimeRemainderJ = 0;
  let wallKChangeJ = 0, projectionKChangeJ = finalProjection.kineticChangeJ;
  for (const stage of [first, second]) {
    donorDissipationJ += stage.transport.donor.donorDissipationJ / 2;
    forwardRemainderJ += stage.transport.donor.forwardRemainderJ / 2;
    gravityGapJ += stage.gravity.pairedGapJ / 2;
    gravityTimeRemainderJ += stage.transport.body.timeRemainderJ / 2;
    wallKChangeJ += stage.transport.wallKChangeJ / 2;
    projectionKChangeJ += stage.projection.kineticChangeJ / 2;
  }
  const timeSplitRemainderJ = forwardRemainderJ + gravityTimeRemainderJ + wallKChangeJ + projectionKChangeJ + average.jensenJ;
  const reconstructedMechanicalJ = -donorDissipationJ + gravityGapJ + timeSplitRemainderJ;
  return { first: { ...first, weight: 0.5 }, second: { ...second, weight: 0.5 }, finalProjection, average, ...change, donorDissipationJ, forwardRemainderJ,
    gravityGapJ, gravityTimeRemainderJ, wallKChangeJ, projectionKChangeJ, timeSplitRemainderJ, reconstructedMechanicalJ,
    mechanicalResidualJ: change.mechanicalChangeJ - reconstructedMechanicalJ };
}
