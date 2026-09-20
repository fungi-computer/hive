import { polygonContains, prepareOrderingProxy } from "./plane-order.js";

const DIRECTIONS = Object.freeze([
  { face: "top", offset: [0, 1, 0] }, { face: "bottom", offset: [0, -1, 0] },
  { face: "east", offset: [1, 0, 0] }, { face: "west", offset: [-1, 0, 0] },
  { face: "south", offset: [0, 0, 1] }, { face: "north", offset: [0, 0, -1] },
]);
const key = values => values.join(",");
const overlaps = (a, b) => a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;

function corners([x, y, z], face, h) {
  const l = x - 0.5, r = x + 0.5, b = (y - 0.5) * h, t = (y + 0.5) * h, n = z - 0.5, s = z + 0.5;
  const values = {
    top: [[l,t,n], [l,t,s], [r,t,s], [r,t,n]], bottom: [[l,b,n], [r,b,n], [r,b,s], [l,b,s]],
    east: [[r,b,n], [r,t,n], [r,t,s], [r,b,s]], west: [[l,b,s], [l,t,s], [l,t,n], [l,b,n]],
    south: [[l,b,s], [r,b,s], [r,t,s], [l,t,s]], north: [[r,b,n], [l,b,n], [l,t,n], [r,t,n]],
  };
  return values[face].map(([x,y,z]) => ({x,y,z}));
}

// Terrain owns these completed ordering subtrees. Presentation objects (atlas,
// textures, hit callbacks and mesh state) remain under their existing owners.
const frozenGeometry = new WeakSet();
function freezeOrderingGeometry(value) {
  if (value && typeof value === "object" && !frozenGeometry.has(value)) {
    for (const child of Object.values(value)) freezeOrderingGeometry(child);
    Object.freeze(value);
    frozenGeometry.add(value);
  }
  return value;
}

export function projectedBounds(points) {
  return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
}

/** Camera projection and original art for checked server-extracted faces. */
export function terrainFaceRecords({ faces, palette, verticalMetres, variantSeed = 0 }, { projection, viewport, appearance, generatedTops = new Map() }) {
  const materials = new Map(palette.map(material => [material.slot, material]));
  const records = [];
  for (const { cell, face, material, cap } of faces) {
    const direction = DIRECTIONS.find(value => value.face === face)?.offset;
    if (!direction) throw new Error("invalid terrain face orientation");
    if (direction[0] * projection.direction.x + direction[1] * projection.direction.y + direction[2] * projection.direction.z >= -1e-7) continue;
    const definition = materials.get(material);
    if (!definition?.solid) throw new Error("terrain face requires a solid material");
    const planarCorners = corners(cell, face, verticalMetres);
    const projected = planarCorners.map(point => projection.project(point));
    const screenBounds = projectedBounds(projected);
    if (viewport && !overlaps(screenBounds, viewport)) continue;
    const visual = appearance?.body({ cell, face, material, art:definition.art, cap,
      generatedTop:generatedTops.get(`${cell[0]},${cell[2]}`), seed:variantSeed, projection, verticalMetres });
    const record = { id:`terrain:${key(cell)}:${face}`, part:"face", role:"terrain", cell, face,
      renderPass:"opaque", attachment:Object.freeze({kind:"cell-face",cell:Object.freeze([...cell]),face}),
      ...(face === "top" ? {partRole:"supporting-surface"} : {}),
      material, cap, planarCorners, footprint:planarCorners, orderGeometry:{kind:"face",points:planarCorners},
      screenBounds, storeyBand:cell[1], pickable:false, visible:true, projected, ...(visual??{}) };
    const proxy = prepareOrderingProxy(record, projection);
    if (!proxy) continue;
    record.contains = point => polygonContains(proxy.polygon, point);
    freezeOrderingGeometry(record.orderGeometry);
    records.push(record);
  }
  return records;
}

const coverIdentity = cover => `${cover.kind}\u0000${cover.condition}\u0000${cover.height}`;

/** Dual-grid cover patches are ordinary sortable records derived from four
 * explicit same-level surface facts. They never infer grass from geology.
 */
export function terrainCoverRecords(surfaces, { level, projection, viewport, appearance, verticalMetres, variantSeed = 0 } = {}) {
  if (!appearance?.cover || !Number.isFinite(verticalMetres) || verticalMetres <= 0) return [];
  const covered = new Map(surfaces.filter(surface => surface.cover && surface.cell[1] <= level)
    .map(surface => [`${surface.cell[0]},${surface.cell[2]}`, surface]));
  const roots = new Map();
  for (const surface of covered.values()) for (const [dx, dz] of [[0,0],[-1,0],[-1,-1],[0,-1]])
    roots.set(`${surface.cell[0]+dx},${surface.cell[2]+dz}`, [surface.cell[0]+dx, surface.cell[2]+dz]);
  const records = [];
  for (const root of roots.values()) {
    const samples = [[0,0],[1,0],[1,1],[0,1]].map(([dx,dz]) => covered.get(`${root[0]+dx},${root[1]+dz}`));
    const identities = new Set(samples.filter(Boolean).map(surface => `${surface.cell[1]}\u0000${coverIdentity(surface.cover)}`));
    for (const identity of identities) {
      const [yText, kind, condition, height] = identity.split("\u0000"), y = Number(yText);
      let mask = 0;
      samples.forEach((surface, index) => {
        if (surface && surface.cell[1] === y && coverIdentity(surface.cover) === `${kind}\u0000${condition}\u0000${height}`) mask |= 1 << index;
      });
      if (!mask) continue;
      const surfaceY = (y + 0.5) * verticalMetres;
      const visual = appearance.cover({ cover: { kind, condition, height }, mask, root, seed: variantSeed, projection, surfaceY });
      const footprint = [{ x: root[0] + 0.5, y: surfaceY, z: root[1] + 0.5 }];
      // These are physical cell facts, independent of whether a neighboring
      // face happened to survive view culling. Ordering cannot change when a
      // support picture enters or leaves the draw list.
      const supports = samples.flatMap((surface, index) => surface && (mask & (1 << index))
        ? [Object.freeze([...surface.cell])] : []);
      const screenBounds = projectedBounds(visual.projected);
      if (viewport && !overlaps(screenBounds, viewport)) continue;
      const record = { id: `cover:${root[0]}:${y}:${root[1]}:${kind}:${condition}:${height}`, part: "cover", role: "terrain-cover",
        relationPolicy: "surface-cover", orderingKind: "compact", mask, footprint, screenBounds, storeyBand: y,
        renderPass: "opaque", attachment: Object.freeze({ kind: "surface-root", supports: Object.freeze(supports), point: footprint[0] }),
        pickable: false, visible: true, ...visual };
      const proxy = prepareOrderingProxy(record, projection);
      if (!proxy) continue;
      // Appearance owns the alpha silhouette used by the shared draw picker.
      // The full batching quad is never substituted for that silhouette.
      freezeOrderingGeometry(record.orderGeometry);
      records.push(record);
    }
  }
  return records;
}

/** Conservative horizontal regions across the whole cut depth. There is no
 * vertical chunk enumeration and the runtime supplies each region's halo. */
export function visibleTerrainRegions({ bounds, level, verticalMetres, projection, viewport, padding = 32, limit = 256 }) {
  const expanded = { left:viewport.left-padding, right:viewport.right+padding, top:viewport.top-padding, bottom:viewport.bottom+padding };
  const low = (bounds.minY-.5)*verticalMetres, high = (Math.min(bounds.maxY,level+1)-.5)*verticalMetres;
  if (high <= low) return {kind:"ready",regions:[],projected:[]};
  const screens = [[expanded.left,expanded.top],[expanded.right,expanded.top],[expanded.right,expanded.bottom],[expanded.left,expanded.bottom]];
  const hits = screens.flatMap(([x,y]) => {
    const ray = projection.ray({x,y});
    if (Math.abs(ray.direction.y)<1e-7) throw new Error("terrain demand requires a downward camera");
    return [low,high].map(height => {const t=(height-ray.origin.y)/ray.direction.y;return {x:ray.origin.x+t*ray.direction.x,z:ray.origin.z+t*ray.direction.z};});
  });
  const startX=Math.max(Math.floor(bounds.minX/8),Math.floor((Math.min(...hits.map(p=>p.x))-.5)/8));
  const endX=Math.min(Math.floor((bounds.maxX-1)/8),Math.floor((Math.max(...hits.map(p=>p.x))+.5)/8));
  const startZ=Math.max(Math.floor(bounds.minZ/8),Math.floor((Math.min(...hits.map(p=>p.z))-.5)/8));
  const endZ=Math.min(Math.floor((bounds.maxZ-1)/8),Math.floor((Math.max(...hits.map(p=>p.z))+.5)/8));
  const regions=[], projected=[];
  for(let x=startX;x<=endX;x++)for(let z=startZ;z<=endZ;z++) {
    const points=[Math.max(bounds.minX,x*8)-.5,Math.min(bounds.maxX,(x+1)*8)-.5].flatMap(px=>[low,high].flatMap(py=>
      [Math.max(bounds.minZ,z*8)-.5,Math.min(bounds.maxZ,(z+1)*8)-.5].map(pz=>projection.project({x:px,y:py,z:pz}))));
    const rect=projectedBounds(points);
    if(!overlaps(rect,expanded))continue;
    regions.push([x,z]);projected.push(rect);
    if(regions.length>limit)return {kind:"view-budget",limit};
  }
  return {kind:"ready",regions,projected};
}

/** Priority changes are cheap and do not replace the retained camera plan. */
export function prioritizeTerrainRegions(plan, viewport) {
  const x=(viewport.left+viewport.right)/2,y=(viewport.top+viewport.bottom)/2;
  const ranked=plan.regions.map((region,index)=>{
    const rect=plan.projected[index], visible=overlaps(rect,viewport);
    const distance=Math.hypot(Math.max(rect.left-x,0,x-rect.right),Math.max(rect.top-y,0,y-rect.bottom));
    const centerDistance=Math.hypot((rect.left+rect.right)/2-x,(rect.top+rect.bottom)/2-y);
    return {region,visible,distance,centerDistance,index};
  }).sort((a,b)=>Number(b.visible)-Number(a.visible)||a.distance-b.distance||a.centerDistance-b.centerDistance||a.index-b.index);
  return {regions:ranked.map(item=>item.region),visibleRegions:ranked.filter(item=>item.visible).map(item=>item.region)};
}
