import type { RegionInitial, RegionRecordChange, RegionRecordReader } from "./index.ts";

type SqlValue = string | number | null | ArrayBuffer | Uint8Array;
export type RecordSqlOwner = {
  sql: { exec<Row extends Record<string, SqlValue> = Record<string, SqlValue>>(statement: string, ...bindings: SqlValue[]): { toArray(): readonly Row[] } };
};
export type RecordLimits = {
  recordBytes: number;
  records: number;
  changedRecords: number;
  storageBytes: number;
};
export const RECORD_METADATA_BYTES = 16;
export const RECORD_FORMAT_VERSION = 1;
export const RECORD_PAGE_BYTES = 1024 * 1024;
export const RECORD_INITIAL_BYTES = 8 * 1024 * 1024;
export const RECORD_CHANGED_BYTES = 1024 * 1024;

const keyBytes = (key: string) => new TextEncoder().encode(key).byteLength;
export const recordSize = (key: string, bytes: Uint8Array | ArrayBuffer) => keyBytes(key) + bytes.byteLength + RECORD_METADATA_BYTES;
export function recordKey(key: unknown): string {
  if (typeof key !== "string" || key.length < 1 || key.length > 160 || key.includes("\0"))
    throw new Error("region-record-key");
  return key;
}
export function copyBytes(value: unknown, max: number): Uint8Array {
  const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : undefined;
  if (!bytes || bytes.byteLength > max) throw new Error("region-record-byte-limit");
  return new Uint8Array(bytes);
}
export function checkedChange(change: RegionRecordChange | undefined, limits: RecordLimits): RegionRecordChange {
  if (!change) return { puts: [], removes: [] };
  if (!Array.isArray(change.puts) || !Array.isArray(change.removes) || change.puts.length + change.removes.length > limits.changedRecords)
    throw new Error("region-record-change-limit");
  const keys = [...change.puts.map((record) => recordKey(record.key)), ...change.removes.map(recordKey)];
  if (new Set(keys).size !== keys.length) throw new Error("region-record-key-conflict");
  // Validate all lengths and aggregate changed bytes before copying any payload.
  const rawBytes = change.puts.map((record) => record.bytes instanceof Uint8Array || record.bytes instanceof ArrayBuffer ? record.bytes : undefined);
  if (rawBytes.some((bytes) => !bytes || bytes.byteLength > limits.recordBytes)) throw new Error("region-record-byte-limit");
  const total = keys.slice(0, change.puts.length).reduce((sum, key, index) => sum + keyBytes(key) + rawBytes[index]!.byteLength + RECORD_METADATA_BYTES, 0);
  if (total > Math.min(limits.storageBytes, RECORD_CHANGED_BYTES)) throw new Error("region-record-change-bytes");
  return { puts: change.puts.map((record, index) => ({ key: keys[index], bytes: copyBytes(rawBytes[index]!, limits.recordBytes) })), removes: change.removes.map(recordKey) };
}
export function checkedInitial<State>(initial: RegionInitial<State>, limits: RecordLimits): RegionInitial<State> {
  if (!initial || typeof initial !== "object" || !Array.isArray(initial.records)) throw new Error("region-initial-records");
  if (initial.records.length > limits.records) throw new Error("region-record-capacity");
  const keys = initial.records.map((record) => recordKey(record.key));
  if (new Set(keys).size !== keys.length) throw new Error("region-record-key-conflict");
  const rawBytes = initial.records.map((record) => record.bytes instanceof Uint8Array || record.bytes instanceof ArrayBuffer ? record.bytes : undefined);
  if (rawBytes.some((bytes) => !bytes || bytes.byteLength > limits.recordBytes)) throw new Error("region-record-byte-limit");
  const total = keys.reduce((sum, key, index) => sum + keyBytes(key) + rawBytes[index]!.byteLength + RECORD_METADATA_BYTES, 0);
  if (total > Math.min(limits.storageBytes, RECORD_INITIAL_BYTES)) throw new Error("region-initial-record-bytes");
  return { state: initial.state, records: initial.records.map((_, index) => ({ key: keys[index], bytes: copyBytes(rawBytes[index]!, limits.recordBytes) })), };
}
export function createRecordReader(owner: RecordSqlOwner, maxRecordBytes: number): RegionRecordReader & { close(): void } {
  let active = true;
  return {
    read(key) {
      if (!active) throw new Error("region-record-reader-closed");
      const checked = recordKey(key);
      const found = owner.sql.exec<{ record_bytes: SqlValue }>("SELECT record_bytes FROM hive_region_records WHERE format_version=? AND record_key=?", RECORD_FORMAT_VERSION, checked).toArray()[0];
      if (!found) return undefined;
      return copyBytes(found.record_bytes, maxRecordBytes);
    },
    close() { active = false; },
  };
}
// Leave room for the format binding under the host's conservative 100-variable
// statement budget. The surrounding Region transaction owns every batch.
const KEY_BATCH_SIZE = 99;
const PUT_BATCH_SIZE = 33;
const placeholders = (count: number) => Array(count).fill("?").join(",");

export function existingRecordSizes(owner: RecordSqlOwner, keys: readonly string[]): Map<string, number> {
  const sizes = new Map<string, number>();
  for (let offset = 0; offset < keys.length; offset += KEY_BATCH_SIZE) {
    const batch = keys.slice(offset, offset + KEY_BATCH_SIZE);
    const rows = owner.sql.exec<{ record_key: string; size: number }>(
      `SELECT record_key,length(CAST(record_key AS BLOB))+length(record_bytes)+${RECORD_METADATA_BYTES} AS size FROM hive_region_records WHERE format_version=? AND record_key IN (${placeholders(batch.length)})`,
      RECORD_FORMAT_VERSION, ...batch,
    ).toArray();
    for (const row of rows) sizes.set(row.record_key, row.size);
  }
  return sizes;
}
export function applyRecords(owner: RecordSqlOwner, change: RegionRecordChange): void {
  for (let offset = 0; offset < change.removes.length; offset += KEY_BATCH_SIZE) {
    const batch = change.removes.slice(offset, offset + KEY_BATCH_SIZE);
    owner.sql.exec(`DELETE FROM hive_region_records WHERE format_version=? AND record_key IN (${placeholders(batch.length)})`, RECORD_FORMAT_VERSION, ...batch);
  }
  for (let offset = 0; offset < change.puts.length; offset += PUT_BATCH_SIZE) {
    const batch = change.puts.slice(offset, offset + PUT_BATCH_SIZE);
    // UPDATE preserves the existing row; REPLACE would delete then insert it.
    owner.sql.exec(`INSERT INTO hive_region_records (format_version,record_key,record_bytes) VALUES ${batch.map(() => "(?,?,?)").join(",")} ON CONFLICT(record_key) DO UPDATE SET format_version=excluded.format_version,record_bytes=excluded.record_bytes`,
      ...batch.flatMap(record => [RECORD_FORMAT_VERSION, record.key, record.bytes]));
  }
}
export function readRecordPage(owner: RecordSqlOwner, expectedRevision: number, afterKey: string, limit: number, maxRecordBytes: number) {
  const metadata = owner.sql.exec<{ record_key: string; value_bytes: number }>("SELECT record_key,length(record_bytes) AS value_bytes FROM hive_region_records WHERE format_version=? AND record_key>? ORDER BY record_key LIMIT ?", RECORD_FORMAT_VERSION, afterKey, Math.min(limit, 128)).toArray();
  const admitted: typeof metadata[number][] = [];
  let bytes = 0;
  for (const row of metadata) {
    recordKey(row.record_key);
    if (!Number.isSafeInteger(row.value_bytes) || row.value_bytes < 0 || row.value_bytes > maxRecordBytes)
      throw new Error("region-record-byte-limit");
    const size = keyBytes(row.record_key) + row.value_bytes + RECORD_METADATA_BYTES;
    if (size > RECORD_PAGE_BYTES) throw new Error("region-record-page-budget");
    if (admitted.length > 0 && bytes + size > RECORD_PAGE_BYTES) break;
    bytes += size;
    admitted.push(row);
  }
  const payloads = new Map<string, SqlValue>();
  for (let offset = 0; offset < admitted.length; offset += KEY_BATCH_SIZE) {
    const batch = admitted.slice(offset, offset + KEY_BATCH_SIZE);
    const rows = owner.sql.exec<{ record_key: string; record_bytes: SqlValue }>(
      `SELECT record_key,record_bytes FROM hive_region_records WHERE format_version=? AND record_key IN (${placeholders(batch.length)})`,
      RECORD_FORMAT_VERSION, ...batch.map(row => row.record_key),
    ).toArray();
    for (const row of rows) payloads.set(row.record_key, row.record_bytes);
  }
  const records = admitted.map(({ record_key }) => {
    if (!payloads.has(record_key)) throw new Error("region-record-frontier");
    return { key: record_key, bytes: copyBytes(payloads.get(record_key), maxRecordBytes) };
  });
  const pageLimit = Math.min(limit, 128);
  const hasMore = admitted.length < metadata.length || metadata.length === pageLimit;
  return { revision: expectedRevision, records, nextKey: hasMore ? admitted.at(-1)?.record_key : undefined };
}
