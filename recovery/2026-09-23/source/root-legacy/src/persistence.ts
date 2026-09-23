// Browser persistence owns IndexedDB and Continue policy. The same game-state
// codec is independently usable by the authoritative region/DO consumer.
import { openDB } from "idb";
import type { Clearing } from "./model.ts";
import {
  snapshotFor,
  restoreSnapshot,
  decideSaveRevision,
  decideReplaceRevision,
} from "./clearing-state.ts";
export {
  snapshotFor,
  restoreSnapshot,
  backupJson,
  rawBackupJson,
  decideSaveRevision,
  decideReplaceRevision,
} from "./clearing-state.ts";
export type {
  SerializedClearing,
  SaveEnvelope,
  SaveRevisionDecision,
  ReplaceRevisionDecision,
} from "./clearing-state.ts";
const SAVE_DB_NAME = "hive-local-world";
const SAVE_STORE = "world";
const SAVE_KEY = "current";

export type LoadResult =
  | { kind: "missing" }
  | { kind: "loaded"; state: Clearing; revision: number }
  | { kind: "invalid"; raw: unknown; reason: string }
  | { kind: "failed"; error: unknown };
const database =
  typeof indexedDB === "undefined"
    ? null
    : openDB(SAVE_DB_NAME, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(SAVE_STORE))
            db.createObjectStore(SAVE_STORE);
        },
      });
async function readRecord(): Promise<unknown> {
  if (!database) throw new Error("IndexedDB is unavailable.");
  return (await database).get(SAVE_STORE, SAVE_KEY);
}
export async function loadWorld(): Promise<LoadResult> {
  if (!database)
    return { kind: "failed", error: new Error("IndexedDB is unavailable.") };
  try {
    const raw = await readRecord();
    if (raw === undefined) return { kind: "missing" };
    try {
      return { kind: "loaded", ...restoreSnapshot(raw) };
    } catch (error) {
      return {
        kind: "invalid",
        raw,
        reason: error instanceof Error ? error.message : "Unknown save format.",
      };
    }
  } catch (error) {
    return { kind: "failed", error };
  }
}
export async function saveWorld(
  state: Clearing,
  expected: number,
): Promise<{ revision: number }> {
  return write(state, expected, "cas");
}
export async function replaceWorld(
  state: Clearing,
  expected: number,
  mode: "cas" | "discardMalformed" = "cas",
): Promise<{ revision: number }> {
  return write(state, expected, mode);
}
async function write(
  state: Clearing,
  expected: number,
  mode: "cas" | "discardMalformed",
): Promise<{ revision: number }> {
  if (!database) throw new Error("IndexedDB is unavailable.");
  const db = await database,
    tx = db.transaction(SAVE_STORE, "readwrite"),
    decision =
      mode === "cas"
        ? decideSaveRevision(await tx.store.get(SAVE_KEY), expected)
        : decideReplaceRevision(await tx.store.get(SAVE_KEY), expected, mode);
  if (decision.kind !== "write") {
    tx.abort();
    throw new Error(decision.kind);
  }
  await tx.store.put(
    { ...snapshotFor(state), revision: decision.revision },
    SAVE_KEY,
  );
  await tx.done;
  return { revision: decision.revision };
}
