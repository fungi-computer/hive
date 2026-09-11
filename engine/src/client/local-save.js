import { openDB } from "idb";

const DB_NAME = "hive-fresh-engine-local";
const STORE_NAME = "snapshots";
const DB_VERSION = 1;

export function createLocalSaveOwner({
  mode,
  indexedDBSource = globalThis.indexedDB,
  openDBImpl = openDB,
} = {}) {
  if (typeof mode !== "string" || mode.length === 0)
    throw new Error("local save requires a mode");
  if (!indexedDBSource) {
    return unavailableSave("IndexedDB is unavailable.");
  }
  let opening;
  let database;
  let closed = false;
  const open = () => {
    if (closed) return Promise.reject(new Error("local save is closed"));
    if (!opening) {
      opening = Promise.resolve(openDBImpl(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        },
        blocked() {},
      })).then((db) => {
        if (closed) {
          db.close();
          throw new Error("local save is closed");
        }
        database = db;
        db.onversionchange = () => {
          closed = true;
          database = undefined;
          db.close();
        };
        return db;
      });
    }
    return opening;
  };
  async function read() {
    const db = await open();
    return db.get(STORE_NAME, mode);
  }
  async function write(snapshot) {
    const db = await open();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const put = Promise.resolve().then(() => tx.store.put(snapshot, mode));
    await Promise.all([put, tx.done]);
  }
  async function close() {
    if (closed) return;
    closed = true;
    try {
      const db = database ?? await opening;
      db?.close();
    } finally {
      database = undefined;
    }
  }
  return { read, write, close };
}

function unavailableSave(message) {
  const fail = () => Promise.reject(new Error(message));
  return { read: fail, write: fail, close: async () => {} };
}

export { DB_NAME, STORE_NAME, DB_VERSION };
