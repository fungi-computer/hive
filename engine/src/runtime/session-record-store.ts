import type { SessionSnapshot } from "./session";
import { MAX_KERNEL_RECORDS, type KernelRecordSnapshot } from "./kernel-records";
import type { RegionRecordReader, RegionStateRecord } from "../../../src/engine/region/index.ts";

type KernelHeader = Omit<KernelRecordSnapshot, "records"> & { readonly recordKeys: readonly string[] };
export type StoredSession = Omit<SessionSnapshot, "kernel"> & { readonly kernel: KernelHeader };

/** Header admission only. Native and relational Session validation occurs on hydration. */
export function checkedStoredSession(value: unknown): StoredSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("missing stored session");
  const state = value as StoredSession;
  const kernel = state.kernel;
  if (state.format !== "hive-session" || state.version !== 11 || typeof state.game !== "string" ||
      typeof state.paused !== "boolean" || !Number.isSafeInteger(state.tick) || state.tick < 0 ||
      !Number.isFinite(state.now) || state.now < 0 || !kernel || kernel.format !== "hive-kernel-records" ||
      kernel.version !== 3 || kernel.revision !== state.tick || kernel.time !== state.now ||
      !Array.isArray(kernel.recordKeys) || kernel.recordKeys.length < 2 || kernel.recordKeys.length > MAX_KERNEL_RECORDS ||
      new Set(kernel.recordKeys).size !== kernel.recordKeys.length ||
      kernel.recordKeys.some(key => typeof key !== "string" || key.length > 160 || !key.startsWith("kernel/")) ||
      Object.hasOwn(kernel, "records")) throw new Error("invalid stored session header");
  return state;
}

export function storeSession(snapshot: SessionSnapshot): { session: StoredSession; records: readonly RegionStateRecord[] } {
  const { records, ...kernel } = snapshot.kernel;
  const session = checkedStoredSession({ ...snapshot, kernel: { ...kernel, recordKeys: records.map(record => record.key) } });
  return { session, records };
}

export function hydrateSession(stored: StoredSession, reader: RegionRecordReader): SessionSnapshot {
  const state = checkedStoredSession(stored);
  const { recordKeys, ...kernel } = state.kernel;
  const records = recordKeys.map(key => {
    const bytes = reader.read(key);
    if (!bytes) throw new Error(`missing kernel record ${key}`);
    return { key, bytes };
  });
  return { ...state, kernel: { ...kernel, records } };
}
