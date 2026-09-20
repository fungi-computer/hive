import { polygonContains, prepareOrderingProxy } from "./plane-order.js";

/** Lay baked appearance onto declared surface polygons. The image selects
 * color/alpha; the surface supplies geometry. Usable for any ground decoration,
 * independent of its content name and of simulation state such as mowing.
 * The existing atlas remains immutable and owns all texture lifetime.
 */
export function projectSurfaceArt(record, surfaces, projection) {
  const quad = record.projected, style = record.terrainBatch;
  if (quad?.length !== 4 || style?.uvs?.length !== 8)
    throw new Error("surface art requires an axis-aligned baked image quad");
  const [a,b,c,d] = quad;
  if (a.x !== b.x || b.y !== c.y || c.x !== d.x || d.y !== a.y || !(c.x>a.x && c.y>a.y))
    throw new Error("surface art image quad must be clockwise from top left");
  return surfaces.map(({id,points}) => {
    if (points.length !== 4) throw new Error("surface art requires four surface corners");
    const projected = points.map(point=>projection.project(point));
    const uvs = projected.flatMap(point => {
      const u=(point.x-a.x)/(c.x-a.x), v=(point.y-a.y)/(c.y-a.y);
      if (u < -1e-6 || u > 1+1e-6 || v < -1e-6 || v > 1+1e-6)
        throw new Error("surface geometry escaped its baked image");
      return [style.uvs[0]+u*(style.uvs[6]-style.uvs[0]), style.uvs[1]+v*(style.uvs[3]-style.uvs[1])];
    });
    const screenBounds={left:Math.min(...projected.map(p=>p.x)),right:Math.max(...projected.map(p=>p.x)),
      top:Math.min(...projected.map(p=>p.y)),bottom:Math.max(...projected.map(p=>p.y))};
    const proxy=prepareOrderingProxy({id,planarCorners:points,footprint:points,screenBounds},projection);
    return Object.freeze({...record,part:`surface:${id}`,projected,screenBounds,
      planarCorners:points,orderGeometry:{kind:"face",points},surfaceOrder:1,
      terrainBatch:{...style,uvs},
      contains:point=>Boolean(proxy && polygonContains(proxy.polygon,point) && (record.contains?.(point)??true))});
  });
}
