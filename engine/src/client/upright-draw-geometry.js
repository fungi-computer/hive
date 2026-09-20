import { hull } from "./plane-order.js";

/** A moving baked figure is an upright card through its feet, with the actual
 * projected source silhouette. This is the point/line sprite contract in world
 * geometry: an ear's model-space width is not an invisible collision box.
 * The ordinary face comparator handles the result, with no actor-name branch.
 */
export function uprightDrawGeometry(worldVolume, feet, projection) {
  if(!worldVolume.points?.length)throw new Error("upright visual requires source geometry");
  const silhouette=hull(worldVolume.points.map(point=>projection.project(point)));
  const normal={x:projection.direction.x,y:0,z:projection.direction.z};
  const constant=normal.x*feet.x+normal.z*feet.z;
  const points=silhouette.map(pixel=>{
    const {origin,direction}=projection.ray(pixel);
    const t=(constant-normal.x*origin.x-normal.z*origin.z)/(normal.x*direction.x+normal.z*direction.z);
    return {x:origin.x+t*direction.x,y:origin.y+t*direction.y,z:origin.z+t*direction.z};
  });
  return {kind:"face",points};
}
