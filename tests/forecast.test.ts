import { describe, expect, it } from 'vitest';
import { forecastRunway, MAX_UINT256, type AccountSummarySnapshot } from '../src/onchain/forecast.js';

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

describe('forecastRunway', () => {
  it('trusts the contract runwayInEpochs when lockupRatePerEpoch is nonzero (lockup-rate path)', () => {
    const snapshot = makeSnapshot({
      epoch: 1000n,
      availableFunds: 500_000n,
      lockupRatePerEpoch: 100n,
      runwayInEpochs: 5000n,
    });

    const result = forecastRunway([snapshot]);

    expect(result.method).toBe('lockup-rate');
    expect(result.confidence).toBe('high');
    expect(result.estimatedEpochsRemaining).toBe(5000n);
    expect(result.estimatedDaysRemaining).toBeCloseTo(5000 / 2880, 6);
  });

  it('falls back to observed-delta when lockupRatePerEpoch is 0 (and runway is not the sentinel) but availableFunds is declining', () => {
    // runwayInEpochs is deliberately NOT the sentinel here: spend is
    // happening outside a tracked rail, so the contract isn't vouching for
    // "no drain" via the sentinel — we must derive our own estimate.
    const history: AccountSummarySnapshot[] = [
      makeSnapshot({ epoch: 100n, availableFunds: 1_000_000n, lockupRatePerEpoch: 0n, runwayInEpochs: 0n }),
      makeSnapshot({ epoch: 200n, availableFunds: 900_000n, lockupRatePerEpoch: 0n, runwayInEpochs: 0n }),
      makeSnapshot({ epoch: 300n, availableFunds: 800_000n, lockupRatePerEpoch: 0n, runwayInEpochs: 0n }),
    ];

    const result = forecastRunway(history);

    // most recent consecutive pair: epoch 200->300, funds 900_000 -> 800_000
    // rate = (900_000 - 800_000) / (300 - 200) = 1000 per epoch
    // remaining = 800_000 / 1000 = 800 epochs
    expect(result.method).toBe('observed-delta');
    expect(result.confidence).toBe('low');
    expect(result.estimatedEpochsRemaining).toBe(800n);
    expect(result.estimatedDaysRemaining).toBeCloseTo(800 / 2880, 6);
  });

  it('returns insufficient-data for a single snapshot with rate=0 and a non-sentinel runway (no history to derive a delta from)', () => {
    const snapshot = makeSnapshot({
      epoch: 42n,
      availableFunds: 100n,
      lockupRatePerEpoch: 0n,
      runwayInEpochs: 0n, // not the sentinel, so we can't assume "infinite"
    });

    const result = forecastRunway([snapshot]);
    expect(result.method).toBe('insufficient-data');
    expect(result.confidence).toBe('none');
    expect(result.estimatedEpochsRemaining).toBeNull();
    expect(result.estimatedDaysRemaining).toBeNull();
  });

  it('returns insufficient-data for an empty history', () => {
    const result = forecastRunway([]);
    expect(result.method).toBe('insufficient-data');
    expect(result.confidence).toBe('none');
    expect(result.estimatedEpochsRemaining).toBeNull();
    expect(result.estimatedDaysRemaining).toBeNull();
  });

  it('treats the max-uint256 sentinel as infinite even if lockupRatePerEpoch were misreported', () => {
    const snapshot = makeSnapshot({
      epoch: 10n,
      availableFunds: 1_000n,
      lockupRatePerEpoch: 0n,
      runwayInEpochs: MAX_UINT256,
    });

    const result = forecastRunway([snapshot]);

    expect(result.method).toBe('infinite');
    expect(result.confidence).toBe('high');
    expect(result.estimatedEpochsRemaining).toBeNull();
    expect(result.estimatedDaysRemaining).toBeNull();
  });

  it('resolves observed-delta to infinite when funds are flat', () => {
    const history: AccountSummarySnapshot[] = [
      makeSnapshot({ epoch: 100n, availableFunds: 500_000n, lockupRatePerEpoch: 0n, runwayInEpochs: 0n }),
      makeSnapshot({ epoch: 200n, availableFunds: 500_000n, lockupRatePerEpoch: 0n, runwayInEpochs: 0n }),
    ];

    const result = forecastRunway(history);

    expect(result.method).toBe('infinite');
    expect(result.confidence).toBe('high');
    expect(result.estimatedEpochsRemaining).toBeNull();
    expect(result.estimatedDaysRemaining).toBeNull();
  });

  it('resolves observed-delta to infinite when funds are increasing', () => {
    const history: AccountSummarySnapshot[] = [
      makeSnapshot({ epoch: 100n, availableFunds: 500_000n, lockupRatePerEpoch: 0n, runwayInEpochs: 0n }),
      makeSnapshot({ epoch: 200n, availableFunds: 600_000n, lockupRatePerEpoch: 0n, runwayInEpochs: 0n }),
    ];

    const result = forecastRunway(history);

    expect(result.method).toBe('infinite');
    expect(result.confidence).toBe('high');
    expect(result.estimatedEpochsRemaining).toBeNull();
    expect(result.estimatedDaysRemaining).toBeNull();
  });

  it('treats the sentinel as infinite even when lockupRatePerEpoch is nonzero (inconsistent contract state)', () => {
    const snapshot = makeSnapshot({
      epoch: 5n,
      availableFunds: 1_000n,
      lockupRatePerEpoch: 1n, // nonzero rate alongside the sentinel — inconsistent state
      runwayInEpochs: MAX_UINT256,
    });

    const result = forecastRunway([snapshot]);

    expect(result.method).toBe('infinite');
    expect(result.confidence).toBe('high');
    expect(result.estimatedEpochsRemaining).toBeNull();
    expect(result.estimatedDaysRemaining).toBeNull();
  });

  it('falls back to the derived value when on-chain runwayInEpochs wildly disagrees with availableFunds/rate', () => {
    const snapshot = makeSnapshot({
      epoch: 20n,
      availableFunds: 500n,
      lockupRatePerEpoch: 5n, // derived = 500/5 = 100 epochs
      runwayInEpochs: 999_999n, // contract value wildly higher than derived — treat as stale
    });

    const result = forecastRunway([snapshot]);

    expect(result.method).toBe('lockup-rate');
    expect(result.confidence).toBe('low');
    expect(result.estimatedEpochsRemaining).toBe(100n);
  });

  it('trusts on-chain runwayInEpochs (high confidence) when it roughly agrees with the derived value', () => {
    const snapshot = makeSnapshot({
      epoch: 20n,
      availableFunds: 500n,
      lockupRatePerEpoch: 5n, // derived = 100 epochs
      runwayInEpochs: 110n, // close to derived, within the 2x tolerance
    });

    const result = forecastRunway([snapshot]);

    expect(result.method).toBe('lockup-rate');
    expect(result.confidence).toBe('high');
    expect(result.estimatedEpochsRemaining).toBe(110n);
  });

  it('respects a custom epochsPerDay option', () => {
    const snapshot = makeSnapshot({
      epoch: 1n,
      availableFunds: 10_000n,
      lockupRatePerEpoch: 10n,
      runwayInEpochs: 1000n,
    });

    const result = forecastRunway([snapshot], { epochsPerDay: 100n });

    expect(result.estimatedDaysRemaining).toBeCloseTo(10, 6);
  });
});
