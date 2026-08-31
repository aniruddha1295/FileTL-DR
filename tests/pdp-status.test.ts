import { describe, expect, it } from 'vitest';
import { CHALLENGE_GRACE_EPOCHS, MockPDPStatusChecker } from '../src/onchain/pdp-status.js';

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
