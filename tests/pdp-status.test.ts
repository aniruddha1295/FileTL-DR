import { describe, expect, it, vi } from 'vitest';
import {
  CHALLENGE_GRACE_EPOCHS,
  MockPDPStatusChecker,
  RealPDPStatusChecker,
  type RealPDPStatusCheckerDeps,
} from '../src/onchain/pdp-status.js';

/** Fake `Client` — RealPDPStatusChecker never inspects it directly, it just forwards it to the injected deps. */
const fakeClient = {} as ConstructorParameters<typeof RealPDPStatusChecker>[0];

function makeDeps(overrides: {
  nextChallengeEpoch?: bigint | null | (() => Promise<bigint | null>);
  lastProvenEpochRaw?: bigint | (() => Promise<bigint>);
  onNextChallengeEpochError?: Error;
  onLastProvenEpochError?: Error;
}): RealPDPStatusCheckerDeps {
  const getNextChallengeEpoch = vi.fn(async () => {
    if (overrides.onNextChallengeEpochError) {
      throw overrides.onNextChallengeEpochError;
    }
    const v = overrides.nextChallengeEpoch;
    return typeof v === 'function' ? v() : (v ?? null);
  }) as unknown as RealPDPStatusCheckerDeps['getNextChallengeEpoch'];

  const getDataSetLastProvenEpoch = vi.fn(async () => {
    if (overrides.onLastProvenEpochError) {
      throw overrides.onLastProvenEpochError;
    }
    const v = overrides.lastProvenEpochRaw;
    return typeof v === 'function' ? v() : (v ?? 0n);
  });

  const getContract = vi.fn(() => ({
    read: { getDataSetLastProvenEpoch },
  })) as unknown as RealPDPStatusCheckerDeps['getContract'];

  return { getNextChallengeEpoch, getContract };
}

describe('MockPDPStatusChecker', () => {
  it('derives "verified" when proven and before next challenge epoch', async () => {
    const checker = new MockPDPStatusChecker();
    const dataSetId = 1n;
    checker.setState(dataSetId, { lastProvenEpoch: 100n, nextChallengeEpoch: 200n });

    const result = await checker.checkStatus(dataSetId, 150n);

    expect(result).toEqual({
      dataSetId,
      currentEpoch: 150n,
      lastProvenEpoch: 100n,
      nextChallengeEpoch: 200n,
      status: 'verified',
    });
  });

  it('derives "verifying" when at/past next challenge epoch but within grace window', async () => {
    const checker = new MockPDPStatusChecker();
    const dataSetId = 2n;
    checker.setState(dataSetId, { lastProvenEpoch: 100n, nextChallengeEpoch: 200n });

    // Exactly at the challenge epoch.
    const atChallenge = await checker.checkStatus(dataSetId, 200n);
    expect(atChallenge.status).toBe('verifying');

    // Within grace window past the challenge epoch.
    const withinGrace = await checker.checkStatus(dataSetId, 200n + CHALLENGE_GRACE_EPOCHS);
    expect(withinGrace.status).toBe('verifying');
  });

  it('derives "unverified" due to missed challenge (past grace window)', async () => {
    const checker = new MockPDPStatusChecker();
    const dataSetId = 3n;
    checker.setState(dataSetId, { lastProvenEpoch: 100n, nextChallengeEpoch: 200n });

    const result = await checker.checkStatus(dataSetId, 200n + CHALLENGE_GRACE_EPOCHS + 1n);

    expect(result.status).toBe('unverified');
  });

  it('derives "unverified" due to never-proven data set', async () => {
    const checker = new MockPDPStatusChecker();
    const dataSetId = 4n;
    checker.setState(dataSetId, { lastProvenEpoch: null, nextChallengeEpoch: 200n });

    const result = await checker.checkStatus(dataSetId, 50n);

    expect(result.status).toBe('unverified');
    expect(result.lastProvenEpoch).toBeNull();
  });

  it('setState drives a transition between calls (verified -> unverified)', async () => {
    const checker = new MockPDPStatusChecker();
    const dataSetId = 5n;

    checker.setState(dataSetId, { lastProvenEpoch: 100n, nextChallengeEpoch: 200n });
    const first = await checker.checkStatus(dataSetId, 150n);
    expect(first.status).toBe('verified');

    // Force a new state simulating a missed proving period, then advance
    // currentEpoch past the new deadline + grace window.
    checker.setState(dataSetId, { lastProvenEpoch: 100n, nextChallengeEpoch: 200n });
    const second = await checker.checkStatus(dataSetId, 200n + CHALLENGE_GRACE_EPOCHS + 1n);
    expect(second.status).toBe('unverified');
  });

  it('defaults an unknown dataSetId to unverified (never proven)', async () => {
    const checker = new MockPDPStatusChecker();
    const result = await checker.checkStatus(999n, 10n);
    expect(result.status).toBe('unverified');
    expect(result.lastProvenEpoch).toBeNull();
    expect(result.nextChallengeEpoch).toBeNull();
  });
});

describe('RealPDPStatusChecker', () => {
  it('derives "verified" from realistic mocked contract return values', async () => {
    const deps = makeDeps({ nextChallengeEpoch: 200n, lastProvenEpochRaw: 100n });
    const checker = new RealPDPStatusChecker(fakeClient, deps);
    const dataSetId = 1n;

    const result = await checker.checkStatus(dataSetId, 150n);

    expect(result).toEqual({
      dataSetId,
      currentEpoch: 150n,
      lastProvenEpoch: 100n,
      nextChallengeEpoch: 200n,
      status: 'verified',
    });
    expect(deps.getNextChallengeEpoch).toHaveBeenCalledWith(fakeClient, { dataSetId });
    expect(deps.getContract).toHaveBeenCalledWith({ client: fakeClient });
  });

  it('derives "unverified" when the contract reports "never proven" (0n sentinel)', async () => {
    const deps = makeDeps({ nextChallengeEpoch: 200n, lastProvenEpochRaw: 0n });
    const checker = new RealPDPStatusChecker(fakeClient, deps);

    const result = await checker.checkStatus(2n, 50n);

    expect(result.status).toBe('unverified');
    expect(result.lastProvenEpoch).toBeNull();
  });

  it('derives "unverified" from a missed challenge (past grace window)', async () => {
    const deps = makeDeps({ nextChallengeEpoch: 200n, lastProvenEpochRaw: 100n });
    const checker = new RealPDPStatusChecker(fakeClient, deps);

    const result = await checker.checkStatus(3n, 200n + CHALLENGE_GRACE_EPOCHS + 1n);

    expect(result.status).toBe('unverified');
  });

  it('propagates a thrown error from getNextChallengeEpoch with dataSetId context', async () => {
    const deps = makeDeps({ onNextChallengeEpochError: new Error('rpc boom') });
    const checker = new RealPDPStatusChecker(fakeClient, deps);

    await expect(checker.checkStatus(4n, 10n)).rejects.toThrow(
      /PDP status check failed for dataSetId 4.*rpc boom/,
    );
  });

  it('propagates a thrown error from the getDataSetLastProvenEpoch read with dataSetId context', async () => {
    const deps = makeDeps({ nextChallengeEpoch: 200n, onLastProvenEpochError: new Error('contract revert') });
    const checker = new RealPDPStatusChecker(fakeClient, deps);

    await expect(checker.checkStatus(5n, 10n)).rejects.toThrow(
      /PDP status check failed for dataSetId 5.*contract revert/,
    );
  });
});
