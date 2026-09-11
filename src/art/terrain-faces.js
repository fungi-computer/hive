/** Shared visible exterior faces for the terrain bake and pointer picking. */
export function* terrainFaces(surfaces, verticalMetres) {
  const columns = new Map(surfaces.map(surface => [`${surface.cell[0]},${surface.cell[2]}`,surface]));
  for (const surface of surfaces) {
    const {cell: [x, y, z]} = surface;
    const top = (y + 0.5) * verticalMetres;
    const left = x - 0.5, right = x + 0.5, back = z - 0.5, front = z + 0.5;
    yield { surface, top: true, vertices:
      [[left,top,back],[left,top,front],[right,top,front],[right,top,back]] };
    for (const [dx, dz, edge] of [
      [-1,0,[[left,back],[left,front]]], [1,0,[[right,front],[right,back]]],
      [0,-1,[[right,back],[left,back]]], [0,1,[[left,front],[right,front]]],
    ]) {
      const neighbor = columns.get(`${x+dx},${z+dz}`);
      // The outer skirt is visual framing, not a claim about unseen geology.
      const bottom = neighbor ? (neighbor.cell[1]+0.5)*verticalMetres : top-verticalMetres;
      if (bottom >= top) continue;
      yield { surface, top: false, vertices:
        [[edge[0][0],top,edge[0][1]],[edge[0][0],bottom,edge[0][1]],
         [edge[1][0],bottom,edge[1][1]],[edge[1][0],top,edge[1][1]]] };
    }
  }
}
