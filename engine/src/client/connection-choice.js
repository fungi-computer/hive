import { createLocalSaveOwner } from "./local-save.js";
import { z } from "zod";

const TOKEN_BYTES = 32;
const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

function tokenKey(mode) {
  return `hive-private-demo/${mode}`;
}

function randomToken(cryptoSource) {
  const bytes = new Uint8Array(TOKEN_BYTES);
  cryptoSource.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function readToken(storage, mode, cryptoSource) {
  const key = tokenKey(mode);
  const current = storage.getItem(key);
  if (current && tokenSchema.safeParse(current).success) return current;
  const token = randomToken(cryptoSource);
  storage.setItem(key, token);
  return token;
}

function invitationToken(locationSource) {
  const hash = typeof locationSource?.hash === "string" ? locationSource.hash : "";
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const supplied = params.get("world");
  if (supplied === null) return undefined;
  const parsed = tokenSchema.safeParse(supplied);
  if (!parsed.success) throw new Error("This invitation link has an invalid world token");
  return parsed.data;
}

function invitationUrl(locationSource, mode, token) {
  const url = new URL(locationSource?.href ?? locationSource?.toString?.() ?? "", "http://localhost");
  const params = new URLSearchParams(url.search);
  params.set("game", mode);
  params.delete("runtime");
  url.search = params.toString();
  url.hash = `world=${token}`;
  return url.toString();
}

function publicEndpoint(host, mode) {
  if (typeof host !== "string" || host.length === 0)
    throw new Error("Online demos require VITE_HIVE_PUBLIC_HOST");
  const url = new URL(host);
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost))
    throw new Error("Online demos require an HTTPS public host");
  if (url.username || url.password)
    throw new Error("Online demo hosts cannot contain credentials");
  url.pathname = `${url.pathname.replace(/\/$/, "")}/v1/${encodeURIComponent(mode)}`;
  url.search = "";
  url.hash = "";
  return url;
}

function authorizedFetch(fetchImpl, token) {
  return (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetchImpl(input, { ...init, headers });
  };
}

function remoteConnection({ mode, host, storage, cryptoSource, fetchImpl, connectRemote, locationSource, historySource }) {
  const endpoint = publicEndpoint(host, mode);
  const listeners = new Set();
  let disposed = false;
  let current;
  let unsubscribe = () => {};
  const invitedToken = invitationToken(locationSource);
  let token = invitedToken ?? readToken(storage, mode, cryptoSource);

  function replace(nextToken) {
    const next = connectRemote({
      endpoint,
      game: mode,
      fetch: authorizedFetch(fetchImpl, nextToken),
      token: nextToken,
    });
    const nextUnsubscribe = next.subscribe((event) => {
      for (const listener of listeners) listener(event);
    });
    const previous = current;
    const previousUnsubscribe = unsubscribe;
    current = next;
    unsubscribe = nextUnsubscribe;
    token = nextToken;
    previousUnsubscribe();
    previous?.dispose();
  }
  replace(token);
  const runtime = {
    send(command) {
      if (disposed) throw new Error("connection choice disposed");
      current.send(command);
    },
    subscribe(listener) {
      if (disposed) throw new Error("connection choice disposed");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      current.dispose();
      listeners.clear();
    },
    get recovery() {
      if (disposed) throw new Error("connection choice disposed");
      if (!current.recovery) return undefined;
      return {
        retry() {
          if (disposed) throw new Error("connection choice disposed");
          current.recovery.retry();
        },
      };
    },
  };
  return {
    runtime,
    persistence: {
      online: true,
      statusLabel: "Online · server saved",
      saveLabel: null,
      continueLabel: null,
      newWorldLabel: "New world",
      newWorld(onReplaced) {
        if (disposed) throw new Error("connection choice disposed");
        const next = randomToken(cryptoSource);
        const previous = token;
        try {
          storage.setItem(tokenKey(mode), next);
          replace(next);
        } catch (error) {
          try { storage.setItem(tokenKey(mode), previous); } catch {}
          throw error;
        }
        if (invitedToken !== undefined && historySource?.replaceState) {
          const clean = new URL(locationSource?.href ?? locationSource?.toString?.() ?? endpoint.toString());
          clean.hash = "";
          historySource.replaceState(null, "", `${clean.pathname}${clean.search}`);
        }
        onReplaced?.(true);
      },
      invitation: {
        url() {
          if (disposed) throw new Error("connection choice disposed");
          return invitationUrl(locationSource, mode, token);
        },
      },
    },
  };
}

function localConnection({ mode, connectLocal, saveOwner }) {
  const runtime = connectLocal();
  const owner = saveOwner ?? createLocalSaveOwner({ mode });
  const disposeRuntime = runtime.dispose?.bind(runtime);
  let disposed = false;
  runtime.dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      disposeRuntime?.();
    } finally {
      void Promise.resolve().then(() => owner.close?.()).catch(() => {});
    }
  };
  return {
    runtime,
    persistence: {
      online: false,
      statusLabel: "Browser local · saves stay here",
      saveLabel: "Save",
      continueLabel: "Continue",
      newWorldLabel: "Reset world",
      save() {
        if (disposed) throw new Error("connection choice disposed");
        runtime.send({ type: "save" });
      },
      async continue() {
        if (disposed) throw new Error("connection choice disposed");
        const saved = await owner.read();
        if (disposed) throw new Error("connection choice disposed");
        if (saved === undefined) throw new Error("No saved world yet");
        runtime.send({ type: "restore", snapshot: saved });
      },
      onSaved(snapshot) {
        if (disposed) return Promise.reject(new Error("connection choice disposed"));
        return owner.write(snapshot);
      },
      newWorld(onReplaced) {
        if (disposed) throw new Error("connection choice disposed");
        onReplaced?.(false);
        runtime.send({ type: "reset" });
      },
    },
  };
}

export function createConnectionChoice({
  mode,
  runtime = new URLSearchParams(globalThis.location?.search ?? "").get("runtime"),
  publicHost,
  storage = globalThis.localStorage,
  cryptoSource = globalThis.crypto,
  fetchImpl = globalThis.fetch,
  connectLocal,
  connectRemote,
  saveOwner,
  locationSource = globalThis.location,
  historySource = globalThis.history,
} = {}) {
  if (typeof mode !== "string" || mode.length === 0)
    throw new Error("Connection choice requires a game mode");
  if (typeof connectLocal !== "function" || typeof connectRemote !== "function")
    throw new Error("Connection choice requires runtime factories");
  if (runtime === "local") return localConnection({ mode, connectLocal, saveOwner });
  return remoteConnection({ mode, host: publicHost, storage, cryptoSource, fetchImpl, connectRemote, locationSource, historySource });
}

export { TOKEN_BYTES, tokenKey };
