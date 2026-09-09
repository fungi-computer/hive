import test from "node:test";
import assert from "node:assert/strict";
import { compileGeometry } from "./geometry.mjs";
import { momentumRate, predict } from "./momentum.mjs";

const axes = ["x", "y", "z"];
const sides = axes.flatMap((axis) => [axis + "-", axis + "+"]);
const spacing = [1, 0.54, 1];
const origin = [-4, 2, -7];
function geometry({ open = sides, walls = [], solid = [] } = {}) {
  return compileGeometry({
    size: [3, 3, 3],
    origin,
    spacing,
    open,
    walls,
    solid,
    viscosity: 0.2,
    thermalDiffusivity: 0,
    tracerDiffusivity: 0,
    buoyancy: false,
  });
}
function faceId(axis, at) {
  return `${axes[axis]}:${at.map((v, d) => v + origin[d]).join(",")}`;
}
function sideFaces(axis, sign) {
  const other = [0, 1, 2].filter((d) => d !== axis),
    result = [];
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      const at = [0, 0, 0];
      at[axis] = sign < 0 ? 0 : 3;
      at[other[0]] = a;
      at[other[1]] = b;
      result.push(faceId(axis, at));
    }
  }
  return result;
}
function state(g, component) {
  return {
    velocityMPS: Float64Array.from(g.faces, (f) =>
      component === undefined
        ? 0.2 + f.axis * 0.1 + f.at[1] * 0.02
        : f.axis === component
          ? 0.6
          : 0,
    ),
    heatJ: new Float64Array(g.n),
  };
}
function face(g, axis, at) {
  const f = g.faces.find((value) => value.id === faceId(axis, at));
  assert(f, `expected supported face ${faceId(axis, at)}`);
  return f;
}
function close(actual, expected) {
  assert(
    Math.abs(actual - expected) < 1e-12,
    `${actual} differs from ${expected}`,
  );
}

test("fully masked exterior gives the same velocity update and timestep rate as a closed side", () => {
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const side = axes[axis] + (sign < 0 ? "-" : "+");
      const closed = geometry({
        open: sides.filter((value) => value !== side),
      });
      const masked = geometry({ walls: sideFaces(axis, sign) });
      assert.deepEqual(masked.faces, closed.faces);
      const a = state(closed),
        b = state(masked);
      assert.deepEqual(
        Array.from(predict(masked, b, 0.01)),
        Array.from(predict(closed, a, 0.01)),
      );
      assert.equal(
        momentumRate(masked, b.velocityMPS),
        momentumRate(closed, a.velocityMPS),
      );
    }
  }
});

test("one and two blocked support patches damp tangential flow by their physical area and spacing", () => {
  for (let d = 0; d < 3; d++) {
    for (const sign of [-1, 1]) {
      for (const component of [0, 1, 2].filter((axis) => axis !== d)) {
        const at = [1, 1, 1];
        at[d] = sign < 0 ? 0 : 2;
        const first = [...at];
        first[d] = sign < 0 ? 0 : 3;
        first[component]--;
        const second = [...first];
        second[component]++;
        for (const count of [0, 1, 2]) {
          const g = geometry({
            walls: [faceId(d, first), faceId(d, second)].slice(0, count),
          });
          const value = predict(g, state(g, component), 0.01)[
            face(g, component, at).k
          ];
          close(value, 0.6 - (count * 0.01 * 0.2 * 0.6) / spacing[d] ** 2);
        }
      }
    }
  }
});

test("outer component corners use their one real support patch without a fictitious half wall", () => {
  for (let d = 0; d < 3; d++) {
    for (const sign of [-1, 1]) {
      for (const component of [0, 1, 2].filter((axis) => axis !== d)) {
        for (const end of [0, 3]) {
          const at = [1, 1, 1];
          at[d] = sign < 0 ? 0 : 2;
          at[component] = end;
          const wall = [...at];
          wall[d] = sign < 0 ? 0 : 3;
          wall[component] = end === 0 ? 0 : 2;
          const open = geometry(),
            masked = geometry({ walls: [faceId(d, wall)] });
          const a = predict(open, state(open, component), 0.01)[
            face(open, component, at).k
          ];
          const b = predict(masked, state(masked, component), 0.01)[
            face(masked, component, at).k
          ];
          close(a, 0.6);
          close(b - a, (-2 * 0.01 * 0.2 * 0.6) / spacing[d] ** 2);
        }
      }
    }
  }
});
