import { requireCondition } from '../column-v1/source-v2/soil.mjs';

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
