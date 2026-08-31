import { evaluate, type Band, type DecisionTrace } from '../decision-engine/index.js';
import type { AccountSummarySnapshot } from '../onchain/forecast.js';
import { MockPDPStatusChecker, type PDPStatus, type PDPStatusResult } from '../onchain/pdp-status.js';
import { executeDecision, type ActionExecutor, type ExecutedAction } from '../onchain/actions.js';

/**
 * Phase 4 / Track B — "Deterministic drain script".
 *
 * The rest of the demo (Phase 3) can optionally open with a REAL, live
 * `getAccountSummary()` read against testnet (see `src/onchain/check-account.ts`)
 * to prove "this is really talking to chain". But the controlled centerpiece
 * of the demo — walking the agent's account from green, through yellow, into
 * red, and watching the compound top-up/drop-dataset decision fire live in
 * front of a judge — cannot depend on real gas/RPC timing (flagged as a
 * mentor risk in docs/BUILD-PLAN.md: outages/latency/unpredictable
 * settlement could break a live-drain demo mid-presentation).
 *
 * So this module generates a fully synthetic, deterministic sequence of
 * `AccountSummarySnapshot`s instead. The numbers are NOT hardcoded band
 * labels — they are realistic account-state values (funds, availableFunds,
 * lockupRatePerEpoch, runwayInEpochs, grossCoverageInEpochs, epoch) sized so
 * that the REAL `forecastRunway`/`evaluate` pipeline classifies each step
 * into the expected band by actually doing the math, exactly as it would for
 * a live account. `assertSequenceCrossesAllBands` (called at the end of
 * `buildDrainSequence`) is the sanity check proving this: it runs the
 * generated sequence step-by-step through the real `evaluate()` (accumulating
 * history the same way the runner below does) and throws if the sequence
 * ever fails to visit all three of green/yellow/red band a live demo needs.
 */

export interface DrainSequenceConfig {
  /** Number of synthetic snapshots to generate. Default 9. Must be >= 5 to reliably carry enough resolution to visit green, yellow, AND red. */
  steps?: number;
  /**
   * The fixed "100% baseline" runway, in epochs, held constant across every
   * snapshot's `grossCoverageInEpochs` (per the task spec: baseline is fixed,
   * only funds/availableFunds decline against it). Default 1,000,000 epochs.
   */
  baselineEpochs?: bigint;
  /** Constant per-epoch drain rate applied across the whole sequence. Default 100n (base units/epoch). */
  lockupRatePerEpoch?: bigint;
}

const DEFAULT_STEPS = 9;
const DEFAULT_BASELINE_EPOCHS = 1_000_000n;
const DEFAULT_LOCKUP_RATE_PER_EPOCH = 100n;

// Percent-of-baseline schedule: starts comfortably in green (95%), ends deep
// in red (3%), decreasing linearly across `steps` points. Chosen with margin
// away from the 70% (green) and 30% (red) threshold boundaries at every
// interior point of the default 9-step schedule (95, 85, 72, 60, 48, 36, 24,
// 12, 3) so classification isn't sensitive to fixed-point rounding at a
// boundary.
const START_PERCENT = 95;
const END_PERCENT = 3;

// ~1 day per step at the codebase's standard 2880 epochs/day, so the epoch
// axis reads as a plausible short multi-day drain rather than an arbitrary
// counter.
const EPOCHS_PER_DAY = 2880n;
const START_EPOCH = 1_000_000n;

const MIN_STEPS_FOR_BAND_COVERAGE = 5;

function pdpStateFor(status: PDPStatus, currentEpoch: bigint): { lastProvenEpoch: bigint | null; nextChallengeEpoch: bigint | null } {
  switch (status) {
    case 'verified':
      // Proven recently, next challenge far in the future -> definitely 'verified'.
      return { lastProvenEpoch: currentEpoch > 10n ? currentEpoch - 10n : 0n, nextChallengeEpoch: currentEpoch + 1_000n };
    case 'verifying':
      // Past the challenge epoch but comfortably inside CHALLENGE_GRACE_EPOCHS (60).
      return {
        lastProvenEpoch: currentEpoch > 500n ? currentEpoch - 500n : 0n,
        nextChallengeEpoch: currentEpoch > 5n ? currentEpoch - 5n : 0n,
      };
    case 'unverified':
      // No proof on record at all -> definitely 'unverified', regardless of challenge scheduling.
      return { lastProvenEpoch: null, nextChallengeEpoch: null };
  }
}

/**
 * Runs the real decision engine over the generated sequence, accumulating
 * history exactly the way `runDrainScenario` does, and asserts that all
 * three demo-facing bands (green/yellow/red) are actually visited. A neutral,
 * always-`verified` PDP status is used here deliberately — this check is
 * only about the runway *band* math, not the red-band compound
 * top-up/drop-dataset branch (which `runDrainScenario` exercises
 * separately via `finalPdpStatus`).
 */
function assertSequenceCrossesAllBands(snapshots: AccountSummarySnapshot[]): void {
  const bandsSeen = new Set<Band>();

  for (let i = 0; i < snapshots.length; i++) {
    const history = snapshots.slice(0, i + 1);
    const currentEpoch = snapshots[i].epoch;
    const neutralPdp: PDPStatusResult = {
      dataSetId: 0n,
      currentEpoch,
      lastProvenEpoch: currentEpoch > 10n ? currentEpoch - 10n : 0n,
      nextChallengeEpoch: currentEpoch + 1_000_000n,
      status: 'verified',
    };
    const trace = evaluate(history, neutralPdp);
    bandsSeen.add(trace.band);
  }

  const required: Band[] = ['green', 'yellow', 'red'];
  const missing = required.filter((b) => !bandsSeen.has(b));
  if (missing.length > 0) {
    throw new Error(
      `buildDrainSequence sanity check failed: the generated sequence never reached band(s) [${missing.join(
        ', '
      )}] when run through the real evaluate(). Bands actually seen: [${[...bandsSeen].join(', ')}]. ` +
        'This would break the "forced scarcity" demo premise — widen the percent schedule or increase steps.'
    );
  }
}

/**
 * Generates a deterministic, internally-consistent sequence of synthetic
 * `AccountSummarySnapshot`s walking realistically from the green band,
 * through yellow, into red.
 *
 * Internal consistency (so the real `forecastRunway` lockup-rate method
 * — not a fallback/insufficient-data path — drives every step):
 *   - `lockupRatePerEpoch` is a constant, positive rate across all steps.
 *   - `availableFunds = epochsRemaining * lockupRatePerEpoch` and
 *     `runwayInEpochs = epochsRemaining`, so `forecastRunway`'s own
 *     `availableFunds / lockupRatePerEpoch` sanity cross-check agrees
 *     exactly with the on-chain-reported `runwayInEpochs` (no
 *     "wildlyDisagree" fallback triggered, confidence stays 'high').
 *   - `grossCoverageInEpochs` (the band-percentage baseline) is held fixed
 *     at `baselineEpochs` across every step, per spec.
 *   - `epoch` strictly increases step-to-step (~1 day per step).
 *
 * See `assertSequenceCrossesAllBands` above — called unconditionally at the
 * end of this function — for the actual proof (via the real `evaluate()`)
 * that this produces green -> yellow -> red rather than an assumption.
 */
export function buildDrainSequence(config: DrainSequenceConfig = {}): AccountSummarySnapshot[] {
  const steps = config.steps ?? DEFAULT_STEPS;
  if (!Number.isInteger(steps) || steps < MIN_STEPS_FOR_BAND_COVERAGE) {
    throw new Error(
      `buildDrainSequence requires an integer steps >= ${MIN_STEPS_FOR_BAND_COVERAGE} to reliably visit green/yellow/red (got ${steps}).`
    );
  }
  const baselineEpochs = config.baselineEpochs ?? DEFAULT_BASELINE_EPOCHS;
  if (baselineEpochs <= 0n) {
    throw new Error(`buildDrainSequence requires a positive baselineEpochs (got ${baselineEpochs}).`);
  }
  const lockupRatePerEpoch = config.lockupRatePerEpoch ?? DEFAULT_LOCKUP_RATE_PER_EPOCH;
  if (lockupRatePerEpoch <= 0n) {
    throw new Error(`buildDrainSequence requires a positive lockupRatePerEpoch (got ${lockupRatePerEpoch}).`);
  }

  const snapshots: AccountSummarySnapshot[] = [];

  for (let i = 0; i < steps; i++) {
    const percent = START_PERCENT - (i * (START_PERCENT - END_PERCENT)) / (steps - 1);
    // Fixed-point to 2 decimal places (matches the decision engine's own
    // `percentOfBaseline`/`epochsForPercent` convention), then derive an
    // exact epochsRemaining via bigint math — no floats leak into the
    // account-state numbers themselves.
    const percentScaled = BigInt(Math.round(percent * 100)); // e.g. 7200 = 72.00%
    const epochsRemaining = (baselineEpochs * percentScaled) / 10000n;
    const availableFunds = epochsRemaining * lockupRatePerEpoch;
    const epoch = START_EPOCH + BigInt(i) * EPOCHS_PER_DAY;

    snapshots.push({
      funds: availableFunds,
      availableFunds,
      debt: 0n,
      lockupRatePerEpoch,
      lockupRatePerMonth: lockupRatePerEpoch * EPOCHS_PER_DAY * 30n,
      totalLockup: availableFunds,
      totalFixedLockup: 0n,
      totalRateBasedLockup: availableFunds,
      runwayInEpochs: epochsRemaining,
      grossCoverageInEpochs: baselineEpochs,
      epoch,
    });
  }

  assertSequenceCrossesAllBands(snapshots);

  return snapshots;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DrainScenarioOptions {
  /** Data set id the scenario is driving through top-up/drop decisions. Default 1n. */
  dataSetId?: bigint;
  /**
   * Which branch of the red-band compound decision the climax (final step)
   * demonstrates. Default 'unverified' — the drop-dataset branch, the most
   * important/differentiating decision the agent makes ("we will not pay for
   * storage that isn't verifiably intact").
   */
  finalPdpStatus?: PDPStatus;
  /** Pause between steps, in ms, so a live narrated demo has time to talk over each transition. Default 1500. Pass 0 in tests for instant execution. */
  stepDelayMs?: number;
  /** Called once per step, after that step's action has been executed, with the accumulating history, the step's trace, the executed action, and the total step count (so callers can render "step N/total" without duplicating buildDrainSequence's step count). */
  onStep?: (history: AccountSummarySnapshot[], trace: DecisionTrace, executed: ExecutedAction, totalSteps: number) => void;
  /** Forwarded to `buildDrainSequence` — lets a caller control step count/baseline/rate instead of always getting the defaults. */
  sequenceConfig?: DrainSequenceConfig;
}

const DEFAULT_STEP_DELAY_MS = 1500;

/**
 * Drives `executor` through the deterministic drain sequence from
 * `buildDrainSequence`, calling the real `evaluate()` and `executeDecision()`
 * once per step with the FULL accumulated history so far (both
 * `forecastRunway` and `evaluate` are designed to take the whole history
 * array on every call, not just the latest snapshot).
 *
 * Every step except the final one uses a 'verified' PDP status internally
 * (so earlier red-band steps, if any occur before the climax, show the
 * aggressive top-up branch rather than pre-empting the demo's climax). Only
 * on the FINAL step — by construction deep in the red band — is the mock PDP
 * checker's state set to reflect `options.finalPdpStatus`, so the intended
 * compound-decision branch fires exactly at the climax.
 */
export async function runDrainScenario(
  executor: ActionExecutor,
  options: DrainScenarioOptions = {}
): Promise<DecisionTrace[]> {
  const dataSetId = options.dataSetId ?? 1n;
  const finalPdpStatus = options.finalPdpStatus ?? 'unverified';
  const stepDelayMs = options.stepDelayMs ?? DEFAULT_STEP_DELAY_MS;

  const sequence = buildDrainSequence(options.sequenceConfig);
  const pdpChecker = new MockPDPStatusChecker();
  const history: AccountSummarySnapshot[] = [];
  const traces: DecisionTrace[] = [];

  for (let i = 0; i < sequence.length; i++) {
    const snapshot = sequence[i];
    history.push(snapshot);
    const isFinal = i === sequence.length - 1;

    pdpChecker.setState(dataSetId, pdpStateFor(isFinal ? finalPdpStatus : 'verified', snapshot.epoch));
    const pdpStatus = await pdpChecker.checkStatus(dataSetId, snapshot.epoch);

    const trace = evaluate(history, pdpStatus);
    const executed = await executeDecision(executor, trace, dataSetId);

    traces.push(trace);
    options.onStep?.([...history], trace, executed, sequence.length);

    if (!isFinal) {
      await sleep(stepDelayMs);
    }
  }

  return traces;
}
