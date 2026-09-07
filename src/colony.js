// The unmodified, pinned upstream browser release owns assignment optimization.
export function loadColony() {
  return new Promise((resolve, reject) => {
    window.Module = {
      locateFile: (name) =>
        `${import.meta.env.BASE_URL}vendor/libcolony/${name}`,
      onRuntimeInitialized: () => resolve(window.Module),
      onAbort: (reason) => reject(new Error(`libcolony failed: ${reason}`)),
    };
    const script = document.createElement("script");
    script.src = `${import.meta.env.BASE_URL}vendor/libcolony/colony.js`;
    script.onerror = () => reject(new Error("Could not load libcolony."));
    document.head.append(script);
  });
}
