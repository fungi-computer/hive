// Preserve the existing UTF-16 FNV-1a recipe exactly. Only the common integer
// coordinate serialization avoids allocating an interpolated string per corner.
// This is not a new random distribution or a new persistent generator identity.
export function hashString(value, initial = 2166136261) {
  let hash = initial;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function integerHash(hash, value) {
  // Keep all older sampler behavior outside this arithmetic fast path,
  // including JS exponent notation. -0 stringifies as "0" in the old recipe.
  if (!Number.isInteger(value) || Math.abs(value) > 999999999)
    return hashString(String(value), hash);
  if (value < 0) {
    hash = Math.imul(hash ^ 45, 16777619);
    value = -value;
  }
  let place = 1;
  while (place * 10 <= value) place *= 10;
  do {
    const digit = Math.floor(value / place);
    hash = Math.imul(hash ^ (48 + digit), 16777619);
    value -= digit * place;
    place /= 10;
  } while (place >= 1);
  return hash >>> 0;
}

const pipe = (hash) => Math.imul(hash ^ 124, 16777619);

export function latticeHash2(prefix, x, z, salt) {
  return hashString(salt, pipe(integerHash(pipe(integerHash(prefix, x)), z)));
}

export function latticeHash3(prefix, x, y, z, salt) {
  const xy = pipe(integerHash(pipe(integerHash(prefix, x)), y));
  return hashString(salt, pipe(integerHash(xy, z)));
}
