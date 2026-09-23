import type { SessionCommitSnapshot, SessionSnapshot } from "./session";
import { validateKernelRecordInventory, type KernelRecordSnapshot } from "./kernel-records";
import type { RegionRecordReader, RegionStateRecord } from "../../../src/engine/region/index.ts";

type KernelHeader = Omit<KernelRecordSnapshot, "records">;
export type StoredSession = Omit<SessionSnapshot, "kernel"> & { readonly kernel: KernelHeader };

/** Header admission only. Native and relational Session validation occurs on hydration. */
export function checkedStoredSession(value: unknown): StoredSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("missing stored session");
  const state = value as StoredSession;
  const kernel = state.kernel;
  if (state.format !== "hive-session" || state.version !== 12 || typeof state.game !== "string" ||
      typeof state.paused !== "boolean" || !Number.isSafeInteger(state.tick) || state.tick < 0 ||
      !Number.isFinite(state.now) || state.now < 0 || !kernel || kernel.format !== "hive-kernel-records" ||
      kernel.version !== 4 || kernel.revision !== state.tick || kernel.time !== state.now ||
      Object.hasOwn(kernel, "records") || Object.hasOwn(kernel, "recordKeys")) throw new Error("invalid stored session header");
  return state;
}

export function storeSession(snapshot: SessionSnapshot | SessionCommitSnapshot): { session: StoredSession; records: readonly RegionStateRecord[] } {
  const records = "records" in snapshot.kernel ? snapshot.kernel.records : [];
  const { records: _rows, ...kernel } = snapshot.kernel as KernelRecordSnapshot;
  const session = checkedStoredSession({ ...snapshot, kernel });
  return { session, records };
}

export function hydrateSession(stored: StoredSession, reader: RegionRecordReader): SessionSnapshot {
  const state = checkedStoredSession(stored);
  const records = reader.records();
  validateKernelRecordInventory(records.map(record => record.key));
  for (let index = 1; index < records.length; index++) {
    if (records[index - 1].key >= records[index].key) throw new Error("kernel record inventory is not canonical");
  }
  const { ...kernel } = state.kernel;
  return { ...state, kernel: { ...kernel, records } };
}
