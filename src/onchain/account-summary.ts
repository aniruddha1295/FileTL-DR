import type { Synapse } from '@filoz/synapse-sdk';

/**
 * Real shape of Synapse.payments.accountSummary(), verified against
 * @filoz/synapse-core get-account-summary.d.ts (v0.8.1) — not guessed.
 */
export interface AccountSummary {
  funds: bigint;
  availableFunds: bigint;
  debt: bigint;
  lockupRatePerEpoch: bigint;
  lockupRatePerMonth: bigint;
  totalLockup: bigint;
  totalFixedLockup: bigint;
  totalRateBasedLockup: bigint;
  runwayInEpochs: bigint;
  grossCoverageInEpochs: bigint;
  epoch: bigint;
}

export async function getAccountSummary(synapse: Synapse): Promise<AccountSummary> {
  return synapse.payments.accountSummary();
}
