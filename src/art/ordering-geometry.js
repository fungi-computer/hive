import { Box3, Vector3 } from "three";

/** Capture detached visual bounds before the bake disposes its source mesh.
 * This says nothing about occupancy, collision, support or inventory. Callers
 * retain the bake frame's transform and must transform it exactly once.
 */
export function captureVisualVolume(source, { silhouette = false } = {}) {
  source.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(source, true);
  if (box.isEmpty()) throw new Error("visual ordering source has no mesh geometry");
  const point = p => Object.freeze({ x: p.x, y: p.y, z: p.z });
  const points=[];
  if(silhouette)source.traverseVisible(node=>{
    if(!node.isMesh)return;
    const positions=node.geometry.attributes.position;
    for(let i=0;i<positions.count;i++)points.push(point(new Vector3().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld)));
  });
  return Object.freeze({ kind: "volume", min: point(box.min), max: point(box.max), ...(silhouette?{points:Object.freeze(points)}:{}) });
}

export function translateVisualVolume(volume, origin) {
  const at = point => Object.freeze({ x: point.x + origin.x, y: point.y + origin.y, z: point.z + origin.z });
  return Object.freeze({ kind: "volume", min: at(volume.min), max: at(volume.max),
    ...(volume.points?{points:volume.points.map(at)}:{}) });
}
