/** Load the two checked art packs independently, retaining ownership until a
 * synchronous installation accepts both. Failure or cancellation releases every
 * successful pack, including a sibling that finishes after the client closes. */
export function createClientArtLoading({ loadTerrain, loadStatic }) {
  let closed = false, installed = false;
  const owned = new Set();
  function dispose() {
    if (closed) return;
    closed = true;
    for (const pack of owned) pack.dispose();
    owned.clear();
  }
  const load = loader => Promise.resolve().then(loader).then(pack => {
    if (closed) pack.dispose();
    else owned.add(pack);
    return pack;
  });
  const ready = Promise.all([load(loadTerrain), load(loadStatic)]).catch(error => {
    dispose();
    throw error;
  });
  // Renderer/native initialization can still be pending when an art request
  // fails. The failure remains available to install without an unhandled reject.
  void ready.catch(() => {});
  return Object.freeze({
    async install(accept) {
      const [terrain, statics] = await ready;
      if (closed) return false;
      if (installed) throw new Error("client art is already installed");
      try { accept(terrain, statics); }
      catch (error) { dispose(); throw error; }
      installed = true;
      owned.clear();
      return true;
    },
    dispose,
  });
}
