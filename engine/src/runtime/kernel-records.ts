/** Opaque bounded capture/restore transport for the native record bundle. */

export interface NativeRecordHandle {
  free(): void;
  keys(): string;
  /** Returns an owned copy detached from WASM memory. */
  read(key: string): Uint8Array;
  insert(key: string, bytes: Uint8Array): void;
}

export interface NativeRecordBinding {
  capture_records(): NativeRecordHandle;
  restore_records(handle: NativeRecordHandle): void;
}

export interface KernelEntitySnapshot {
  readonly format: "hive-kernel";
  readonly version: 7;
  readonly revision: number;
  readonly time: number;
  readonly scene: {
    readonly format: "hive-game";
    readonly version: 1;
    readonly game: string;
    readonly components: readonly unknown[];
    readonly initial: readonly unknown[];
  };
  readonly [key: string]: unknown;
}

export interface KernelRecordSnapshot {
  readonly format: "hive-kernel-records";
  readonly version: 1;
  readonly revision: number;
  readonly time: number;
  readonly records: readonly { readonly key: string; readonly bytes: Uint8Array }[];
}

const RECORD_BYTES = 256 * 1024;
const ENTITY_BYTES = 8 * 1024 * 1024;
const TOTAL_BYTES = 9 * 1024 * 1024;
const MAX_RECORDS = 40;
const MAX_KEY_BYTES = 80;
const ENTITY_PREFIX = "kernel/entities/";
const ENVIRONMENT_KEYS = [
  "kernel/environment/definition",
  "kernel/environment/header",
  "kernel/environment/terrain",
  "kernel/environment/water",
  "kernel/environment/structures",
] as const;

function isSafeRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isFiniteTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function keyAllowed(key: string): boolean {
  if (key.length === 0 || key.length > MAX_KEY_BYTES || !/^[\x20-\x7e]+$/.test(key)) return false;
  if (key.startsWith(ENTITY_PREFIX)) {
    const suffix = key.slice(ENTITY_PREFIX.length);
    return /^\d{4}$/.test(suffix) && Number(suffix) < 32;
  }
  return key === "kernel/header" || (ENVIRONMENT_KEYS as readonly string[]).includes(key);
}
function validateKeyList(keys: readonly unknown[]): asserts keys is readonly string[] {
  if (keys.length > MAX_RECORDS) throw new Error("record count exceeds bound");
  const seen = new Set<string>();
  for (const key of keys) {
    if (typeof key !== "string" || !keyAllowed(key) || seen.has(key)) throw new Error("invalid native record key");
    seen.add(key);
  }
  if (!seen.has("kernel/header")) throw new Error("missing native record header");
  const environment = ENVIRONMENT_KEYS.some(key => seen.has(key));
  if (environment !== ENVIRONMENT_KEYS.every(key => seen.has(key))) throw new Error("environment record set is incomplete");
}
function decodeEntities(records: readonly { readonly key: string; readonly bytes: Uint8Array }[]): { text: string; parsed: KernelEntitySnapshot } {
  const chunks = records.filter(({ key }) => key.startsWith(ENTITY_PREFIX)).sort((a, b) => Number(a.key.slice(-4)) - Number(b.key.slice(-4)));
  if (chunks.length === 0 || chunks.some(({ key }, index) => key !== `${ENTITY_PREFIX}${String(index).padStart(4, "0")}`)) throw new Error("entity chunks are incomplete");
  const total = chunks.reduce((sum, record) => sum + record.bytes.byteLength, 0);
  if (total > ENTITY_BYTES) throw new Error("entity records exceed 8MiB");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk.bytes, offset); offset += chunk.bytes.byteLength; }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("entity records are not JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("entity records are not an object");
  const value = parsed as Partial<KernelEntitySnapshot>;
  if (value.format !== "hive-kernel" || value.version !== 7 || !isSafeRevision(value.revision) || !isFiniteTime(value.time) || !value.scene || value.scene.format !== "hive-game" || value.scene.version !== 1 || typeof value.scene.game !== "string" || !Array.isArray(value.scene.components) || !Array.isArray(value.scene.initial)) throw new Error("unsupported kernel entity snapshot");
  return { text, parsed: value as KernelEntitySnapshot };
}

function preflightRecords(records: readonly { readonly key: string; readonly bytes: Uint8Array }[]): KernelEntitySnapshot {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) throw new Error("record count exceeds bound");
  const seen = new Set<string>();
  let total = 0;
  for (const record of records) {
    if (!record || typeof record.key !== "string" || !keyAllowed(record.key) || seen.has(record.key) || !(record.bytes instanceof Uint8Array) || record.bytes.byteLength > RECORD_BYTES || (record.key === "kernel/header" && record.bytes.byteLength > 65_568) || (record.key === "kernel/environment/header" && record.bytes.byteLength > 65_568) || (record.key === "kernel/environment/definition" && record.bytes.byteLength > 128 * 1024)) throw new Error("invalid kernel record");
    seen.add(record.key); total += record.bytes.byteLength;
  }
  if (total > TOTAL_BYTES) throw new Error("kernel record bytes exceed 9MiB");
  if (!seen.has("kernel/header")) throw new Error("missing native record header");
  const environment = ENVIRONMENT_KEYS.some(key => seen.has(key));
  if (environment !== ENVIRONMENT_KEYS.every(key => seen.has(key))) throw new Error("environment record set is incomplete");
  const definition = records.find(record => record.key === ENVIRONMENT_KEYS[0]);
  if (definition) new TextDecoder("utf-8", { fatal: true }).decode(definition.bytes);
  const entities = decodeEntities(records);
  return entities.parsed;
}
function validateSnapshot(snapshot: KernelRecordSnapshot): { entities: KernelEntitySnapshot } {
  if (snapshot.format !== "hive-kernel-records" || snapshot.version !== 1 || !isSafeRevision(snapshot.revision) || !isFiniteTime(snapshot.time) || !Array.isArray(snapshot.records)) throw new Error("unsupported kernel record snapshot");
  const entities = preflightRecords(snapshot.records);
  if (entities.revision !== snapshot.revision || entities.time !== snapshot.time) throw new Error("record metadata does not match entity snapshot");
  return { entities };
}

export function captureKernelRecords(binding: NativeRecordBinding): KernelRecordSnapshot {
  const handle = binding.capture_records();
  try {
    let keys: unknown;
    try { keys = JSON.parse(handle.keys()); } catch { throw new Error("native record keys are not JSON"); }
    if (!Array.isArray(keys)) throw new Error("native record keys are not an array");
    validateKeyList(keys);
    const records = keys.map(key => ({ key, bytes: handle.read(key) }));
    const provisional = { format: "hive-kernel-records" as const, version: 1 as const, revision: 0, time: 0, records };
    const entities = preflightRecords(records);
    const snapshot = { ...provisional, revision: entities.revision, time: entities.time };
    return snapshot;
  } finally { handle.free(); }
}

export function readKernelEntities(snapshot: KernelRecordSnapshot): KernelEntitySnapshot {
  return validateSnapshot(snapshot).entities;
}

export function restoreKernelRecords(binding: NativeRecordBinding, makeHandle: () => NativeRecordHandle, snapshot: KernelRecordSnapshot): void {
  validateSnapshot(snapshot);
  const handle = makeHandle();
  try {
    for (const record of snapshot.records) handle.insert(record.key, record.bytes);
  } catch (error) { handle.free(); throw error; }
  binding.restore_records(handle);
}
