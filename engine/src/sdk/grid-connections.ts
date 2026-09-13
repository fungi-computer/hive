export type GridConnection = {
  readonly id: string;
  readonly cell: readonly [number, number, number];
};

/** Visual adjacency: east/south/west/north bits, isolated from physical support. */
export function gridConnectionMasks(entries: readonly GridConnection[]): ReadonlyMap<string, number> {
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const occupied = new Set(entries.map(({ cell: [x, y, z] }) => key(x, y, z)));
  return new Map(entries.map(({ id, cell: [x, y, z] }) => [id,
    (occupied.has(key(x + 1, y, z)) ? 1 : 0)
    | (occupied.has(key(x, y, z + 1)) ? 2 : 0)
    | (occupied.has(key(x - 1, y, z)) ? 4 : 0)
    | (occupied.has(key(x, y, z - 1)) ? 8 : 0),
  ]));
}
