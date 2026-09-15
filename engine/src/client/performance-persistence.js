/**
 * Persistence capability for the local performance runtime.
 *
 * The client clears its projection in the new-world callback, while the
 * runtime reset is the authoritative simulation operation.
 */
export function createPerformancePersistence(runtime) {
  if (!runtime || typeof runtime.send !== "function")
    throw new Error("performance persistence requires a runtime");
  return {
    online: false,
    statusLabel: "Local performance run",
    save() {},
    continue() {},
    newWorld(callback) {
      runtime.send({ type: "reset" });
      callback?.(false);
    },
  };
}
