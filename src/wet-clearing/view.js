import * as THREE from 'three';
import { Application, Sprite, Texture } from 'pixi.js';
import { camera } from '../art/prop-camera.js';
import { scene as litScene } from '../art/geometry.js';
import { MATERIAL } from '../world-presets/height-caves.mjs';

const WIDTH = 640, HEIGHT = 400;
/** Existing Three bake → low-resolution texture → Pixi. One mesh list and
 * camera own both visible geometry and ray picking, including vertical faces. */
export async function createWetView(host, select) {
  const app = new Application();
  await app.init({ width: WIDTH, height: HEIGHT, antialias: false,
    backgroundAlpha: 0, autoStart: false, resolution: 1 });
  host.append(app.canvas);
  app.canvas.setAttribute('aria-label', 'Isometric clearing: select a visible voxel');
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const world = litScene(), body = new THREE.Group(); world.add(body);
  const viewCamera = camera(WIDTH, HEIGHT, 0); viewCamera.zoom = 1.6; viewCamera.updateProjectionMatrix();
  const ray = new THREE.Raycaster(), pickable = [];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const soil = new THREE.MeshLambertMaterial({ vertexColors: true });
  const water = new THREE.MeshLambertMaterial({ color: '#529ca5' });
  const marked = new THREE.MeshBasicMaterial({ color: '#edc970', wireframe: true });
  const sprite = new Sprite(); app.stage.addChild(sprite);
  let previousTexture = null, displayed = null;

  function clear() {
    for (const child of [...body.children]) {
      if (child.geometry !== cube) child.geometry.dispose();
      body.remove(child);
    }
    pickable.length = 0;
  }
  function voxel(cell, spacing, origin, occupied) {
    const geometry = cube.clone(), colors = [];
    const exposed = !occupied.has([cell.at[0], cell.at[1] + 1, cell.at[2]].join(','));
    const damp = cell.theta === null ? 0 : Math.min(1, cell.theta / .45);
    for (let face = 0; face < 6; face++) {
      const color = new THREE.Color(cell.material === MATERIAL.stone ? '#73705a'
        : face === 2 && exposed ? '#83914c' : '#977141');
      if (cell.theta !== null) color.multiplyScalar(1 - .32 * damp);
      for (let vertex = 0; vertex < 4; vertex++) colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, soil);
    mesh.scale.fromArray(spacing);
    mesh.position.fromArray(cell.at.map((n, i) => (n + .5) * spacing[i] - origin[i]));
    mesh.userData.at = [...cell.at]; body.add(mesh); pickable.push(mesh);
  }
  function draw(scene, selection, turn) {
    displayed = scene;
    clear();
    const spacing = scene.spacingM;
    const origin = scene.bounds.min.map((n, i) =>
      (n + scene.bounds.max[i] - (i === 1 ? 1 : 0)) / 2 * spacing[i]);
    const occupied = new Set(scene.cells.map(cell => cell.at.join(',')));
    for (const cell of scene.cells) voxel(cell, spacing, origin, occupied);
    if (scene.water?.massKg > 0) {
      const pool = new THREE.Mesh(cube, water), liquid = scene.water;
      pool.scale.set(spacing[0], liquid.depthM, spacing[2]);
      pool.position.set((liquid.at[0] + .5) * spacing[0] - origin[0],
        liquid.baseYM + liquid.depthM / 2 - origin[1],
        (liquid.at[2] + .5) * spacing[2] - origin[2]);
      body.add(pool); // Actual metres, with no minimum visible depth or decorative fill.
    }
    if (selection) {
      const box = new THREE.Mesh(cube, marked);
      box.scale.fromArray(spacing.map(n => n * 1.01));
      box.position.fromArray(selection.map((n, i) => (n + .5) * spacing[i] - origin[i]));
      body.add(box);
    }
    body.rotation.y = turn * Math.PI / 2;
    world.updateMatrixWorld(true);
    renderer.render(world, viewCamera);
    const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
    canvas.getContext('2d').drawImage(renderer.domElement, 0, 0);
    const texture = Texture.from(canvas); texture.source.scaleMode = 'nearest';
    sprite.texture = texture; app.render();
    previousTexture?.destroy(true); previousTexture = texture;
  }
  function click(event) {
    if (!displayed) return;
    const bounds = app.canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1,
      1 - (event.clientY - bounds.top) / bounds.height * 2), viewCamera);
    const hit = ray.intersectObjects(pickable, false)[0];
    if (hit) select([...hit.object.userData.at]);
  }
  app.canvas.addEventListener('click', click);
  return { draw, destroy() {
    app.canvas.removeEventListener('click', click); clear();
    previousTexture?.destroy(true); cube.dispose(); soil.dispose(); water.dispose(); marked.dispose();
    renderer.dispose(); renderer.forceContextLoss(); app.destroy(true, { children: true });
  } };
}
