import { SEARCH_RECORD_PREFIX, isSearchRecordKey, restoreSearchRecords } from "./search-records";
/** Opaque bounded capture/restore transport for the native record bundle. */

export interface NativeRecordHandle {
  free(): void;
  keys(): string;
  manifest(): string;
  /** Returns an owned copy detached from WASM memory. */
  read(key: string): Uint8Array;
  insert(key: string, bytes: Uint8Array): void;
}

export interface NativeRecordBinding {
  capture_records(since?: number): NativeRecordHandle;
  restore_records(handle: NativeRecordHandle): number;
  accept_records(sequence: number): void;
}

export interface KernelEntitySnapshot {
  readonly format: "hive-kernel";
  readonly version: 21;
  readonly revision: number;
  readonly time: number;
  readonly scene: {
    readonly format: "hive-game";
    readonly version: 3;
    readonly game: string;
    readonly components: readonly unknown[];
    readonly initial: readonly unknown[];
    readonly materialCatalog: readonly unknown[];
  };
  readonly [key: string]: unknown;
}

export interface KernelRecordSnapshot {
  readonly format: "hive-kernel-records";
  readonly version: 4;
  readonly revision: number;
  readonly time: number;
  readonly records: readonly { readonly key: string; readonly bytes: Uint8Array }[];
}

/** Metadata only for one committed resident capture; rows remain in Region SQL. */
export interface KernelRecordFrontier {
  readonly format: "hive-kernel-records";
  readonly version: 4;
  readonly revision: number;
  readonly time: number;
}

export interface KernelRecordCaptureResult {
  /** Capture metadata; the full row inventory is reconstructed only on hydration/export. */
  readonly snapshot: KernelRecordFrontier;
  readonly changes: {
    readonly puts: KernelRecordSnapshot["records"];
    readonly removes: readonly string[];
  };
}

const RECORD_BYTES = 256 * 1024;
const ENTITY_BYTES = 8 * 1024 * 1024;
const TOTAL_BYTES = 9 * 1024 * 1024;
/** Maximum records in one native snapshot, shared by capture and persistence callers. */
export const MAX_KERNEL_RECORDS = 65_536;
const MAX_KEY_BYTES = 160;
const ENTITY_PREFIX = "kernel/state/";
const STATE_FAMILIES = { entities: ["scene", "initial", "id"], routes: ["routes", "entity"], direct: ["direct", "entity"], contacts: ["projectile_contacts", "projectile_id"], parties: ["party_bindings", "bindingId"], attempts: ["work_attempts", "key", "task"] } as const;
const ATMOSPHERE_PREFIX = "kernel/atmosphere/";
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
  if (key.startsWith(SEARCH_RECORD_PREFIX)) return isSearchRecordKey(key);
  if (key.startsWith(ENTITY_PREFIX)) {
    const suffix = key.slice(ENTITY_PREFIX.length);
    if (suffix === "root" || suffix === "definition") return true;
    if (/^motion\/[a-f0-9]{1,64}$/.test(suffix)) return true;
    if (/^paths\/[A-Za-z0-9._:-]{1,128}\/[pt]\/\d{4}$/.test(suffix)) return Number(suffix.slice(-4)) < 64;
    const [family, id, extra] = suffix.split("/");
    return Object.hasOwn(STATE_FAMILIES, family) && !extra && /^[A-Za-z0-9._:-]{1,128}$/.test(id ?? "");
  }
  if (key.startsWith(ATMOSPHERE_PREFIX)) {
    const suffix = key.slice(ATMOSPHERE_PREFIX.length);
    return suffix === "header" || suffix === "emissions" || /^tiles\/(?:0|-?[1-9]\d*),(?:0|-?[1-9]\d*),(?:0|-?[1-9]\d*)$/.test(suffix);
  }
  return key === "kernel/header" || (ENVIRONMENT_KEYS as readonly string[]).includes(key);
}
function validateKeyList(keys: readonly unknown[]): asserts keys is readonly string[] {
  if (keys.length > MAX_KERNEL_RECORDS) throw new Error("record count exceeds bound");
  const seen = new Set<string>();
  for (const key of keys) {
    if (typeof key !== "string" || !keyAllowed(key) || seen.has(key)) throw new Error("invalid native record key");
    seen.add(key);
  }
  if (!seen.has("kernel/header")) throw new Error("missing native record header");
  if (!seen.has(`${ENTITY_PREFIX}root`) || !seen.has(`${ENTITY_PREFIX}definition`)) throw new Error("missing state root or definition");
  const environment = ENVIRONMENT_KEYS.some(key => seen.has(key));
  if (environment !== ENVIRONMENT_KEYS.every(key => seen.has(key))) throw new Error("environment record set is incomplete");
  const airKeys = [...seen].filter(key => key.startsWith(ATMOSPHERE_PREFIX)).sort();
  if (airKeys.length && (!environment || !seen.has(`${ATMOSPHERE_PREFIX}header`) || !seen.has(`${ATMOSPHERE_PREFIX}emissions`)))
    throw new Error("atmosphere record set is incomplete");
}
/** Validates a SQL-owned recovery inventory before native restore. Keys are printable ASCII,
 * so SQLite BINARY order and JavaScript string order agree for this domain. */
export function validateKernelRecordInventory(keys: readonly unknown[]): asserts keys is readonly string[] {
  validateKeyList(keys);
}
function decodeEntities(records: readonly { readonly key: string; readonly bytes: Uint8Array }[]): KernelEntitySnapshot {
  const stateRecords = records.filter(({ key }) => key.startsWith(ENTITY_PREFIX));
  if (stateRecords.reduce((sum, record) => sum + record.bytes.byteLength, 0) > ENTITY_BYTES) throw new Error("entity records exceed 8MiB");
  const root = stateRecords.find(({ key }) => key === `${ENTITY_PREFIX}root`);
  if (!root) throw new Error("missing state root");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parsed = JSON.parse(decoder.decode(root.bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid state root");
  if (parsed.format !== "hive-kernel" || parsed.version !== 21) throw new Error("unsupported kernel entity snapshot");
  const definition = stateRecords.find(({ key }) => key === `${ENTITY_PREFIX}definition`);
  if (!definition || parsed.scene !== null) throw new Error("missing or inline state definition");
  parsed.scene = JSON.parse(decoder.decode(definition.bytes));
  if (!Array.isArray(parsed.jobs) || parsed.jobs.length || !Array.isArray(parsed.tasks) || parsed.tasks.length) throw new Error("inline private facts");
  const positions = new Map<string, unknown>();
  for (const record of stateRecords.filter(({ key }) => key.startsWith(`${ENTITY_PREFIX}motion/`))) {
    const rows = JSON.parse(decoder.decode(record.bytes));
    if (!rows || typeof rows !== "object" || Array.isArray(rows)) throw new Error("invalid motion cohort");
    for (const [id, value] of Object.entries(rows)) {
      if (positions.has(id)) throw new Error("duplicate motion member");
      positions.set(id, value);
    }
  }
  const geometry = new Map(stateRecords.filter(({ key }) => key.startsWith(`${ENTITY_PREFIX}paths/`)).map(record => [record.key, record]));
  for (const [family, path] of Object.entries(STATE_FAMILIES)) {
    const rows = family === "entities" ? parsed.scene?.initial : parsed[path[0]];
    if (!Array.isArray(rows) || rows.length) throw new Error("state root contains inline rows");
    const prefix = `${ENTITY_PREFIX}${family}/`;
    const selected = stateRecords.filter(({ key }) => key.startsWith(prefix)).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    for (const record of selected) {
      const row = JSON.parse(decoder.decode(record.bytes));
      const id = family === "attempts" ? row?.key?.task : row?.[path[path.length - 1]];
      if (id !== record.key.slice(prefix.length)) throw new Error("state record identity mismatch");
      if (family === "entities") {
        for (const [field, collection] of [["job", "jobs"], ["task", "tasks"]]) {
          if (Object.hasOwn(row, field)) { parsed[collection].push({ id, [field]: row[field] }); delete row[field]; }
        }
        if (positions.has(id)) {
          if (!row.components?.["hive.body"] || Object.hasOwn(row.components, "hive.position")) throw new Error("invalid motion ownership");
          row.components["hive.position"] = positions.get(id); positions.delete(id);
        }
      } else if (family === "routes") {
        for (const [field, kind] of [["path", "p"], ["terrain_path", "t"]]) {
          const count = row[`${field}_count`]; delete row[`${field}_count`];
          if (count === null && field === "terrain_path" && row[field] === null) continue;
          if (!Number.isInteger(count) || count < 0 || count > 8192 || !Array.isArray(row[field]) || row[field].length) throw new Error("invalid route geometry count");
          for (let page = 0; page < Math.ceil(count / 128); page++) {
            const key = `${ENTITY_PREFIX}paths/${id}/${kind}/${String(page).padStart(4, "0")}`;
            const record = geometry.get(key);
            if (!record) throw new Error("missing route geometry page");
            const points = JSON.parse(decoder.decode(record.bytes));
            if (!Array.isArray(points) || points.length !== Math.min(128, count - page * 128)) throw new Error("invalid route page");
            row[field].push(...points); geometry.delete(key);
          }
        }
      }
      rows.push(row);
    }
  }
  if (positions.size || geometry.size) throw new Error("orphan motion or route geometry");
  restoreSearchRecords(parsed, stateRecords);
  const value = parsed as Partial<KernelEntitySnapshot>;
  if (
    value.format !== "hive-kernel" ||
    value.version !== 21 ||
    !isSafeRevision(value.revision) ||
    !isFiniteTime(value.time) ||
    !value.scene ||
    value.scene.format !== "hive-game" ||
    value.scene.version !== 3 ||
    typeof value.scene.game !== "string" ||
    !Array.isArray(value.scene.components) ||
    !Array.isArray(value.scene.initial) ||
    !Array.isArray(value.scene.materialCatalog)
  ) throw new Error("unsupported kernel entity snapshot");
  return value as KernelEntitySnapshot;
}

function validateRecordEnvelope(records: readonly { readonly key: string; readonly bytes: Uint8Array }[]): void {
  if (!Array.isArray(records) || records.length > MAX_KERNEL_RECORDS) throw new Error("record count exceeds bound");
  const seen = new Set<string>();
  let total = 0;
  for (const record of records) {
    if (!record || typeof record.key !== "string" || !keyAllowed(record.key) || seen.has(record.key) || !(record.bytes instanceof Uint8Array) || record.bytes.byteLength > RECORD_BYTES || (record.key === "kernel/header" && record.bytes.byteLength > 65_568) || (record.key === "kernel/environment/header" && record.bytes.byteLength > 65_568) || (record.key === "kernel/environment/definition" && record.bytes.byteLength > 128 * 1024)) throw new Error("invalid kernel record");
    seen.add(record.key); total += record.bytes.byteLength;
  }
  if (total > TOTAL_BYTES) throw new Error("kernel record bytes exceed 9MiB");
  if (!seen.has("kernel/header")) throw new Error("missing native record header");
  if (!seen.has(`${ENTITY_PREFIX}root`) || !seen.has(`${ENTITY_PREFIX}definition`)) throw new Error("missing state root or definition");
  const environment = ENVIRONMENT_KEYS.some(key => seen.has(key));
  if (environment !== ENVIRONMENT_KEYS.every(key => seen.has(key))) throw new Error("environment record set is incomplete");
  const airKeys = [...seen].filter(key => key.startsWith(ATMOSPHERE_PREFIX)).sort();
  if (airKeys.length && (!environment || !seen.has(`${ATMOSPHERE_PREFIX}header`) || !seen.has(`${ATMOSPHERE_PREFIX}emissions`)))
    throw new Error("atmosphere record set is incomplete");
}
function preflightRecords(records: readonly { readonly key: string; readonly bytes: Uint8Array }[]): KernelEntitySnapshot {
  validateRecordEnvelope(records);
  const definition = records.find(record => record.key === ENVIRONMENT_KEYS[0]);
  if (definition) new TextDecoder("utf-8", { fatal: true }).decode(definition.bytes);
  return decodeEntities(records);
}

/** One resident's disposable capture cursor. Only native-produced records use
 * this path. External exports/restores still undergo complete preflight and
 * native relational validation. The Region transaction commits these changes
 * with its receipt; capture never acknowledges or commits simulation effects. */
export class KernelRecordCapture {
  private sequence = 0;

  constructor(private readonly binding: NativeRecordBinding) {}

  restored(snapshot: KernelRecordSnapshot, sequence: number): void {
    if (!Number.isInteger(sequence) || sequence <= 0 || sequence > 0xffffffff) throw new Error("invalid restored capture sequence");
    this.sequence = sequence;
    if (snapshot.format !== "hive-kernel-records" || snapshot.version !== 4 ||
        !isSafeRevision(snapshot.revision) || !isFiniteTime(snapshot.time))
      throw new Error("invalid restored capture frontier");
  }

  acceptCapture(): void { this.binding.accept_records(this.sequence); }

  capture(): KernelRecordCaptureResult {
    const handle = this.binding.capture_records(this.sequence);
    try {
      const manifest = JSON.parse(handle.manifest()) as {
        sequence: number; base: number | null; revision: number; time: number; removes: string[];
      };
      if (!manifest || !Number.isInteger(manifest.sequence) || manifest.sequence <= 0 || manifest.sequence > 0xffffffff ||
          manifest.sequence !== this.sequence + 1 ||
          (manifest.base !== null && manifest.base !== this.sequence) ||
          !isSafeRevision(manifest.revision) || !isFiniteTime(manifest.time) ||
          !Array.isArray(manifest.removes) || manifest.removes.length > MAX_KERNEL_RECORDS)
        throw new Error("invalid native capture manifest");
      const changedKeys: unknown = JSON.parse(handle.keys());
      if (!Array.isArray(changedKeys) || changedKeys.length > MAX_KERNEL_RECORDS ||
          changedKeys.some(key => typeof key !== "string" || !keyAllowed(key)))
        throw new Error("invalid native changed records");
      for (let index = 1; index < changedKeys.length; index++)
        if (changedKeys[index - 1] >= changedKeys[index]) throw new Error("native changed records are not canonical");
      const putKeys = new Set(changedKeys as string[]);
      const removeSet = new Set<string>();
      for (let index = 0; index < manifest.removes.length; index++) {
        const key = manifest.removes[index];
        if (!keyAllowed(key) || removeSet.has(key) || putKeys.has(key) ||
            (index > 0 && manifest.removes[index - 1] >= key))
          throw new Error("invalid native removed records");
        removeSet.add(key);
      }
      const puts = changedKeys.map(key => ({ key: key as string, bytes: handle.read(key) }));
      let changedBytes = 0;
      for (const record of puts) {
        if (!(record.bytes instanceof Uint8Array) || record.bytes.byteLength > RECORD_BYTES ||
            (record.key === "kernel/header" && record.bytes.byteLength > 65_568) ||
            (record.key === "kernel/environment/header" && record.bytes.byteLength > 65_568) ||
            (record.key === "kernel/environment/definition" && record.bytes.byteLength > 128 * 1024))
          throw new Error("invalid native changed record bytes");
        changedBytes += record.bytes.byteLength;
      }
      if (changedBytes > TOTAL_BYTES) throw new Error("changed kernel record bytes exceed 9MiB");
      if (manifest.base === null) validateKeyList(changedKeys);
      const snapshot: KernelRecordFrontier = {
        format: "hive-kernel-records", version: 4, revision: manifest.revision, time: manifest.time,
      };
      this.sequence = manifest.sequence;
      return { snapshot, changes: { puts, removes: manifest.removes } };
    } finally { handle.free(); }
  }
}
function validateSnapshot(snapshot: KernelRecordSnapshot): { entities: KernelEntitySnapshot } {
  if (snapshot.format !== "hive-kernel-records" || snapshot.version !== 4 || !isSafeRevision(snapshot.revision) || !isFiniteTime(snapshot.time) || !Array.isArray(snapshot.records)) throw new Error("unsupported kernel record snapshot");
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
    const provisional = { format: "hive-kernel-records" as const, version: 4 as const, revision: 0, time: 0, records };
    const entities = preflightRecords(records);
    const snapshot = { ...provisional, revision: entities.revision, time: entities.time };
    return snapshot;
  } finally { handle.free(); }
}

export function readKernelEntities(snapshot: KernelRecordSnapshot): KernelEntitySnapshot {
  return validateSnapshot(snapshot).entities;
}

export function restoreKernelRecords(binding: NativeRecordBinding, makeHandle: () => NativeRecordHandle, snapshot: KernelRecordSnapshot): number {
  validateSnapshot(snapshot);
  const handle = makeHandle();
  try {
    for (const record of snapshot.records) handle.insert(record.key, record.bytes);
  } catch (error) { handle.free(); throw error; }
  return binding.restore_records(handle);
}
