export interface ChunkAddress {
  readonly x: number;
  readonly z: number;
}
export interface ChunkResidencyOptions {
  readonly chunkSize?: number;
  readonly radius?: number;
}
export function chunkCoordinate(cell: number, chunkSize: number): number {
  if (
    !Number.isSafeInteger(cell) ||
    !Number.isSafeInteger(chunkSize) ||
    chunkSize < 1
  )
    throw new Error("invalid chunk coordinate");
  return Math.floor(cell / chunkSize);
}
export function chunkKey(address: ChunkAddress): string {
  return `${address.x},${address.z}`;
}
export function residentChunks(
  center: readonly [number, number],
  options: ChunkResidencyOptions = {},
): readonly ChunkAddress[] {
  const size = options.chunkSize ?? 16,
    radius = options.radius ?? 2;
  if (
    !Number.isSafeInteger(size) ||
    size < 1 ||
    !Number.isSafeInteger(radius) ||
    radius < 0 ||
    radius > 8 ||
    !center.every(Number.isSafeInteger)
  )
    throw new Error("invalid chunk residency");
  const cx = chunkCoordinate(center[0], size),
    cz = chunkCoordinate(center[1], size),
    result: ChunkAddress[] = [];
  const anchorX = Math.floor(cx / 4) * 4, anchorZ = Math.floor(cz / 4) * 4;
  for (let x = anchorX; x < anchorX + 4; x++)
    for (let z = anchorZ; z < anchorZ + 4; z++)
      result.push(Object.freeze({ x, z }));
  return Object.freeze(result);
}
export class TerrainChunkResidency<T> {
  private chunks = new Map<
    string,
    { address: ChunkAddress; revision: number; value: T }
  >();
  constructor(private readonly options: Required<ChunkResidencyOptions>) {}
  update(
    center: readonly [number, number],
    load: (address: ChunkAddress) => { revision: number; value: T },
  ) {
    const desired = new Map(
      residentChunks(center, this.options).map(
        (address) => [chunkKey(address), address] as const,
      ),
    );
    const entered: ChunkAddress[] = [];
    for (const [key, address] of desired)
      if (!this.chunks.has(key)) {
        const loaded = load(address);
        if (!Number.isSafeInteger(loaded.revision) || loaded.revision < 0)
          throw new Error("invalid chunk revision");
        this.chunks.set(key, { address, ...loaded });
        entered.push(address);
      }
    const evicted: ChunkAddress[] = [];
    for (const [key, chunk] of this.chunks)
      if (!desired.has(key)) {
        this.chunks.delete(key);
        evicted.push(chunk.address);
      }
    return { entered: Object.freeze(entered), evicted: Object.freeze(evicted) };
  }
  apply(address: ChunkAddress, revision: number, value: T): boolean {
    const current = this.chunks.get(chunkKey(address));
    if (
      !current ||
      !Number.isSafeInteger(revision) ||
      revision < current.revision
    )
      return false;
    this.chunks.set(chunkKey(address), { address, revision, value });
    return true;
  }
  values(): readonly T[] {
    return Object.freeze([...this.chunks.values()].map((chunk) => chunk.value));
  }
  keys(): readonly string[] {
    return Object.freeze([...this.chunks.keys()].sort());
  }
}
