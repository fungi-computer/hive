export function assert(ok, message) {
  if (!ok) throw new TypeError(message);
}

export function record(value, required, optional = []) {
  assert(
    value && [Object.prototype, null].includes(Object.getPrototypeOf(value)),
    "plain air record required",
  );
  const allowed = new Set([...required, ...optional]);
  assert(
    required.every((key) => Object.hasOwn(value, key)),
    "missing air field",
  );
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    assert(
      allowed.has(key) && d.enumerable && Object.hasOwn(d, "value"),
      "unknown or accessor air field",
    );
  }
}

export function array(value, maximum) {
  assert(
    Array.isArray(value) &&
      Object.getPrototypeOf(value) === Array.prototype &&
      value.length <= maximum &&
      Reflect.ownKeys(value).length === value.length + 1,
    "bounded plain air array",
  );
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, i);
    assert(
      d?.enumerable && Object.hasOwn(d, "value"),
      "dense plain air array entries",
    );
  }
}

export function uniqueStrings(value, maximum) {
  array(value, maximum);
  assert(
    value.every(
      (v) => typeof v === "string" && v.length > 0 && v.length <= 160,
    ) && new Set(value).size === value.length,
    "unique bounded air identifiers",
  );
  return [...value].sort();
}

export function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function sum(values) {
  let total = 0,
    correction = 0;
  for (const value of values) {
    const next = total + value;
    correction +=
      Math.abs(total) >= Math.abs(value)
        ? total - next + value
        : value - next + total;
    total = next;
  }
  return total + correction;
}
