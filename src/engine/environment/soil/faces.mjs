import { requireCondition } from './soil.mjs';
import { verticalPitFace } from './vertical-face.mjs';

// Extracted from the accepted column's series-resistance face law. The two
// endpoints may have different material definitions. Boundary trace properties
// belong to the adjacent soil on this FACE, not a second reservoir soil/stock.
export function darcyFaces(g, heads, nodeFields) {
  const rates = new Float64Array(g.faces.length), dLeft = new Float64Array(g.faces.length),
    dRight = new Float64Array(g.faces.length), boundaryFields = new Map();
  function endpoint(node, soilId) {
    if (g.nodes[node].kind === 'soil') return nodeFields[node];
    const key = `${node}/${soilId}`;
    if (!boundaryFields.has(key)) boundaryFields.set(key, g.soils[soilId].at(heads[node]));
    return boundaryFields.get(key);
  }
  function elevation(node) {
    return node.kind === 'soil' ? node.centerM[1] : node.elevationM;
  }
  for (const [k, face] of g.faces.entries()) {
    if (face.pitRole === 'side') {
      const leftSoil = g.nodes[face.left].kind === 'soil';
      const soilIndex = leftSoil ? face.left : face.right, pitIndex = leftSoil ? face.right : face.left;
      const soilNode = g.nodes[soilIndex], pit = g.nodes[pitIndex];
      const physical = verticalPitFace(g.soils[soilNode.soilId], {
        soilHeadM: heads[soilIndex], soilCenterYM: soilNode.centerM[1], baseYM: pit.baseYM,
        heightM: pit.heightM, widthM: face.areaM2 / pit.heightM, pitHeadM: heads[pitIndex],
        soilDistanceM: leftSoil ? face.leftDistanceM : face.rightDistanceM,
        traceDistanceM: leftSoil ? face.rightDistanceM : face.leftDistanceM });
      rates[k] = leftSoil ? physical.volumeRateM3S : -physical.volumeRateM3S;
      dLeft[k] = leftSoil ? physical.derivativeSoilM2S : -physical.derivativePitM2S;
      dRight[k] = leftSoil ? physical.derivativePitM2S : -physical.derivativeSoilM2S;
      continue;
    }
    const left = endpoint(face.left, face.leftSoilId), right = endpoint(face.right, face.rightSoilId);
    const a = face.leftDistanceM / left.conductivityMPerS;
    const b = face.rightDistanceM / right.conductivityMPerS, resistance = a + b;
    const mobility = face.areaM2 / resistance;
    const difference = heads[face.left] + elevation(g.nodes[face.left]) -
      heads[face.right] - elevation(g.nodes[face.right]);
    rates[k] = mobility * difference;
    dLeft[k] = mobility * (1 + difference * a / resistance *
      left.conductivityDerivativePerS / left.conductivityMPerS);
    dRight[k] = mobility * (-1 + difference * b / resistance *
      right.conductivityDerivativePerS / right.conductivityMPerS);
  }
  requireCondition(rates.every(Number.isFinite) && dLeft.every(Number.isFinite) && dRight.every(Number.isFinite),
    'finite face rates and analytic conductivity derivatives');
  return { volumeRateM3S: rates, derivativeLeftM2S: dLeft, derivativeRightM2S: dRight };
}
