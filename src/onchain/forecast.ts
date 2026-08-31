import type { AccountSummary } from './account-summary.js';

/**
 * A single observed AccountSummary, tagged by the on-chain epoch at which it
 * was read. AccountSummary already carries `epoch`, so this is a plain
 * alias — kept as a distinct name so callers can express intent (a
 * time-series point) without duplicating fields.
 */
export type AccountSummarySnapshot = AccountSummary;

export interface ForecastResult {
  /** null = effectively infinite / cannot estimate */
  estimatedEpochsRemaining: bigint | null;
  estimatedDaysRemaining: number | null;
  method: 'lockup-rate' | 'observed-delta' | 'insufficient-data' | 'infinite';
  confidence: 'high' | 'low' | 'none';
}

/**
 * Sentinel returned by the Synapse contracts for `runwayInEpochs` when there
 * is no active rate-based lockup (lockupRatePerEpoch === 0n): the max
 * uint256 value, meaning "infinite" runway. Verified live on calibration
 * testnet — not a bug, must be detected and treated as "no active drain"
 * rather than used in arithmetic.
 */
export const MAX_UINT256 = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;

const DEFAULT_EPOCHS_PER_DAY = 2880n;

/**
 * Shared epoch-ascending sort, exported so callers (e.g. the decision
 * engine) that also need "the latest snapshot" don't hand-roll their own
 * copy of this comparator — a second independent copy would risk silently
 * desyncing from this one on a future change to tie-breaking semantics.
 */
export function sortByEpoch<T extends { epoch: bigint }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.epoch < b.epoch ? -1 : a.epoch > b.epoch ? 1 : 0));
}

function toDays(epochs: bigint | null, epochsPerDay: bigint): number | null {
  if (epochs === null) return null;
  const denom = epochsPerDay === 0n ? DEFAULT_EPOCHS_PER_DAY : epochsPerDay;
  return Number(epochs) / Number(denom);
}

/**
 * Pure, dependency-free forecast of remaining "runway" given a history of
 * AccountSummary observations (most recent last is NOT required — the
 * function sorts by `epoch` ascending internally).
 *
 * Priority of methods:
 *  1. infinite       — the max-uint256 sentinel is checked first and wins
 *                       unconditionally, even if lockupRatePerEpoch > 0
 *                       (an inconsistent contract state should still read
 *                       as infinite, not a ~4e73-day finite forecast).
 *  2. lockup-rate     — the contract has a committed nonzero
 *                       lockupRatePerEpoch; trust its own runwayInEpochs,
 *                       sanity-checked against availableFunds / rate — if
 *                       the two disagree by more than 2x, fall back to the
 *                       derived value with confidence:'low' rather than
 *                       trusting a possibly-stale runwayInEpochs.
 *  3. observed-delta  — rate-based lockup is 0 but availableFunds is
 *                       observed declining across snapshots (e.g. spend
 *                       outside a tracked rail). Uses the most recent
 *                       consecutive pair (by epoch) to compute an average
 *                       per-epoch decline, then divides remaining
 *                       availableFunds by that rate. Chosen over a full
 *                       linear regression because it reacts fastest to a
 *                       recent change in spend behavior, which matters more
 *                       for a "should we top up now" decision than smoothing
 *                       over the whole history.
 *  4. insufficient-data — fewer than 2 snapshots provided.
 */
export function forecastRunway(
  history: AccountSummarySnapshot[],
  options?: { epochsPerDay?: bigint }
): ForecastResult {
  const epochsPerDay = options?.epochsPerDay ?? DEFAULT_EPOCHS_PER_DAY;

  if (history.length === 0) {
    return {
      estimatedEpochsRemaining: null,
      estimatedDaysRemaining: null,
      method: 'insufficient-data',
      confidence: 'none',
    };
  }

  const sorted = sortByEpoch(history);
  const latest = sorted[sorted.length - 1];

  // 1 (checked first, unconditionally). The max-uint256 sentinel means
  // "infinite / no active drain" regardless of what lockupRatePerEpoch says —
  // an inconsistent contract state (rate > 0 alongside the sentinel) should
  // still be reported as infinite, not as a ~4e73-day finite forecast.
  if (latest.runwayInEpochs === MAX_UINT256) {
    return {
      estimatedEpochsRemaining: null,
      estimatedDaysRemaining: null,
      method: 'infinite',
      confidence: 'high',
    };
  }

  // 2. Trust the contract's own committed rate when it has one — this is
  // the strongest signal available, so it takes priority over observed-delta.
  if (latest.lockupRatePerEpoch > 0n) {
    const onChainEpochs = latest.runwayInEpochs;
    const derivedEpochs = latest.availableFunds / latest.lockupRatePerEpoch;

    // Sanity cross-check: if the contract-reported runway and the value
    // derived from availableFunds/rate disagree by more than 2x (and the
    // gap isn't just small-number bigint rounding noise), don't silently
    // trust a possibly-stale runwayInEpochs — fall back to the derived
    // value with lower confidence instead.
    const wildlyDisagree =
      derivedEpochs > 10n &&
      (onChainEpochs > derivedEpochs * 2n || onChainEpochs * 2n < derivedEpochs);

    const epochsRemaining = wildlyDisagree ? derivedEpochs : onChainEpochs;

    return {
      estimatedEpochsRemaining: epochsRemaining,
      estimatedDaysRemaining: toDays(epochsRemaining, epochsPerDay),
      method: 'lockup-rate',
      confidence: wildlyDisagree ? 'low' : 'high',
    };
  }

  // 3. Edge case: rate-based lockup is 0 and runwayInEpochs is NOT the
  // sentinel (so the contract isn't vouching for "no drain") — fall back to
  // an observed-delta estimate using the most recent consecutive pair of
  // snapshots (sorted by epoch ascending). A two-point recent-delta is used
  // instead of a full linear regression because it reacts fastest to a
  // recent change in spend behavior, which matters more for a "should we
  // top up now" decision than smoothing over the whole history.
  if (sorted.length < 2) {
    return {
      estimatedEpochsRemaining: null,
      estimatedDaysRemaining: null,
      method: 'insufficient-data',
      confidence: 'none',
    };
  }

  const prev = sorted[sorted.length - 2];
  const epochDelta = latest.epoch - prev.epoch;

  if (epochDelta <= 0n) {
    return {
      estimatedEpochsRemaining: null,
      estimatedDaysRemaining: null,
      method: 'insufficient-data',
      confidence: 'none',
    };
  }

  const fundsDelta = prev.availableFunds - latest.availableFunds; // positive = declining
  if (fundsDelta <= 0n) {
    // Funds flat or increasing: no drain observed.
    return {
      estimatedEpochsRemaining: null,
      estimatedDaysRemaining: null,
      method: 'infinite',
      confidence: 'high',
    };
  }

  const ratePerEpoch = fundsDelta / epochDelta; // floor division; rate could be 0 if decline is small over the interval
  if (ratePerEpoch <= 0n) {
    return {
      estimatedEpochsRemaining: null,
      estimatedDaysRemaining: null,
      method: 'infinite',
      confidence: 'high',
    };
  }

  const epochsRemaining = latest.availableFunds / ratePerEpoch;

  return {
    estimatedEpochsRemaining: epochsRemaining,
    estimatedDaysRemaining: toDays(epochsRemaining, epochsPerDay),
    method: 'observed-delta',
    confidence: 'low',
  };
}
