// Original timber sailing boat for the pirate moving-support example.
// The deck is deliberately open: navigation owns its rectangle separately.
import * as THREE from "three";
import { scene, box, cylinder, group, mesh } from "./geometry.js";

export const SHIP_DECK = Object.freeze({
  minX: -3,
  maxX: 3,
  minZ: -2,
  maxZ: 2,
  height: 1,
});

function plank(parent, color, x, y, z, w, h, d) {
  box(parent, color, x, y, z, w, h, d);
}

function hull(parent) {
  // Keep the retained full rectangular working deck, but give the outer hull a
  // pointed +X prow and shaped stern. Art does not enlarge the walkable surface.
  function course(y, height, inset, color) {
    const shape = new THREE.Shape();
    const points = [[-3.55+inset,-1.65+inset],[-2.9,-2.22+inset],[2.8,-2.22+inset],[4.05-inset,0],[2.8,2.22-inset],[-2.9,2.22-inset],[-3.55+inset,1.65-inset]];
    points.forEach(([x,z],i) => i ? shape.lineTo(x,z) : shape.moveTo(x,z));
    shape.closePath();
    const timber = mesh(parent, new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}),color,0,y,0);
    timber.rotation.x = -Math.PI/2;
  }
  course(0.12,0.24,0.24,"#503d31");
  course(0.36,0.2,0.12,"#775238");
  course(0.56,0.18,0.04,"#9a7148");
  course(0.74,0.12,0,"#bd915b");
  // Prow cap, stern transom and external rubbing strakes stay outside crew space.
  box(parent,"#d1ac6d",3.35,0.99,0,0.65,0.18,0.22);
  const bowsprit=box(parent,"#825b3a",3.68,1.2,0,1.05,0.11,0.11);
  bowsprit.rotation.z=0.12;
  for(const z of [-2.2,2.2]) box(parent,"#4f625b",-0.15,0.59,z,5.85,0.09,0.07);
  box(parent,"#63503a",-3.51,0.93,0,0.14,0.42,2.9);
  for(const z of [-1.25,0,1.25]) box(parent,"#c8a368",-3.6,0.92,z,0.055,0.17,0.36);
}

function deck(parent) {
  // Six broad boards leave the full x[-3,3], z[-2,2] rectangle visibly open.
  for (let index = 0, x = -2.5; x <= 2.5; x += 1, index++)
    plank(
      parent,
      index % 2 ? "#c18d52" : "#b27d48",
      x,
      0.95,
      0,
      1,
      0.1,
      3.88,
    );
  // Low rim sits just beyond the walkable rectangle.
  for (const x of [-3.18, 3.18]) {
    plank(parent, "#754b32", x, 1.23, 0, 0.18, 0.34, 4.55);
    plank(parent, "#a26c3f", x, 1.45, 0, 0.22, 0.12, 4.7);
  }
  for (const z of [-2.18, 2.18]) {
    plank(parent, "#754b32", 0, 1.23, z, 6.55, 0.34, 0.18);
    plank(parent, "#a26c3f", 0, 1.45, z, 6.7, 0.12, 0.22);
  }
}

function mastAndRigging(parent) {
  // The sail remains along the far rim so the complete navigable deck is clear.
  cylinder(parent,"#654a33",-0.85,2.42,2.32,0.075,0.12,3.0,8);
  box(parent,"#9b7949",-0.1,3.55,2.3,2.2,0.09,0.09).rotation.z=-0.07;
  const canvas = new THREE.Shape();
  canvas.moveTo(-0.76,3.46);canvas.lineTo(1.02,3.32);
  canvas.quadraticCurveTo(1.28,2.62,0.96,1.89);
  canvas.lineTo(-0.7,2.06);canvas.quadraticCurveTo(-0.47,2.75,-0.76,3.46);
  const sail=mesh(parent,new THREE.ExtrudeGeometry(canvas,{depth:0.045,bevelEnabled:false,curveSegments:4}),"#ddc99a",0,0,2.3);
  sail.name="ship-sail";
  box(parent,"#aeb59b",0.03,2.73,2.36,0.32,1.15,0.03).rotation.z=-0.04;
  box(parent,"#bb8e60",0.55,2.28,2.37,0.28,0.24,0.04).rotation.z=0.15;
  const pennant=new THREE.Shape();pennant.moveTo(0,0);pennant.lineTo(0.82,-0.13);pennant.lineTo(0.45,-0.3);pennant.lineTo(0,-0.24);pennant.closePath();
  mesh(parent,new THREE.ExtrudeGeometry(pennant,{depth:0.025,bevelEnabled:false}),"#a45e54",-0.85,4,2.32);
  // Small stern lantern and rudder supply readable asymmetry in every facing.
  box(parent,"#53625a",-3.25,1.71,-1.6,0.11,0.77,0.11);
  box(parent,"#b9995d",-3.25,2.04,-1.6,0.24,0.31,0.24);
  box(parent,"#e0bf70",-3.25,2.04,-1.735,0.16,0.19,0.025);
  box(parent,"#53625a",-3.25,2.22,-1.6,0.31,0.065,0.31);
  box(parent,"#705238",-3.66,0.25,0,0.3,0.7,0.12);
}

export function shipScene(direction = 0) {
  if (!Number.isSafeInteger(direction) || direction < 0 || direction > 3)
    throw new Error("Ship direction must be one of four quarter turns");
  const result = scene();
  const model = group(result);
  model.name = "ship";
  // Native facing turns local +x toward local -z for direction 1.
  model.rotation.y = -(direction * Math.PI) / 2;
  hull(model);
  deck(model);
  mastAndRigging(model);
  const datum = group(model, 0, SHIP_DECK.height, 0);
  datum.name = "ship-deck-datum";
  return result;
}
