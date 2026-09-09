const workspaces = new WeakMap();
function workspace(g) {
  if (!workspaces.has(g))
    workspaces.set(g, { predicted: new Float64Array(g.faces.length) });
  return workspaces.get(g);
}
function advector(g, v, face, d) {
  const indices = g.cross[face.k][d];
  return indices.reduce((s, i) => s + (i < 0 ? 0 : v[i]), 0) / indices.length;
}
function neighbor(v, f, relation) {
  return (
    (relation.index < 0 ? 0 : relation.other * v[relation.index]) +
    relation.center * v[f.k]
  );
}
export function momentumRate(g, v) {
  let rate = 0;
  for (const f of g.faces) {
    let row = 0;
    for (let d = 0; d < g.dimensions; d++) {
      const speed = advector(g, v, f, d),
        h = g.metric.spacing[d],
        [negative, positive] = g.stencil[f.k][d];
      row +=
        (Math.abs(speed) / h) *
          (1 - (speed >= 0 ? negative : positive).center) +
        (g.viscosity * (2 - negative.center - positive.center)) / (h * h);
    }
    rate = Math.max(rate, row);
  }
  return rate;
}
export function predict(g, s, dt) {
  const out = workspace(g).predicted;
  for (const face of g.faces) {
    const c = s.velocityMPS[face.k];
    let advection = 0,
      laplacian = 0;
    for (let d = 0; d < g.dimensions; d++) {
      const [minus, plus] = g.stencil[face.k][d],
        negative = neighbor(s.velocityMPS, face, minus),
        positive = neighbor(s.velocityMPS, face, plus);
      const speed = advector(g, s.velocityMPS, face, d),
        h = g.metric.spacing[d];
      advection += (speed * (speed >= 0 ? c - negative : positive - c)) / h;
      laplacian += (negative + positive - 2 * c) / (h * h);
    }
    let force = 0;
    if (g.buoyancy && face.axis === g.verticalAxis) {
      const ti =
          face.i < 0
            ? 0
            : s.heatJ[face.i] /
              (g.model.densityKgM3 * g.model.heatCapacityJKgK * g.volume),
        tj =
          face.j < 0
            ? 0
            : s.heatJ[face.j] /
              (g.model.densityKgM3 * g.model.heatCapacityJKgK * g.volume);
      force +=
        (g.model.gravityMSS * (ti + tj)) / (2 * g.model.referenceTemperatureK);
    }
    out[face.k] = c + dt * (-advection + g.viscosity * laplacian + force);
  }
  return out;
}
