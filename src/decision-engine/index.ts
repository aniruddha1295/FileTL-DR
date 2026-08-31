import { forecastRunway, sortByEpoch, type AccountSummarySnapshot, type ForecastResult } from '../onchain/forecast.js';
import type { PDPStatusResult } from '../onchain/pdp-status.js';

/**
 * The three (plus one) runway bands the agent evaluates against a baseline
 * "expected/target runway" in epochs. `insufficient-data` is not one of the
 * three demo-facing tiers (green/yellow/red) — it is a distinct fourth state
 * for when the forecast itself can't be trusted, so it never silently
 * collapses into `green` (optimistic) or `red` (alarmist).
 */
export type Band = 'green' | 'yellow' | 'red' | 'insufficient-data';

/**
 * Small, closed action set. `hold-and-monitor` is deliberately distinct from
 * `none`: `none` means "everything is fine, no decision was forced";
 * `hold-and-monitor` means "we explicitly chose NOT to act (no top-up, no
 * drop) despite some uncertainty or risk" — the trace's `reason` explains
 * why. Keeping them separate makes the demo trace honest about *why* nothing
 * happened.
 */
export type Action = 'none' | 'top-up' | 'drop-dataset' | 'hold-and-monitor';

export interface DecisionConfig {
  /**
   * The 100% baseline "expected/target runway", in epochs, that the
   * green/yellow/red percentages are measured against.
   *
   * Defaults to the latest `AccountSummary.grossCoverageInEpochs` when
   * omitted (see rationale in `resolveBaselineEpochs` below). Callers running
   * a demo with a specific target (e.g. "we always want ~30 days of runway")
   * should pass this explicitly instead of relying on whatever the contract
   * currently reports as gross coverage.
   */
  targetRunwayEpochs?: bigint;
  /** Percent (0-100) at/above which the band is green. Default 70. Inclusive: exactly 70% is green. */
  greenThresholdPercent?: number;
  /** Percent (0-100) below which the band is red. Default 30. Exclusive: exactly 30% is yellow, not red. */
  redThresholdPercent?: number;
  /**
   * Percent (0-100) of baseline that an aggressive (red-band, PDP-verified)
   * top-up targets restoring to. Default 100 — a verified dataset in the red
   * band is worth fully re-funding, not just nudging back to green, because
   * we've just confirmed the storage is intact and worth paying for.
   */
  aggressiveRestorePercent?: number;
  /** `epochsPerDay` forwarded to `forecastRunway` for day-denominated numbers in the trace/reason. */
  epochsPerDay?: bigint;
}

const DEFAULT_GREEN_THRESHOLD_PERCENT = 70;
const DEFAULT_RED_THRESHOLD_PERCENT = 30;
const DEFAULT_AGGRESSIVE_RESTORE_PERCENT = 100;

export interface DecisionTraceDetails {
  /** The 100% baseline runway (epochs) the percentage below is measured against. `null` if unavailable. */
  baselineEpochs: bigint | null;
  /**
   * `estimatedEpochsRemaining` expressed as a percentage of `baselineEpochs`,
   * rounded to 2 decimal places. `null` when the forecast has no finite
   * estimate (infinite/insufficient-data) or the baseline is unusable.
   */
  percentOfBaseline: number | null;
  estimatedEpochsRemaining: bigint | null;
  estimatedDaysRemaining: number | null;
  /** Suggested top-up amount, in the same base units as `AccountSummary.availableFunds`. `null` when no top-up is proposed or it can't be sized. */
  suggestedTopUpAmount: bigint | null;
  /** The epochs-remaining figure a proposed top-up is sized to reach. `null` when no top-up is proposed. */
  targetEpochsAfterTopUp: bigint | null;
  thresholds: { greenPercent: number; redPercent: number; aggressiveRestorePercent: number };
}

export interface DecisionTrace {
  band: Band;
  forecast: ForecastResult;
  pdpStatus: PDPStatusResult;
  action: Action;
  /** Plain-English explanation suitable for demo narration; always references the concrete numbers/facts behind the decision. */
  reason: string;
  details: DecisionTraceDetails;
}

/**
 * Baseline ("100%") resolution: `config.targetRunwayEpochs` wins when given
 * (lets a demo/operator pin a fixed target independent of on-chain state,
 * e.g. "we always want 30 days of runway"). Otherwise we fall back to the
 * latest observed `AccountSummary.grossCoverageInEpochs` — the SDK's own
 * notion of "epochs of runway if every currently-locked-up obligation is
 * honored" — so the tiers are anchored to real on-chain state rather than a
 * magic constant when no explicit target is configured. This keeps the
 * "meaningful use of Filecoin" story intact: the 100% line itself is read
 * from chain by default, not invented in our backend.
 */
function resolveBaselineEpochs(
  latest: AccountSummarySnapshot | undefined,
  config: DecisionConfig
): bigint | null {
  if (config.targetRunwayEpochs !== undefined) {
    return config.targetRunwayEpochs > 0n ? config.targetRunwayEpochs : null;
  }
  if (!latest) return null;
  const gross = latest.grossCoverageInEpochs;
  // The MAX_UINT256 sentinel means "no active lockup", not a numeric epoch
  // count — unusable as a percentage denominator.
  if (gross <= 0n || gross > 10n ** 30n) return null;
  return gross;
}

function percentOfBaseline(epochsRemaining: bigint, baselineEpochs: bigint): number {
  // Fixed-point to 2 decimal places, avoiding float bigint division loss.
  const scaled = (epochsRemaining * 10000n) / baselineEpochs;
  return Number(scaled) / 100;
}

function epochsForPercent(baselineEpochs: bigint, percent: number): bigint {
  // percent given as 0-100; keep 2 decimal places of precision on the input.
  const percentScaled = BigInt(Math.round(percent * 100));
  const numerator = baselineEpochs * percentScaled;
  // Ceiling division: plain integer division truncates towards zero, which
  // can round the target DOWN to exactly the current epochsRemaining at
  // small baselines (e.g. baseline=3, percent=70 -> floor gives 2, which
  // equals a yellow-band account's current remaining, producing a
  // self-contradictory "top-up of 0" — see code review finding). Rounding
  // the target up guarantees a proposed top-up always actually moves the
  // account at least to the requested percent, never short of it.
  return (numerator + 9999n) / 10000n;
}

function fmtDays(days: number | null): string {
  if (days === null) return 'unknown';
  return `~${days.toFixed(1)} days`;
}

function fmtPercent(p: number | null): string {
  if (p === null) return 'unknown';
  return `${p.toFixed(1)}%`;
}

function fmtTopUpAmount(amount: bigint | null): string {
  if (amount === null) {
    return 'an amount that could not be automatically sized (insufficient rate data — recommend manual review)';
  }
  return `${amount.toString()} base units`;
}

/**
 * Sizes a top-up: how many additional epochs of runway are needed to reach
 * `targetEpochs`, converted to a token amount via an "effective" per-epoch
 * drain rate.
 *
 * The effective rate prefers the account's own committed
 * `lockupRatePerEpoch` (the strongest signal, matching `forecastRunway`'s own
 * priority order). When that's 0 (e.g. the forecast used the
 * `observed-delta` method because spend is happening outside a tracked
 * rail), the rate is instead backed out from the forecast itself:
 * `rate = availableFunds / estimatedEpochsRemaining` — the same relationship
 * `forecastRunway` used to produce that estimate in the first place, so this
 * stays internally consistent without needing a new dependency.
 */
/**
 * Resolves a per-epoch drain rate to size a top-up with, trying progressively
 * weaker signals: the account's own committed `lockupRatePerEpoch` first,
 * then the rate implied by the current forecast, then — critically, for a
 * fully-exhausted account where both of the above are unusable (rate is 0
 * AND epochsRemaining is already <= 0) — the observed decline between the
 * two most recent snapshots. Without this last fallback, the exact "out of
 * runway right now" scenario (the case that most needs a concrete top-up
 * number for the demo) would size to `null` — see code review finding.
 */
function resolveEffectiveRate(
  sorted: AccountSummarySnapshot[],
  latest: AccountSummarySnapshot,
  currentEpochsRemaining: bigint
): bigint | null {
  if (latest.lockupRatePerEpoch > 0n) return latest.lockupRatePerEpoch;

  if (currentEpochsRemaining > 0n) {
    const derived = latest.availableFunds / currentEpochsRemaining;
    if (derived > 0n) return derived;
  }

  if (sorted.length >= 2) {
    const prev = sorted[sorted.length - 2];
    const epochDelta = latest.epoch - prev.epoch;
    const fundsDelta = prev.availableFunds - latest.availableFunds; // positive = declining
    if (epochDelta > 0n && fundsDelta > 0n) {
      const rate = fundsDelta / epochDelta;
      if (rate > 0n) return rate;
    }
  }

  return null;
}

function sizeTopUp(
  sorted: AccountSummarySnapshot[],
  forecast: ForecastResult,
  targetEpochs: bigint
): { suggestedTopUpAmount: bigint | null; targetEpochsAfterTopUp: bigint | null } {
  const latest = sorted[sorted.length - 1];
  const currentEpochsRemaining = forecast.estimatedEpochsRemaining;
  if (currentEpochsRemaining === null) {
    return { suggestedTopUpAmount: null, targetEpochsAfterTopUp: null };
  }

  const additionalEpochsNeeded = targetEpochs - currentEpochsRemaining;
  if (additionalEpochsNeeded <= 0n) {
    // Already at/above target — nothing to size.
    return { suggestedTopUpAmount: 0n, targetEpochsAfterTopUp: targetEpochs };
  }

  const effectiveRatePerEpoch = resolveEffectiveRate(sorted, latest, currentEpochsRemaining);
  if (effectiveRatePerEpoch === null) {
    return { suggestedTopUpAmount: null, targetEpochsAfterTopUp: targetEpochs };
  }

  return {
    suggestedTopUpAmount: additionalEpochsNeeded * effectiveRatePerEpoch,
    targetEpochsAfterTopUp: targetEpochs,
  };
}

/**
 * Pure decision core: no I/O, no SDK calls, no `PDPStatusChecker` dependency
 * injected here — the caller is expected to have already fetched the
 * `PDPStatusResult` (via `PDPStatusChecker.checkStatus`) and pass it in. This
 * keeps the function trivially unit-testable and matches the Phase 3 wiring
 * pattern: fetch real onchain state -> call this pure function -> execute
 * the resulting action for real.
 *
 * Band thresholds (against `percentOfBaseline`):
 *   - green:  percent >= greenThresholdPercent (default 70) — inclusive, so
 *             exactly 70% is green.
 *   - yellow: redThresholdPercent <= percent < greenThresholdPercent —
 *             exactly 30% is yellow (red is strictly less-than).
 *   - red:    percent < redThresholdPercent (default 30).
 *   - insufficient-data: forecast method is 'insufficient-data', or the
 *             baseline itself can't be resolved. Never collapses into green
 *             or red.
 *   - 'infinite' forecast method is always green, regardless of the raw
 *             percent math (an infinite/no-active-drain runway is the best
 *             possible outcome, so it short-circuits straight to green).
 *
 * Compound red-band rule (the demo's core "moment of decision"):
 *   - PDP 'verified'   -> aggressive 'top-up', sized to restore to
 *                         `aggressiveRestorePercent` (default 100%) of
 *                         baseline. The data is provably intact, so it's
 *                         worth fully re-funding.
 *   - PDP 'unverified' -> 'drop-dataset'. Do NOT propose a top-up: we will
 *                         not pay for storage that isn't verifiably intact.
 *   - PDP 'verifying'  -> treated as a cautious middle case, NOT the same as
 *                         unverified: the provider is inside its grace
 *                         window and may still submit a proof. We do not
 *                         commit to dropping the dataset (that would punish
 *                         a provider who is still within their allowed
 *                         window), and we do not top up either (we haven't
 *                         yet confirmed the data is intact). Action is
 *                         'hold-and-monitor', with the reason flagging this
 *                         explicitly as "pending, re-check next cycle" so a
 *                         demo/operator understands it isn't a final call.
 */
export function evaluate(
  accountHistory: AccountSummarySnapshot[],
  pdpStatus: PDPStatusResult,
  config: DecisionConfig = {}
): DecisionTrace {
  const greenThresholdPercent = config.greenThresholdPercent ?? DEFAULT_GREEN_THRESHOLD_PERCENT;
  const redThresholdPercent = config.redThresholdPercent ?? DEFAULT_RED_THRESHOLD_PERCENT;
  const aggressiveRestorePercent = config.aggressiveRestorePercent ?? DEFAULT_AGGRESSIVE_RESTORE_PERCENT;

  // Guard against a misconfigured DecisionConfig silently inverting band
  // semantics (e.g. green=30/red=80 would classify most accounts "green"
  // via the first `percent >= greenThresholdPercent` check, bypassing the
  // yellow/red compound decision entirely with no error) — see code review
  // finding. Fail loudly instead of producing the opposite of the intended
  // risk posture.
  if (
    greenThresholdPercent < 0 ||
    greenThresholdPercent > 100 ||
    redThresholdPercent < 0 ||
    redThresholdPercent > 100
  ) {
    throw new Error(
      `Invalid DecisionConfig: greenThresholdPercent (${greenThresholdPercent}) and redThresholdPercent (${redThresholdPercent}) must both be within 0-100.`
    );
  }
  if (greenThresholdPercent <= redThresholdPercent) {
    throw new Error(
      `Invalid DecisionConfig: greenThresholdPercent (${greenThresholdPercent}) must be greater than redThresholdPercent (${redThresholdPercent}).`
    );
  }

  const forecast = forecastRunway(accountHistory, { epochsPerDay: config.epochsPerDay });
  const sorted = sortByEpoch(accountHistory);
  const latest = sorted[sorted.length - 1];

  const thresholds = {
    greenPercent: greenThresholdPercent,
    redPercent: redThresholdPercent,
    aggressiveRestorePercent,
  };

  // --- 'infinite' short-circuits straight to green, unconditionally. ---
  if (forecast.method === 'infinite') {
    return {
      band: 'green',
      forecast,
      pdpStatus,
      action: 'none',
      reason:
        'Runway forecast is infinite (no active drain detected on the payment rail) — well within the green band. No action needed.',
      details: {
        baselineEpochs: resolveBaselineEpochs(latest, config),
        percentOfBaseline: null,
        estimatedEpochsRemaining: null,
        estimatedDaysRemaining: null,
        suggestedTopUpAmount: null,
        targetEpochsAfterTopUp: null,
        thresholds,
      },
    };
  }

  const baselineEpochs = resolveBaselineEpochs(latest, config);

  // --- insufficient-data forecast, OR an unusable baseline: distinct safe
  // "monitor, need more data" decision — never collapses into green or red. ---
  if (forecast.method === 'insufficient-data' || baselineEpochs === null) {
    const why =
      forecast.method === 'insufficient-data'
        ? 'not enough account history to produce a runway forecast yet'
        : 'no usable baseline/target runway could be resolved to measure the forecast against';
    return {
      band: 'insufficient-data',
      forecast,
      pdpStatus,
      action: 'hold-and-monitor',
      reason: `Cannot confidently place this account into a runway band: ${why}. Holding off on any top-up or drop decision and monitoring until the next cycle rather than guessing.`,
      details: {
        baselineEpochs,
        percentOfBaseline: null,
        estimatedEpochsRemaining: forecast.estimatedEpochsRemaining,
        estimatedDaysRemaining: forecast.estimatedDaysRemaining,
        suggestedTopUpAmount: null,
        targetEpochsAfterTopUp: null,
        thresholds,
      },
    };
  }

  // From here on: forecast.estimatedEpochsRemaining is a finite bigint
  // (method is 'lockup-rate' or 'observed-delta') and baselineEpochs is a
  // usable positive bigint.
  const epochsRemaining = forecast.estimatedEpochsRemaining as bigint;
  const percent = percentOfBaseline(epochsRemaining, baselineEpochs);
  const daysStr = fmtDays(forecast.estimatedDaysRemaining);
  const percentStr = fmtPercent(percent);

  // --- GREEN ---
  if (percent >= greenThresholdPercent) {
    return {
      band: 'green',
      forecast,
      pdpStatus,
      action: 'none',
      reason: `Runway forecast is in the green band (${percentStr} of baseline, ${daysStr} remaining), at or above the ${greenThresholdPercent}% threshold. No action needed.`,
      details: {
        baselineEpochs,
        percentOfBaseline: percent,
        estimatedEpochsRemaining: epochsRemaining,
        estimatedDaysRemaining: forecast.estimatedDaysRemaining,
        suggestedTopUpAmount: null,
        targetEpochsAfterTopUp: null,
        thresholds,
      },
    };
  }

  // --- YELLOW ---
  if (percent >= redThresholdPercent) {
    const targetEpochs = epochsForPercent(baselineEpochs, greenThresholdPercent);
    const { suggestedTopUpAmount, targetEpochsAfterTopUp } = sizeTopUp(sorted, forecast, targetEpochs);
    const amountStr = fmtTopUpAmount(suggestedTopUpAmount);
    return {
      band: 'yellow',
      forecast,
      pdpStatus,
      action: 'top-up',
      reason: `Runway forecast is in the yellow band (${percentStr} of baseline, ${daysStr} remaining), between the ${redThresholdPercent}% and ${greenThresholdPercent}% thresholds. Proposing a conservative top-up of ${amountStr} to restore runway back to the ${greenThresholdPercent}% (green) threshold.`,
      details: {
        baselineEpochs,
        percentOfBaseline: percent,
        estimatedEpochsRemaining: epochsRemaining,
        estimatedDaysRemaining: forecast.estimatedDaysRemaining,
        suggestedTopUpAmount,
        targetEpochsAfterTopUp,
        thresholds,
      },
    };
  }

  // --- RED: the compound rule. ---
  if (pdpStatus.status === 'verified') {
    const targetEpochs = epochsForPercent(baselineEpochs, aggressiveRestorePercent);
    const { suggestedTopUpAmount, targetEpochsAfterTopUp } = sizeTopUp(sorted, forecast, targetEpochs);
    const amountStr = fmtTopUpAmount(suggestedTopUpAmount);
    return {
      band: 'red',
      forecast,
      pdpStatus,
      action: 'top-up',
      reason: `Runway forecast is in the red band (${percentStr} of baseline, ${daysStr} remaining) — below the ${redThresholdPercent}% threshold — but PDP proof for data set ${pdpStatus.dataSetId} is verified (last proven at epoch ${pdpStatus.lastProvenEpoch}, current epoch ${pdpStatus.currentEpoch}). The data is provably intact, so proposing an aggressive top-up of ${amountStr} to restore runway to ${aggressiveRestorePercent}% of baseline.`,
      details: {
        baselineEpochs,
        percentOfBaseline: percent,
        estimatedEpochsRemaining: epochsRemaining,
        estimatedDaysRemaining: forecast.estimatedDaysRemaining,
        suggestedTopUpAmount,
        targetEpochsAfterTopUp,
        thresholds,
      },
    };
  }

  if (pdpStatus.status === 'verifying') {
    return {
      band: 'red',
      forecast,
      pdpStatus,
      action: 'hold-and-monitor',
      reason: `Runway forecast is in the red band (${percentStr} of baseline, ${daysStr} remaining) and PDP proof for data set ${pdpStatus.dataSetId} is in its grace window (currently verifying: challenge due at epoch ${pdpStatus.nextChallengeEpoch}, current epoch ${pdpStatus.currentEpoch}) — the provider has not yet missed its proving window. Holding payment without committing to a top-up or a drop; will re-check PDP status next cycle before deciding.`,
      details: {
        baselineEpochs,
        percentOfBaseline: percent,
        estimatedEpochsRemaining: epochsRemaining,
        estimatedDaysRemaining: forecast.estimatedDaysRemaining,
        suggestedTopUpAmount: null,
        targetEpochsAfterTopUp: null,
        thresholds,
      },
    };
  }

  // pdpStatus.status === 'unverified'
  return {
    band: 'red',
    forecast,
    pdpStatus,
    action: 'drop-dataset',
    reason: `Runway forecast is in the red band (${percentStr} of baseline, ${daysStr} remaining) and PDP proof for data set ${pdpStatus.dataSetId} is unverified (last proven epoch: ${pdpStatus.lastProvenEpoch ?? 'never'}, missed challenge due at epoch ${pdpStatus.nextChallengeEpoch ?? 'unknown'}, current epoch ${pdpStatus.currentEpoch}) — holding payment and dropping this data set rather than paying for storage that isn't verifiably intact.`,
    details: {
      baselineEpochs,
      percentOfBaseline: percent,
      estimatedEpochsRemaining: epochsRemaining,
      estimatedDaysRemaining: forecast.estimatedDaysRemaining,
      suggestedTopUpAmount: null,
      targetEpochsAfterTopUp: null,
      thresholds,
    },
  };
}
