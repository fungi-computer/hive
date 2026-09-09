import { requireCondition } from './soil.mjs';
import { verticalPitFace } from './vertical-face.mjs';
import { surfaceExchange } from './surface-exchange.mjs';

const elevation = node => node.kind === 'soil' ? node.centerM[1] : node.elevationM;

// Each primitive returns [volume rate, derivative with respect to left head,
// derivative with respect to right head], in m³/s and m²/s. It owns orientation
// and its boundary geometry; the solver only assembles paired transfers.
function surfaceFace(g, face, heads) {
  const result = surfaceExchange({
    leftSurfaceM: g.nodes[face.left].baseYM + Math.max(heads[face.left], 0),
    rightSurfaceM: g.nodes[face.right].baseYM + Math.max(heads[face.right], 0),
    crestM: face.crestM, openingLengthM: face.openingLengthM, coefficient: face.coefficient });
  return [result.volumeRateM3S,
    heads[face.left] < 0 ? 0 : result.derivativeLeftM2S,
    heads[face.right] < 0 ? 0 : result.derivativeRightM2S];
}

function exposedSide(g, face, heads) {
  const leftSoil = g.nodes[face.left].kind === 'soil';
  const soilIndex = leftSoil ? face.left : face.right, pitIndex = leftSoil ? face.right : face.left;
  const soilNode = g.nodes[soilIndex], pit = g.nodes[pitIndex];
  const baseYM = face.at[1] * g.descriptor.spacingM[1], heightM = g.descriptor.spacingM[1];
  const result = verticalPitFace(g.soils[soilNode.soilId], {
    soilHeadM: heads[soilIndex], soilCenterYM: soilNode.centerM[1], baseYM,
    heightM, widthM: face.areaM2 / heightM,
    pitHeadM: pit.baseYM + Math.max(heads[pitIndex], 0) - baseYM,
    soilDistanceM: leftSoil ? face.leftDistanceM : face.rightDistanceM,
    traceDistanceM: leftSoil ? face.rightDistanceM : face.leftDistanceM });
  const pitDerivative = heads[pitIndex] < 0 ? 0 : result.derivativePitM2S;
  return leftSoil ? [result.volumeRateM3S, result.derivativeSoilM2S, pitDerivative] :
    [-result.volumeRateM3S, -pitDerivative, -result.derivativeSoilM2S];
}

function porousFace(g, face, heads, endpoint) {
  const left = endpoint(face.left, face.leftSoilId), right = endpoint(face.right, face.rightSoilId);
  const a = face.leftDistanceM / left.conductivityMPerS;
  const b = face.rightDistanceM / right.conductivityMPerS, resistance = a + b;
  const mobility = face.areaM2 / resistance;
  const difference = heads[face.left] + elevation(g.nodes[face.left]) -
    heads[face.right] - elevation(g.nodes[face.right]);
  return [mobility * difference,
    mobility * (1 + difference * a / resistance * left.conductivityDerivativePerS / left.conductivityMPerS),
    mobility * (-1 + difference * b / resistance * right.conductivityDerivativePerS / right.conductivityMPerS)];
}

export function exchangeFaces(g, heads, nodeFields) {
  const rates = new Float64Array(g.faces.length), dLeft = new Float64Array(g.faces.length),
    dRight = new Float64Array(g.faces.length), boundaryFields = new Map();
  // A reservoir trace belongs to the adjacent soil on this face. It is a
  // per-evaluation property cache, never another soil definition or water stock.
  function endpoint(node, soilId) {
    if (g.nodes[node].kind === 'soil') return nodeFields[node];
    const key = `${node}/${soilId}`;
    if (!boundaryFields.has(key)) boundaryFields.set(key, g.soils[soilId].at(heads[node]));
    return boundaryFields.get(key);
  }
  for (const [k, face] of g.faces.entries()) {
    const values = face.kind === 'surface' ? surfaceFace(g, face, heads) :
      face.pitRole === 'side' ? exposedSide(g, face, heads) : porousFace(g, face, heads, endpoint);
    [rates[k], dLeft[k], dRight[k]] = values;
  }
  requireCondition(rates.every(Number.isFinite) && dLeft.every(Number.isFinite) && dRight.every(Number.isFinite),
    'finite exchange rates and analytic derivatives');
  return { volumeRateM3S: rates, derivativeLeftM2S: dLeft, derivativeRightM2S: dRight };
}
