import { z } from "zod";
import { changeQuantity } from "./arithmetic.mjs";

const definitionSchema = z.strictObject({
  durationS: z.number().positive().finite(),
  totals: z.record(z.string().min(1).max(160), z.number().finite()),
});
const timeSchema = z.number().nonnegative().finite();

export type FiniteReleaseDefinition<K extends string> = {
  readonly durationS: number;
  /** Channel names and units belong to the consuming physical operation. */
  readonly totals: Readonly<Record<K, number>>;
};
export type ReleaseFacts<K extends string> = {
  readonly fraction: number;
  readonly remainingS: number;
  readonly endsAtS: number | null;
  readonly released: Readonly<Record<K, number>>;
};
export type ReleaseSegment<K extends string> = {
  readonly seconds: number;
  /** null means the interval has no active source. */
  readonly rates: Readonly<Record<K, number>> | null;
};
export type ReleasePlan<K extends string> =
  | {
      readonly status: "ready";
      readonly segments: readonly ReleaseSegment<K>[];
    }
  | { readonly status: "blocked"; readonly reason: "subminimum-interval" };

/** A finite, constant-rate release measured against the host's physical clock.
 * This owner has no timer, mutable cursor, payment, receiver or stored callback.
 * The caller binds startS to a committed input receipt, validates that relation
 * on restore, and publishes actual receiver changes in its world transaction.
 */
export function createFiniteRelease<K extends string>(
  input: FiniteReleaseDefinition<K>,
) {
  const parsed = definitionSchema.parse(input);
  const entries = Object.entries(parsed.totals);
  if (entries.length < 1 || entries.length > 16)
    throw new TypeError("finite release requires 1..16 channels");
  const totals = Object.freeze({ ...parsed.totals }) as Readonly<
    Record<K, number>
  >;
  const durationS = parsed.durationS;
  const map = (fn: (total: number, channel: K) => number) =>
    Object.freeze(
      Object.fromEntries(
        entries.map(([channel, total]) => [channel, fn(total, channel as K)]),
      ),
    ) as Readonly<Record<K, number>>;
  // Reject unusable definitions before a start is attached to a paid receipt.
  for (const [, total] of entries) {
    const rate = total / durationS;
    if (!Number.isFinite(rate) || (total !== 0 && rate === 0))
      throw new TypeError("finite release rate is not representable");
  }

  function read(startS: number | null, atS: number): ReleaseFacts<K> {
    timeSchema.parse(atS);
    if (startS === null)
      return Object.freeze({
        fraction: 0,
        remainingS: 0,
        endsAtS: null,
        released: map(() => 0),
      });
    timeSchema.parse(startS);
    if (startS > atS)
      throw new TypeError("release starts after the host clock");
    const endS = changeQuantity(startS, durationS);
    // Quantities follow the represented clock span. A large valid host clock
    // can round start+duration; nominal rates must not create extra material.
    const fraction = atS >= endS ? 1 : (atS - startS) / (endS - startS);
    const released = map((total) => {
      const value = total * fraction;
      if (total !== 0 && fraction !== 0 && value === 0)
        throw new TypeError("finite released quantity is not representable");
      return value;
    });
    return Object.freeze({
      fraction,
      remainingS: Math.max(0, endS - atS),
      endsAtS: endS,
      released,
    });
  }

  function intervalRates(
    before: ReleaseFacts<K>,
    after: ReleaseFacts<K>,
    seconds: number,
  ) {
    return map((total, channel) => {
      const delta = after.released[channel] - before.released[channel];
      const rate = delta / seconds;
      if (
        !Number.isFinite(rate) ||
        (total !== 0 && after.fraction > before.fraction && delta === 0) ||
        (delta !== 0 && rate === 0)
      )
        throw new TypeError(
          "finite release interval quantity is not representable",
        );
      return rate;
    });
  }

  /** Split only at the finite source's end. No short piece or owed remainder is
   * discarded merely because a consuming field has a minimum step interval.
   */
  function plan(
    startS: number | null,
    atS: number,
    seconds: number,
    minimumIntervalS: number,
  ): ReleasePlan<K> {
    timeSchema.parse(seconds);
    z.number().positive().finite().parse(minimumIntervalS);
    const before = read(startS, atS);
    const { remainingS, endsAtS } = before;
    const intervalEndS = changeQuantity(atS, seconds);
    // Compare the represented host timestamps, not a subtract/add round trip.
    // In particular 0.3+0.6 reaches its exact represented end without inventing
    // a microscopic coast interval from (0.3+0.6)-0.3.
    const activeS =
      remainingS === 0 ? 0 : intervalEndS <= endsAtS! ? seconds : remainingS;
    const coastS = seconds - activeS;
    const owedS = endsAtS === null ? 0 : Math.max(0, endsAtS - intervalEndS);
    if (
      [activeS, coastS, owedS].some(
        (part) => part > 0 && part < minimumIntervalS,
      )
    )
      return Object.freeze({
        status: "blocked",
        reason: "subminimum-interval",
      });
    const segments: ReleaseSegment<K>[] = [];
    if (activeS > 0) {
      const after = read(startS, Math.min(intervalEndS, endsAtS!));
      segments.push(
        Object.freeze({
          seconds: activeS,
          rates: intervalRates(before, after, activeS),
        }),
      );
    }
    if (coastS > 0)
      segments.push(Object.freeze({ seconds: coastS, rates: null }));
    return Object.freeze({
      status: "ready",
      segments: Object.freeze(segments),
    });
  }

  return Object.freeze({
    definition: Object.freeze({ durationS, totals }),
    read,
    plan,
  });
}
