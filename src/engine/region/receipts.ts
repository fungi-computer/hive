import { decode, encode } from "./codec.ts";
import type { RegionReceipt, RegionSqliteOwner } from "./index.ts";

const bytes = (wire: string) => new TextEncoder().encode(wire).byteLength;
const FORMAT = 1;

/** Bounded exact results plus a durable epoch fence. A missing result from an
 * older epoch is never new intake. Epoch is part of command identity, and the
 * caller must preserve it with the ID across every transport retry. */
export function createReceiptOwner(owner: RegionSqliteOwner, capacity: number, resultBytes: number) {
  function frontier() {
    const row = owner.sql.exec<{ format_version: number; next_sequence: number }>(
      "SELECT format_version,next_sequence FROM hive_region_replay WHERE singleton=1",
    ).toArray()[0];
    if (!row || row.format_version !== FORMAT || !Number.isSafeInteger(row.next_sequence) || row.next_sequence < 0)
      throw new Error("region-replay-frontier");
    return { sequence: row.next_sequence, epoch: Math.floor(row.next_sequence / capacity) };
  }
  return {
    initialize(hasRegion: boolean) {
      const hasReplay = owner.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='hive_region_replay'").toArray().length > 0;
      if (hasRegion !== hasReplay) throw new Error("region-replay-format");
      owner.sql.exec(`CREATE TABLE IF NOT EXISTS hive_region_replay (
        singleton INTEGER PRIMARY KEY CHECK(singleton=1), format_version INTEGER NOT NULL,
        next_sequence INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS hive_region_receipts (
        sequence INTEGER PRIMARY KEY, replay_epoch INTEGER NOT NULL,
        principal TEXT NOT NULL, command_id TEXT NOT NULL, input_json TEXT NOT NULL,
        receipt_json TEXT NOT NULL, payload_bytes INTEGER NOT NULL,
        UNIQUE(principal,replay_epoch,command_id));`);
      if (!hasRegion) owner.sql.exec("INSERT INTO hive_region_replay VALUES (1,?,0)", FORMAT);
      frontier();
    },
    validate(count: number, payloadBytes: number) {
      const { sequence } = frontier();
      const rows = owner.sql.exec<{ n: number; bytes: number; first: number | null; last: number | null; invalid: number }>(
        `SELECT COUNT(*) AS n, COALESCE(SUM(payload_bytes),0) AS bytes,
        MIN(sequence) AS first,MAX(sequence) AS last,
        COALESCE(SUM(CASE WHEN replay_epoch<>CAST(sequence/? AS INTEGER) OR
        payload_bytes<>length(CAST(principal AS BLOB))+length(CAST(command_id AS BLOB))+
        length(CAST(input_json AS BLOB))+length(CAST(receipt_json AS BLOB))+16 THEN 1 ELSE 0 END),0) AS invalid
        FROM hive_region_receipts`, capacity,
      ).toArray()[0];
      if (!rows || rows.n !== count || rows.bytes !== payloadBytes || rows.invalid ||
        count !== Math.min(capacity, sequence) ||
        (count > 0 && (rows.first !== sequence - count || rows.last !== sequence - 1)))
        throw new Error("region-replay-metadata");
    },
    window() {
      const { sequence, epoch } = frontier();
      return { epoch, retainedReceipts: Math.min(sequence, capacity), capacity };
    },
    replay(principal: string, epoch: number, id: string, canonical: string): RegionReceipt | undefined {
      const prior = owner.sql.exec<{ input_json: string; receipt_json: string }>(
        "SELECT input_json,receipt_json FROM hive_region_receipts WHERE principal=? AND replay_epoch=? AND command_id=?",
        principal, epoch, id,
      ).toArray()[0];
      if (prior) {
        if (prior.input_json !== canonical) throw new Error("region-command-conflict");
        return decode(prior.receipt_json, resultBytes) as unknown as RegionReceipt;
      }
      const current = frontier();
      if (epoch < current.epoch) throw new Error("region-command-retired");
      if (epoch > current.epoch) throw new Error("region-command-epoch-gap");
      return undefined;
    },
    /** Called inside the same physical transaction; any later failure restores
     * the evicted result, its byte accounting and the untouched epoch frontier. */
    makeRoom() {
      const { sequence } = frontier();
      if (!Number.isSafeInteger(sequence + 1)) throw new Error("region-replay-sequence-capacity");
      if (sequence < capacity) return;
      const prior = owner.sql.exec<{ payload_bytes: number }>(
        "SELECT payload_bytes FROM hive_region_receipts WHERE sequence=?", sequence - capacity,
      ).toArray()[0];
      if (!prior) throw new Error("region-replay-metadata");
      owner.sql.exec("DELETE FROM hive_region_receipts WHERE sequence=?", sequence - capacity);
      owner.sql.exec("UPDATE hive_region SET receipt_count=receipt_count-1,receipt_bytes=receipt_bytes-? WHERE singleton=1", prior.payload_bytes);
    },
    size(principal: string, id: string, input: string, wire: string) {
      return bytes(principal) + bytes(id) + bytes(input) + bytes(wire) + 16;
    },
    save(principal: string, epoch: number, id: string, input: string, receipt: RegionReceipt, addedBytes: number) {
      const { sequence } = frontier();
      const wire = encode(receipt, resultBytes);
      owner.sql.exec("INSERT INTO hive_region_receipts VALUES (?,?,?,?,?,?,?)", sequence, epoch, principal, id, input, wire, addedBytes);
      owner.sql.exec("UPDATE hive_region SET receipt_count=receipt_count+1,receipt_bytes=receipt_bytes+? WHERE singleton=1", addedBytes);
      owner.sql.exec("UPDATE hive_region_replay SET next_sequence=? WHERE singleton=1", sequence + 1);
      return JSON.parse(wire) as RegionReceipt;
    },
  };
}
