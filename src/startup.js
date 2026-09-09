/** Loading progress is an observation of real work, never a readiness substitute. */
export function createStartupReporter(render, now = () => performance.now()) {
  const stages = Object.fromEntries(
    [
      ["art", "Drawing the clearing"],
      ["optimizer", "Preparing the game"],
      ["storage", "Loading your saved clearing"],
      ["display", "Preparing the game"],
      ["game", "Preparing the game"],
    ].map(([id, label]) => [
      id,
      {
        id,
        label,
        status: "waiting",
        startedAt: null,
        completedAt: null,
        detail: "",
      },
    ]),
  );
  const snapshot = () => Object.values(stages).map((stage) => ({ ...stage }));
  const publish = () => render(snapshot());
  function start(id) {
    const stage = stages[id];
    if (!stage || stage.status !== "waiting")
      throw new Error(`Invalid startup stage: ${id}`);
    stage.status = "running";
    stage.startedAt = now();
    publish();
  }
  function complete(id) {
    const stage = stages[id];
    if (stage.status !== "running")
      throw new Error(`Startup stage is not running: ${id}`);
    stage.status = "complete";
    stage.completedAt = now();
    publish();
  }
  function fail(id, error) {
    const stage = stages[id];
    if (!stage || stage.status !== "running") return;
    stage.status = "failed";
    stage.detail = String(error?.message ?? error).slice(0, 256);
    publish();
  }
  publish();
  return {
    start,
    complete,
    fail,
    snapshot,
    progress(id, progress) {
      const stage = stages[id];
      if (!stage || stage.status !== "running") return;
      stage.detail = String(progress.detail ?? "").slice(0, 128);
      stage.completedTextures = progress.completedTextures;
      stage.waitingFor = progress.waitingFor ?? null;
      publish();
    },
    async run(id, work) {
      start(id);
      try {
        const result = await work();
        complete(id);
        return result;
      } catch (error) {
        fail(id, error);
        throw error;
      }
    },
  };
}

export function renderStartup(loading, stages) {
  if (!loading) return;
  loading.dataset.startup = JSON.stringify(stages);
  const failed = stages.find((stage) => stage.status === "failed");
  const pending = stages.filter((stage) => stage.status === "running");
  const status = loading.querySelector("small") ?? loading;
  status.textContent = failed
    ? `${failed.label} failed. The clearing could not open.`
    : [...new Set(pending.map((stage) => stage.label))].join(" · ") ||
      "Opening the clearing…";
}
