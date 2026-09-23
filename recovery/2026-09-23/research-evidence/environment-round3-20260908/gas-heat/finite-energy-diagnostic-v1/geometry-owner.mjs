import { geometry } from '../transport-v2/checkpoint/geometry.mjs';

// Internal ownership loan to the numerical modules. No public result exposes
// this object. The source object's mutable derived arrays are never our geometry.
// A geometry binding lasts for its immutable canonical descriptor; actual edits
// require a new descriptor/binding and do not transplant existing gas quantities.
const bindings = new WeakMap();
export function numericalGeometry(input) {
  if (!input || typeof input !== 'object' || typeof input.identity !== 'string')
    throw new Error('canonical numerical geometry descriptor required');
  if (bindings.has(input)) {
    const owned = bindings.get(input);
    if (input.identity !== owned.identity) throw new Error('bound geometry descriptor changed');
    return owned;
  }
  const d = JSON.parse(input.identity);
  const owned = geometry({ size: d.size, spacing: d.metric?.spacing, extrusion: d.metric?.extrusion,
    axes: d.axes, origin: d.origin, domainId: d.domainId, revision: d.revision,
    periodic: d.periodic, open: d.open, solid: d.solid, walls: d.walls,
    viscosity: d.viscosity, thermalDiffusivity: d.thermalDiffusivity,
    tracerDiffusivity: d.tracerDiffusivity, buoyancy: d.buoyancy });
  if (owned.identity !== input.identity) throw new Error('geometry descriptor does not reproduce exact identity');
  bindings.set(input, owned); bindings.set(owned, owned);
  return owned;
}
