import { makeFixture, sum } from './reference/solver.mjs';

// Quantize the *physical* channel coordinate in 12 m terraces first, then sample.
// Both 1 m and 2 m numerical grids therefore see precisely the same staircase.
export function steppedDiversion(n = 32) {
  const s = makeFixture({ n, model: 'swe', roughness: .07 });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, X = (x + .5) * s.geom.dx;
    const region = s.geom.region[i];
    if (region === 1) s.geom.z[i] = .4;
    else if (region === 2 || region === 6) s.geom.z[i] = .4 - .1 * Math.min(3, Math.floor((X - 16) / 12));
    else if (region === 3) s.geom.z[i] = .2;
    else if (region === 4 || region === 5) s.geom.z[i] = .1;
    if (region === 1) s.V[i] = .6 * s.geom.area;
  }
  s.initialVolume = sum(s.V);
  return s;
}

export function steppedRest(n = 32) {
  const s = makeFixture({ n, fixture: 'rest', model: 'swe', roughness: 0 });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    const X = (x + .5) * s.geom.dx, Y = (y + .5) * s.geom.dx;
    s.geom.z[i] = Math.hypot(X - 32, Y - 32) < 8 ? 1 : .1 * Math.floor(X / 16);
    s.V[i] = Math.max(0, .6 - s.geom.z[i]) * s.geom.area;
  }
  s.initialVolume = sum(s.V);
  return s;
}

export function dynamicChannel(n = 64) {
  const s = makeFixture({ n, length: 64, fixture: 'blank', model: 'swe', roughness: .01 });
  const first = Math.floor(n * .45), last = Math.floor(n * .55);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    s.geom.solid[i] = y < first || y >= last ? 1 : 0;
    s.V[i] = !s.geom.solid[i] ? (x < n / 2 ? .2 : .1) * s.geom.area : 0;
  }
  for (const f of s.geom.faces) f.open = f.a >= 0 && f.b >= 0 && !s.geom.solid[f.a] && !s.geom.solid[f.b];
  s.initialVolume = sum(s.V);
  return s;
}

export function fullyWet(n = 64) {
  const s = makeFixture({ n, length: 64, fixture: 'blank', model: 'swe', roughness: .01 });
  for (let i = 0; i < s.V.length; i++) s.V[i] = (.2 + .015 * Math.sin((i % n) * .2) * Math.cos(Math.floor(i / n) * .13)) * s.geom.area;
  s.initialVolume = sum(s.V);
  return s;
}
