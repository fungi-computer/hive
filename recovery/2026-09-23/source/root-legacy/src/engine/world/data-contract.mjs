// Bounded plain data shared by world definitions and predecessor adapters.
function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, ordered(value[key])]),
  );
}
export const sameWorldData = (a, b) =>
  JSON.stringify(ordered(copyWorldData(a))) ===
  JSON.stringify(ordered(copyWorldData(b)));

export function safeInteger(value, label) {
  if (!Number.isSafeInteger(value))
    throw new TypeError(`${label}: safe integer required`);
  return value;
}

export function assertWorldArray(value, maxLength, label) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maxLength ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    throw new TypeError(`${label}: bounded plain array required`);
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, i);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value"))
      throw new TypeError(`${label}: plain array entries required`);
  }
}

export function copyWorldData(input) {
  let nodes = 0;
  function copy(value, depth) {
    if (++nodes > 4096 || depth > 32)
      throw new RangeError("world identity exceeds structural budget");
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "string"
    )
      return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) {
      if (
        value.length > 4096 ||
        Reflect.ownKeys(value).length !== value.length + 1
      )
        throw new TypeError(
          "world identity requires a bounded plain JSON array",
        );
      return Array.from({ length: value.length }, (_, i) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, i);
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value"))
          throw new TypeError(
            "world identity requires plain JSON array entries",
          );
        return copy(descriptor.value, depth + 1);
      });
    }
    if (
      value &&
      typeof value === "object" &&
      [null, Object.prototype].includes(Object.getPrototypeOf(value))
    ) {
      if (Reflect.ownKeys(value).some((key) => typeof key !== "string"))
        throw new TypeError("world identity requires string keys");
      return Object.fromEntries(
        Object.entries(Object.getOwnPropertyDescriptors(value)).map(
          ([key, descriptor]) => {
            if (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable)
              throw new TypeError(
                "world identity requires plain JSON properties",
              );
            return [key, copy(descriptor.value, depth + 1)];
          },
        ),
      );
    }
    throw new TypeError("world identity must contain only JSON data");
  }
  const copied = copy(input, 0),
    json = JSON.stringify(copied);
  if (new TextEncoder().encode(json).length > 16384)
    throw new RangeError("world identity exceeds 16 KiB");
  return copied;
}

export function assertWorldRecord(input, fields, label, optional = []) {
  if (
    !input ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(input))
  )
    throw new TypeError(label + ": exact plain record required");
  const keys = Reflect.ownKeys(input),
    allowed = new Set([...fields, ...optional]);
  if (
    fields.some((key) => !Object.hasOwn(input, key)) ||
    keys.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      return (
        !allowed.has(key) ||
        !descriptor?.enumerable ||
        !Object.hasOwn(descriptor, "value")
      );
    })
  )
    throw new TypeError(label + ": exact fields required");
}
