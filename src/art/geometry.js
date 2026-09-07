// Original mesh primitives, fixed camera and light shared by the baked subjects.
import * as THREE from "three";
const materials = new Map();
function mat(color) {
  if (!materials.has(color))
    materials.set(
      color,
      new THREE.MeshLambertMaterial({ color, flatShading: true }),
    );
  return materials.get(color);
}
export function mesh(parent, geo, color, x, y, z) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function box(p, color, x, y, z, w, h, d) {
  return mesh(p, new THREE.BoxGeometry(w, h, d), color, x, y, z);
}
export function ball(p, color, x, y, z, w, h = w, d = w) {
  const m = mesh(p, new THREE.SphereGeometry(1, 8, 6), color, x, y, z);
  m.scale.set(w, h, d);
  return m;
}
export function cylinder(p, color, x, y, z, top, bottom, h, sides = 10) {
  return mesh(
    p,
    new THREE.CylinderGeometry(top, bottom, h, sides),
    color,
    x,
    y,
    z,
  );
}
export function group(p, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  p.add(g);
  return g;
}
export function camera(width, height, span, targetY) {
  const c = new THREE.OrthographicCamera(
    -span / 2,
    span / 2,
    (span * height) / width / 2,
    (-span * height) / width / 2,
    0.1,
    80,
  );
  c.position.set(12, 12 + targetY, 12);
  c.lookAt(0, targetY, 0);
  c.updateMatrixWorld();
  return c;
}
export const worldCamera = camera(480, 320, 14, 0.5);
export function project(x, z, y = 0) {
  const p = new THREE.Vector3(x - 3, y, z - 3).project(worldCamera);
  return { x: Math.round((p.x + 1) * 240), y: Math.round((1 - p.y) * 160) };
}
export function scene() {
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight("#fff1cc", "#606c71", 2.15));
  const sun = new THREE.DirectionalLight("#ffe0a4", 2.7);
  sun.position.set(-3, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -6,
    right: 6,
    top: 6,
    bottom: -6,
    near: 0.1,
    far: 30,
  });
  sun.shadow.bias = -0.001;
  s.add(sun);
  return s;
}
export function mushroom(p, x, y, z, scale = 1, color = "#ab5348") {
  cylinder(
    p,
    "#eee0b4",
    x,
    y + 0.14 * scale,
    z,
    0.045 * scale,
    0.065 * scale,
    0.28 * scale,
    7,
  );
  const cap = ball(
    p,
    color,
    x,
    y + 0.3 * scale,
    z,
    0.2 * scale,
    0.13 * scale,
    0.2 * scale,
  );
  cap.rotation.z = 0.13;
  ball(
    p,
    "#eee0b4",
    x - 0.07 * scale,
    y + 0.4 * scale,
    z + 0.06 * scale,
    0.04 * scale,
    0.018 * scale,
    0.04 * scale,
  );
}

export function groundCell(x, y) {
  const point = new THREE.Vector3(x / 240 - 1, 1 - y / 160, -1).unproject(
    worldCamera,
  );
  const ray = new THREE.Ray(
    point,
    worldCamera.getWorldDirection(new THREE.Vector3()),
  );
  const hit = ray.intersectPlane(
    new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    new THREE.Vector3(),
  );
  return { x: Math.round(hit.x + 3), z: Math.round(hit.z + 3) };
}
