import * as THREE from "three";
import { camera as artCamera } from "../../art/prop-camera.js";
import { createAssetBank } from "./assets.js";
import { validateFixture, replayActor } from "./fixture.js";
import { createTerrainOwner } from "./terrain.js";

const WIDTH = 640, HEIGHT = 400;

export function createDepthStudy({ canvas, onSelection = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(WIDTH, HEIGHT, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor("#28382e", 1);
  const world = new THREE.Scene();
  world.add(new THREE.HemisphereLight("#fff1cc", "#606c71", 2.15));
  const sun = new THREE.DirectionalLight("#ffe0a4", 2.7); sun.position.set(-3, 9, 6); world.add(sun);
  const camera = artCamera(WIDTH, HEIGHT, 1.03, 256);
  const target = new THREE.Vector3(0, 0, 0);
  const baseOffset = camera.position.clone().sub(new THREE.Vector3(0, 1.03, 0));
  const radius = Math.hypot(baseOffset.x, baseOffset.z), elevation = Math.atan2(baseOffset.y, radius);
  let sceneData = null, terrain = null, bank = null, props = new Map(), actors = new Map(), water = null, waterEnabled = false;
  let view = { target: { x: 0, y: 0, z: 0 }, azimuth: 0, zoom: 1, cutLevel: null }, replayTime = 0;
  let dirty = true, disposed = false, lastRender = 0;

  function clearModels() {
    for (const object of props.values()) object.removeFromParent();
    for (const object of actors.values()) object.removeFromParent();
    props.clear(); actors.clear();
    if (terrain) terrain.dispose(); terrain = null;
    if (water) { water.geometry.dispose(); water.material.dispose(); water.removeFromParent(); water = null; }
    if (bank) bank.dispose(); bank = null;
  }
  function applyCamera() {
    target.set(view.target.x, view.target.y, view.target.z);
    const a = view.azimuth, offset = new THREE.Vector3(Math.cos(a) * radius, Math.sin(elevation) * radius, Math.sin(a) * radius);
    offset.y = Math.sin(elevation) * radius;
    camera.position.copy(target).add(offset); camera.lookAt(target); camera.zoom = view.zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }
  function applyVisibility() {
    const cut = view.cutLevel;
    for (const object of props.values()) object.visible = cut === null || object.userData.supportY <= cut;
    for (const object of actors.values()) object.visible = cut === null || object.userData.supportY <= cut;
  }
  function updateActors() {
    for (const [id, actor] of actors) {
      const data = sceneData.actors.find(item => item.id === id); if (!data) continue;
      const pose = replayActor(data, replayTime);
      actor.position.set(pose.x, pose.y * 0.54, pose.z);
      const bankPoses = actor.children;
      bankPoses.forEach((child, i) => { child.visible = i === Math.floor(pose.phase * 8) % 8; });
    }
  }
  function setScene(value) {
    sceneData = validateFixture(value); clearModels(); bank = createAssetBank(); terrain = createTerrainOwner(sceneData); world.add(terrain.root);
    for (const data of sceneData.objects) { const model = bank.model(data.kind, data.direction); model.position.set(data.x, data.y * 0.54, data.z); model.userData = { id: data.id, kind: data.kind, supportY: data.supportY ?? data.y }; model.traverse(item => { if (item.isMesh) item.userData.pickTarget = { kind: "object", id: data.id }; }); props.set(data.id, model); world.add(model); }
    for (const data of sceneData.actors) { const model = bank.actor(data.kind, data.direction); model.position.set(data.x, data.y * 0.54, data.z); model.userData = { id: data.id, kind: "actor", supportY: data.supportY ?? data.y }; model.traverse(item => { if (item.isMesh) item.userData.pickTarget = { kind: "actor", id: data.id }; }); actors.set(data.id, model); world.add(model); }
    addWater(); applyVisibility(); dirty = true;
  }
  function addWater() {
    if (!sceneData?.water || !waterEnabled) return;
    const w = sceneData.water; const geometry = new THREE.PlaneGeometry(w.width, w.depth); geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshLambertMaterial({ color: "#6f9c9c", transparent: true, opacity: 0.56, depthTest: true, depthWrite: false });
    water = new THREE.Mesh(geometry, material); water.position.set(w.x, w.y, w.z); water.userData.pickTarget = { kind: "water", id: "water:patch" }; world.add(water);
  }
  function setView(next) { view = { ...view, ...next, target: next.target ? { ...next.target } : view.target }; applyCamera(); if (terrain && next.cutLevel !== undefined) terrain.setCut(next.cutLevel); applyVisibility(); dirty = true; }
  function pick({ cssX, cssY }) {
    camera.updateMatrixWorld(true); world.updateMatrixWorld(true);
    const rect = canvas.getBoundingClientRect(); const x = (cssX - rect.left) / rect.width, y = (cssY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(x * 2 - 1, -(y * 2 - 1)), camera);
    const leaves = [];
    world.traverse(item => {
      if (!item.isMesh || !item.userData.pickTarget) return;
      let visible = true; for (let cursor = item; cursor && cursor !== world; cursor = cursor.parent) if (!cursor.visible) { visible = false; break; }
      if (visible) leaves.push(item);
    });
    const hit = raycaster.intersectObjects(leaves, false).find(item => item.object.userData.pickTarget?.kind !== "water");
    let result = hit?.object.userData.pickTarget ?? null;
    const ranges = hit?.object.userData.pickRanges;
    if (ranges && Number.isInteger(hit.faceIndex)) {
      const range = ranges.find(item => hit.faceIndex >= item.firstTriangle && hit.faceIndex < item.firstTriangle + item.triangleCount);
      result = range?.target ?? result;
    }
    onSelection(result); return result;
  }
  function render() { if (disposed) return; applyCamera(); updateActors(); if (dirty) { applyVisibility(); dirty = false; } const start = performance.now(); renderer.render(world, camera); lastRender = performance.now() - start; }
  function resize({ cssWidth, cssHeight }) { canvas.style.width = `${cssWidth}px`; canvas.style.height = `${cssHeight}px`; renderer.setSize(WIDTH, HEIGHT, false); }
  return {
    setScene, setView, setReplayTime(seconds) { replayTime = Number(seconds) || 0; dirty = true; }, resize, pick, render,
    setWater(enabled) { if (sceneData) { waterEnabled = Boolean(enabled); if (water) { water.geometry.dispose(); water.material.dispose(); water.removeFromParent(); water = null; } if (waterEnabled) addWater(); dirty = true; } },
    evictTerrain() { terrain?.evictAll(); }, rebuildTerrain() { terrain?.rebuild(); dirty = true; },
    inspect() { return { ...terrain?.inspect(), ...bank?.inspect(), props: props.size, actors: actors.size, renderMs: lastRender, view: { ...view }, replayTime }; },
    dispose() { if (disposed) return; disposed = true; clearModels(); renderer.dispose(); renderer.forceContextLoss(); },
    canvas, camera,
  };
}
