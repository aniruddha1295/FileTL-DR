import { describe, expect, it } from 'vitest';
import { evaluate, type DecisionConfig } from '../src/decision-engine/index.js';
import { MAX_UINT256, type AccountSummarySnapshot } from '../src/onchain/forecast.js';
import type { PDPStatusResult } from '../src/onchain/pdp-status.js';

function makeSnapshot(overrides: Partial<AccountSummarySnapshot>): AccountSummarySnapshot {
  return {
    funds: 0n,
    availableFunds: 0n,
    debt: 0n,
    lockupRatePerEpoch: 0n,
    lockupRatePerMonth: 0n,
    totalLockup: 0n,
    totalFixedLockup: 0n,
    totalRateBasedLockup: 0n,
    runwayInEpochs: 0n,
    grossCoverageInEpochs: 0n,
    epoch: 0n,
    ...overrides,
  };
}

/** Builds a snapshot whose lockup-rate forecast agrees exactly (no fallback
 * disagreement) so `forecastRunway` reports `method: 'lockup-rate'` with
 * `estimatedEpochsRemaining === runwayInEpochs`. */
function makeLockupRateSnapshot(params: {
  epoch?: bigint;
  runwayInEpochs: bigint;
  grossCoverageInEpochs: bigint;
  ratePerEpoch?: bigint;
}): AccountSummarySnapshot {
  const rate = params.ratePerEpoch ?? 10n;
  return makeSnapshot({
    epoch: params.epoch ?? 1000n,
    lockupRatePerEpoch: rate,
    runwayInEpochs: params.runwayInEpochs,
    availableFunds: params.runwayInEpochs * rate,
    grossCoverageInEpochs: params.grossCoverageInEpochs,
  });
}

function makePdp(overrides: Partial<PDPStatusResult>): PDPStatusResult {
  return {
    dataSetId: 1n,
    currentEpoch: 1000n,
    lastProvenEpoch: 900n,
    nextChallengeEpoch: 1100n,
    status: 'verified',
    ...overrides,
  };
}

describe('decision-engine evaluate()', () => {
  describe('green band', () => {
    it('80% of baseline -> green, action none', () => {
      const history = [makeLockupRateSnapshot({ runwayInEpochs: 800n, grossCoverageInEpochs: 1000n })];
      const trace = evaluate(history, makePdp({ status: 'verified' }));

      expect(trace.band).toBe('green');
      expect(trace.action).toBe('none');
      expect(trace.details.percentOfBaseline).toBeCloseTo(80, 6);
      expect(trace.reason).toMatch(/green/i);
      expect(trace.reason).toMatch(/80\.0%/);
    });

    it('exactly 70% of baseline -> green (inclusive boundary)', () => {
      const history = [makeLockupRateSnapshot({ runwayInEpochs: 700n, grossCoverageInEpochs: 1000n })];
      const trace = evaluate(history, makePdp({ status: 'unverified' }));

      expect(trace.details.percentOfBaseline).toBeCloseTo(70, 6);
      expect(trace.band).toBe('green');
      expect(trace.action).toBe('none');
    });

    it('infinite forecast (max-uint256 sentinel) -> always green regardless of raw numbers', () => {
      const history = [
        makeSnapshot({
          epoch: 10n,
          lockupRatePerEpoch: 0n,
          runwayInEpochs: MAX_UINT256,
          grossCoverageInEpochs: MAX_UINT256,
        }),
      ];
      const trace = evaluate(history, makePdp({ status: 'unverified' }));

      expect(trace.forecast.method).toBe('infinite');
      expect(trace.band).toBe('green');
      expect(trace.action).toBe('none');
      expect(trace.reason).toMatch(/infinite/i);
    });

    it('insufficient-data forecast (empty history) -> NOT green, safe hold-and-monitor', () => {
      const trace = evaluate([], makePdp({ status: 'verified' }));

      expect(trace.forecast.method).toBe('insufficient-data');
      expect(trace.band).toBe('insufficient-data');
      expect(trace.band).not.toBe('green');
      expect(trace.action).toBe('hold-and-monitor');
      expect(trace.action).not.toBe('top-up');
      expect(trace.reason).toMatch(/insufficient|not enough/i);
    });

    it('unusable baseline (grossCoverageInEpochs = 0, no config override) -> insufficient-data, not green/red', () => {
      const history = [makeLockupRateSnapshot({ runwayInEpochs: 800n, grossCoverageInEpochs: 0n })];
      const trace = evaluate(history, makePdp({ status: 'verified' }));

      expect(trace.band).toBe('insufficient-data');
      expect(trace.action).toBe('hold-and-monitor');
      expect(trace.details.baselineEpochs).toBeNull();
    });
  });

  describe('yellow band', () => {
    it('50% of baseline -> yellow, top-up sized to reach the green threshold', () => {
      const history = [makeLockupRateSnapshot({ runwayInEpochs: 500n, grossCoverageInEpochs: 1000n, ratePerEpoch: 10n })];
      const trace = evaluate(history, makePdp({ status: 'verified' }));

      expect(trace.band).toBe('yellow');
      expect(trace.action).toBe('top-up');
      expect(trace.details.percentOfBaseline).toBeCloseTo(50, 6);
      // target = 70% of 1000 = 700 epochs; need +200 epochs * rate 10 = 2000
      expect(trace.details.targetEpochsAfterTopUp).toBe(700n);
      expect(trace.details.suggestedTopUpAmount).toBe(2000n);
      expect(trace.reason).toMatch(/yellow/i);
      expect(trace.reason).toMatch(/50\.0%/);
      expect(trace.reason).toMatch(/2000/);
    });

    it('exactly 30% of baseline -> yellow, not red (red is strictly below 30%)', () => {
      const history = [makeLockupRateSnapshot({ runwayInEpochs: 300n, grossCoverageInEpochs: 1000n })];
      const trace = evaluate(history, makePdp({ status: 'unverified' }));

      expect(trace.details.percentOfBaseline).toBeCloseTo(30, 6);
      expect(trace.band).toBe('yellow');
      expect(trace.action).toBe('top-up');
    });

    it('yellow top-up amount is sane: never negative, and moves account toward (not past, downward) the green threshold', () => {
      const history = [makeLockupRateSnapshot({ runwayInEpochs: 650n, grossCoverageInEpochs: 1000n, ratePerEpoch: 5n })];
      const trace = evaluate(history, makePdp({ status: 'verified' }));

      expect(trace.band).toBe('yellow');
      expect(trace.details.suggestedTopUpAmount).not.toBeNull();
      expect(trace.details.suggestedTopUpAmount! > 0n).toBe(true);
      // (700 - 650) * 5 = 250
      expect(trace.details.suggestedTopUpAmount).toBe(250n);
    });
  });

  describe('red band — the compound decision', () => {
    const redHistory = [makeLockupRateSnapshot({ runwayInEpochs: 200n, grossCoverageInEpochs: 1000n, ratePerEpoch: 10n })];

    it('red + PDP verified -> aggressive top-up (restores to 100% of baseline by default)', () => {
      const trace = evaluate(redHistory, makePdp({ status: 'verified', lastProvenEpoch: 950n, currentEpoch: 1000n }));

      expect(trace.band).toBe('red');
      expect(trace.action).toBe('top-up');
      expect(trace.action).not.toBe('drop-dataset');
      // target = 100% of 1000 = 1000 epochs; need +800 epochs * rate 10 = 8000
      expect(trace.details.targetEpochsAfterTopUp).toBe(1000n);
      expect(trace.details.suggestedTopUpAmount).toBe(8000n);
      expect(trace.reason).toMatch(/red/i);
      expect(trace.reason).toMatch(/verified/i);
      expect(trace.reason).toMatch(/20\.0%/);
    });

    it('red + PDP unverified -> drop-dataset, NOT top-up (the single most important behavior in the project)', () => {
      const pdp = makePdp({
        status: 'unverified',
        lastProvenEpoch: null,
        nextChallengeEpoch: 900n,
        currentEpoch: 1000n,
        dataSetId: 42n,
      });
      const trace = evaluate(redHistory, pdp);

      expect(trace.band).toBe('red');
      expect(trace.action).toBe('drop-dataset');
      expect(trace.action).not.toBe('top-up');
      expect(trace.details.suggestedTopUpAmount).toBeNull();

      // The reason string must actually justify the decision with concrete facts.
      expect(trace.reason).toMatch(/red/i);
      expect(trace.reason).toMatch(/unverified/i);
      expect(trace.reason).toMatch(/20\.0%/);
      expect(trace.reason).toMatch(/42/); // dataSetId referenced
      expect(trace.reason.toLowerCase()).toContain('drop');
      expect(trace.reason.toLowerCase()).toContain('hold');
    });

    it('red + PDP verifying (grace window) -> hold-and-monitor, neither top-up nor drop', () => {
      const pdp = makePdp({ status: 'verifying', nextChallengeEpoch: 990n, currentEpoch: 1000n, lastProvenEpoch: 900n });
      const trace = evaluate(redHistory, pdp);

      expect(trace.band).toBe('red');
      expect(trace.action).toBe('hold-and-monitor');
      expect(trace.action).not.toBe('top-up');
      expect(trace.action).not.toBe('drop-dataset');
      expect(trace.details.suggestedTopUpAmount).toBeNull();
      expect(trace.reason.toLowerCase()).toContain('grace');
      expect(trace.reason.toLowerCase()).toContain('re-check');
    });

    it('below 30% (e.g. 5%) with verified PDP still proposes a top-up, not a drop', () => {
      const history = [makeLockupRateSnapshot({ runwayInEpochs: 50n, grossCoverageInEpochs: 1000n, ratePerEpoch: 10n })];
      const trace = evaluate(history, makePdp({ status: 'verified' }));

      expect(trace.band).toBe('red');
      expect(trace.action).toBe('top-up');
    });
  });

  describe('config overrides', () => {
    it('respects a custom targetRunwayEpochs baseline instead of grossCoverageInEpochs', () => {
      const history = [
        makeLockupRateSnapshot({ runwayInEpochs: 400n, grossCoverageInEpochs: 999999n /* would be ~0% if used */ }),
      ];
      const config: DecisionConfig = { targetRunwayEpochs: 1000n };
      const trace = evaluate(history, makePdp({ status: 'verified' }), config);

      expect(trace.details.baselineEpochs).toBe(1000n);
      expect(trace.details.percentOfBaseline).toBeCloseTo(40, 6);
      expect(trace.band).toBe('yellow');
    });

    it('respects custom green/red threshold percents', () => {
      const history = [makeLockupRateSnapshot({ runwayInEpochs: 500n, grossCoverageInEpochs: 1000n })];
      const trace = evaluate(history, makePdp({ status: 'verified' }), {
        greenThresholdPercent: 40,
        redThresholdPercent: 10,
      });

      // 50% is now >= the (lowered) 40% green threshold.
      expect(trace.band).toBe('green');
      expect(trace.action).toBe('none');
    });
  });

  describe('trace shape', () => {
    it('always includes both the full ForecastResult and PDPStatusResult used', () => {
      const history = [makeLockupRateSnapshot({ runwayInEpochs: 800n, grossCoverageInEpochs: 1000n })];
      const pdp = makePdp({ status: 'verified' });
      const trace = evaluate(history, pdp);

      expect(trace.forecast).toBeDefined();
      expect(trace.forecast.method).toBe('lockup-rate');
      expect(trace.pdpStatus).toEqual(pdp);
    });
  });

  describe('code-review regression: top-up sizing when fully exhausted', () => {
    it('still sizes a concrete top-up when observed-delta forecast hits exactly 0 epochs remaining', () => {
      const history: AccountSummarySnapshot[] = [
        makeSnapshot({ epoch: 100n, availableFunds: 1000n, lockupRatePerEpoch: 0n, runwayInEpochs: 0n, grossCoverageInEpochs: 1000n }),
        makeSnapshot({ epoch: 200n, availableFunds: 0n, lockupRatePerEpoch: 0n, runwayInEpochs: 0n, grossCoverageInEpochs: 1000n }),
      ];
      const trace = evaluate(history, makePdp({ status: 'verified' }));

      expect(trace.band).toBe('red');
      expect(trace.action).toBe('top-up');
      // Falls back to the observed decline rate (1000 funds / 100 epochs = 10/epoch)
      // instead of returning null now that the account is fully exhausted.
      expect(trace.details.suggestedTopUpAmount).not.toBeNull();
      expect(trace.details.suggestedTopUpAmount).toBeGreaterThan(0n);
      expect(trace.reason).not.toContain('unknown base units');
    });
  });

  describe('code-review regression: epochsForPercent rounding at small baselines', () => {
    it('never proposes a 0-sized top-up when the true percent target falls between integer epochs', () => {
      // baseline=3, remaining=2 -> 66.66% (yellow, < 70% green threshold).
      // Floor-dividing 70% of 3 truncates to 2 (== current remaining), which
      // used to produce a self-contradictory "top-up of 0". Ceiling fixes it.
      const history = [makeLockupRateSnapshot({ runwayInEpochs: 2n, grossCoverageInEpochs: 3n, ratePerEpoch: 5n })];
      const trace = evaluate(history, makePdp({ status: 'verified' }));

      expect(trace.band).toBe('yellow');
      expect(trace.details.suggestedTopUpAmount).not.toBeNull();
      expect(trace.details.suggestedTopUpAmount!).toBeGreaterThan(0n);
      expect(trace.reason).not.toContain('top-up of 0');
    });
  });

  describe('code-review regression: null-safe reason narration', () => {
    it('unverified reason string never renders a literal "null" when nextChallengeEpoch is unset', () => {
      const history = [makeLockupRateSnapshot({ runwayInEpochs: 100n, grossCoverageInEpochs: 1000n })];
      const pdp = makePdp({ status: 'unverified', lastProvenEpoch: null, nextChallengeEpoch: null });
      const trace = evaluate(history, pdp);

      expect(trace.action).toBe('drop-dataset');
      expect(trace.reason).not.toMatch(/epoch null/);
      expect(trace.reason).toContain('unknown');
    });
  });

  describe('code-review regression: DecisionConfig validation', () => {
    it('throws when greenThresholdPercent <= redThresholdPercent instead of silently inverting band semantics', () => {
      const history = [makeLockupRateSnapshot({ runwayInEpochs: 500n, grossCoverageInEpochs: 1000n })];
      const badConfig: DecisionConfig = { greenThresholdPercent: 30, redThresholdPercent: 80 };

      expect(() => evaluate(history, makePdp({}), badConfig)).toThrow(/greenThresholdPercent/);
    });

    it('throws when a threshold is outside 0-100', () => {
      const history = [makeLockupRateSnapshot({ runwayInEpochs: 500n, grossCoverageInEpochs: 1000n })];
      expect(() => evaluate(history, makePdp({}), { greenThresholdPercent: 150 })).toThrow(/0-100/);
    });
  });
});
