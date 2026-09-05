import type { AccountSummarySnapshot } from '../onchain/forecast.js';
import type { PDPStatusResult } from '../onchain/pdp-status.js';

/**
 * Named, on-demand scenarios for the dashboard's interactive controls
 * (src/ui/page.ts's buttons -> POST /simulate/:scenario -> here). Each
 * scenario is a realistic, internally-consistent AccountSummary + PDPStatus
 * pair that, when run through the REAL `evaluate()` decision engine
 * (src/decision-engine/index.ts), lands in the intended band/action — the
 * numbers aren't asserted to produce a result, they're picked to naturally
 * produce it, same discipline as src/demo/drain-scenario.ts.
 */
export type ScenarioName = 'healthy' | 'tight-verified' | 'tight-unverified';

export interface Scenario {
  label: string;
  history: AccountSummarySnapshot[];
  pdpStatus: PDPStatusResult;
}

const DATA_SET_ID = 1n;
const EPOCH = 5_000_000n;
const BASELINE = 1_000_000n; // grossCoverageInEpochs, held fixed as the 100% baseline — scaled so "days remaining" reads as a realistic multi-month runway rather than a fraction of a day

function snapshot(epochsRemaining: bigint, rate: bigint): AccountSummarySnapshot {
  return {
    funds: epochsRemaining * rate,
    availableFunds: epochsRemaining * rate,
    debt: 0n,
    lockupRatePerEpoch: rate,
    lockupRatePerMonth: rate * 2880n * 30n,
    totalLockup: 0n,
    totalFixedLockup: 0n,
    totalRateBasedLockup: epochsRemaining * rate,
    runwayInEpochs: epochsRemaining,
    grossCoverageInEpochs: BASELINE,
    epoch: EPOCH,
  };
}

export const SCENARIOS: Record<ScenarioName, Scenario> = {
  healthy: {
    label: 'Healthy account',
    history: [snapshot(950_000n, 10n)], // 95% of baseline -> green
    pdpStatus: {
      dataSetId: DATA_SET_ID,
      currentEpoch: EPOCH,
      lastProvenEpoch: EPOCH - 100n,
      nextChallengeEpoch: EPOCH + 5000n,
      status: 'verified',
    },
  },
  'tight-verified': {
    label: 'Tight budget, proof verified',
    history: [snapshot(150_000n, 10n)], // 15% of baseline -> red
    pdpStatus: {
      dataSetId: DATA_SET_ID,
      currentEpoch: EPOCH,
      lastProvenEpoch: EPOCH - 50n,
      nextChallengeEpoch: EPOCH + 5000n,
      status: 'verified',
    },
  },
  'tight-unverified': {
    label: 'Tight budget, proof unverified',
    history: [snapshot(150_000n, 10n)], // 15% of baseline -> red
    pdpStatus: {
      dataSetId: DATA_SET_ID,
      currentEpoch: EPOCH,
      lastProvenEpoch: null,
      nextChallengeEpoch: null,
      status: 'unverified',
    },
  },
};
