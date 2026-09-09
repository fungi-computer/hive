// JSON bytes cross the frame boundary; neither side passes live Three objects.
export const CHANNEL = "hive-full-editor-v1";
export const MAX_BYTES = 32 * 1024 * 1024;
export const UPSTREAM_COMMIT = "e69f76ed41069827b72550d9a4b1e3901ab61e3b";
export function encode(value) {
  return new TextEncoder().encode(JSON.stringify(value)).buffer;
}
export function decode(bytes) {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength > MAX_BYTES)
    throw new Error("Project exceeds the 32 MiB import boundary");
  const value = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  let count = 0;
  function visit(item, depth = 0) {
    if (++count > 2_000_000 || depth > 80)
      throw new Error("Project structure exceeds import limits");
    if (typeof item === "number" && !Number.isFinite(item))
      throw new Error("Nonfinite project number");
    if (!item || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw new Error("Invalid project key");
      if (
        key === "scripts" &&
        (!child || typeof child !== "object" || Object.keys(child).length)
      )
        throw new Error("Executable project scripts are not supported");
      if (
        key === "type" &&
        typeof child === "string" &&
        /Script.*Command/.test(child)
      )
        throw new Error("Executable script history is not supported");
      if (key === "url")
        for (const url of Array.isArray(child) ? child : [child]) {
          if (typeof url === "string" && !url.startsWith("data:image/"))
            throw new Error(
              "Imported external resources must be embedded images",
            );
        }
      visit(child, depth + 1);
    }
  }
  visit(value);
  return value;
}
export function isRequest(value) {
  return (
    value?.channel === CHANNEL &&
    typeof value.id === "string" &&
    value.id.length <= 80 &&
    [
      "load-asset",
      "load-project",
      "export-project",
      "export-three",
      "export-glb",
      "dispose",
    ].includes(value.operation)
  );
}
