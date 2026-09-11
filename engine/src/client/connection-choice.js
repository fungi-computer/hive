const TOKEN_BYTES = 32;

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
  if (current && /^[0-9a-f]{64}$/.test(current)) return current;
  const token = randomToken(cryptoSource);
  storage.setItem(key, token);
  return token;
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

function remoteConnection({ mode, host, storage, cryptoSource, fetchImpl, connectRemote }) {
  const endpoint = publicEndpoint(host, mode);
  const listeners = new Set();
  let disposed = false;
  let current;
  let unsubscribe = () => {};
  let token = readToken(storage, mode, cryptoSource);

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
        onReplaced?.(true);
      },
    },
  };
}

function localConnection({ mode, storage, connectLocal }) {
  const runtime = connectLocal();
  const saveKey = `hive-fresh-browser/${mode}`;
  return {
    runtime,
    persistence: {
      online: false,
      statusLabel: "Browser local · saves stay here",
      saveLabel: "Save",
      continueLabel: "Continue",
      newWorldLabel: "Reset world",
      save() {
        runtime.send({ type: "save" });
      },
      continue() {
        const saved = storage.getItem(saveKey);
        if (!saved) throw new Error("No saved world yet");
        runtime.send({ type: "restore", snapshot: JSON.parse(saved) });
      },
      onSaved(snapshot) {
        storage.setItem(saveKey, JSON.stringify(snapshot));
      },
      newWorld(onReplaced) {
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
} = {}) {
  if (typeof mode !== "string" || mode.length === 0)
    throw new Error("Connection choice requires a game mode");
  if (typeof connectLocal !== "function" || typeof connectRemote !== "function")
    throw new Error("Connection choice requires runtime factories");
  if (runtime === "local") return localConnection({ mode, storage, connectLocal });
  return remoteConnection({ mode, host: publicHost, storage, cryptoSource, fetchImpl, connectRemote });
}

export { TOKEN_BYTES, tokenKey };
