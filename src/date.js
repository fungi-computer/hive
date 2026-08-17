// date.js — the DATE spine (pure). THE world's clock is real calendar days, not
// ticks. Day keys are 'YYYY-MM-DD' strings derived from LOCAL calendar dates.
// All arithmetic is INTEGER civil-calendar ordinal math (Hinnant) — DST-proof by
// construction: a 25h day and a 23h day are both ONE calendar day.
//
// Purity: world.js/tables.js never import this; the clock enters ONLY through
// dayKey() (the single wall-clock door) and day keys passed in by callers.

export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

// days since 1970-01-01 — pure integer civil-calendar ordinal.
export function dayOrdinal({ y, m, d }) {
  const yy = y - (m <= 2 ? 1 : 0);
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromOrdinal(z) {
  z += 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

// calendar days from keyB to keyA (negative when a < b). DST-proof.
export function daysBetween(a, b) {
  return dayOrdinal(parseKey(a)) - dayOrdinal(parseKey(b));
}

export function addDays(key, n) {
  const o = fromOrdinal(dayOrdinal(parseKey(key)) + n);
  return `${o.y}-${String(o.m).padStart(2, "0")}-${String(o.d).padStart(2, "0")}`;
}
