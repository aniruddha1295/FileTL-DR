import type { DecisionTrace } from '../decision-engine/index.js';
import type { ExecutedAction } from '../onchain/actions.js';

/**
 * A real, on-chain-verified run of the red-band compound decision, captured
 * on Filecoin calibration testnet on 2026-09-05 (see
 * `src/onchain/live-decision-run.ts`, and docs/BUILD-PLAN.md for narrative
 * context). Unlike `src/demo/scenarios.ts` (synthetic AccountSummary/PDPStatus
 * fixtures fed through the real `evaluate()`), every number here — the
 * account state, the PDP proof reads, the tx hash and confirmed block — came
 * from a real read or a real submitted transaction against calibration.
 *
 * Two real decisions:
 *  1. dataSetId 33859 (freshly created for this run, proven immediately) —
 *     evaluated against an explicit long-horizon (~5yr) `targetRunwayEpochs`
 *     so the real ~334-day runway a small testnet deposit buys reads as 18%
 *     of that target: red band. PDP verified -> aggressive top-up, executed
 *     for real (deposit tx 0x814b84c3..., confirmed calibration block
 *     4043404).
 *  2. dataSetId 32848 (the dataset from the 2026-09-02 `live-verify.ts` run,
 *     since terminated) — a live `RealPDPStatusChecker` read against the
 *     same account state genuinely returns 'unverified' (its proof aged past
 *     its challenge window after termination, no live faking involved): red
 *     band + unverified PDP -> drop-dataset. Not re-executed — the dataset
 *     is already terminated, so calling terminateService again would just
 *     fail against a non-live dataset; the `executed` field says so.
 *
 * The dashboard's "Live Verified Run" button (src/ui/page.ts) replays these
 * two steps. Real tx hashes render as real, clickable calibration Filfox
 * links via the existing `isRealTxHash` check in src/ui/page.ts — nothing
 * dashboard-side needed to change to make that happen.
 */
export interface LiveRunStep {
  label: string;
  trace: DecisionTrace;
  executed: ExecutedAction;
}

const TOP_UP_TX_HASH = '0x814b84c3fafc5581a904cf24280219bde22c1937357f8cf3ffe336ddcdb1085f' as const;

export const LIVE_RUN_META = {
  generatedAt: '2026-09-05T17:16:26.463Z',
  walletAddress: '0x044c40FBC017C74273eF402655391D4372Cf715e' as const,
  freshDataSetId: 33859n,
  topUpConfirmedBlock: 4043404n,
};

export const LIVE_RUN_STEPS: LiveRunStep[] = [
  {
    label: 'Real red band, verified PDP -> aggressive top-up',
    trace: {
      band: 'red',
      forecast: {
        estimatedEpochsRemaining: 963357n,
        estimatedDaysRemaining: 334.49895833333335,
        method: 'lockup-rate',
        confidence: 'high',
      },
      pdpStatus: {
        dataSetId: 33859n,
        currentEpoch: 4043400n,
        lastProvenEpoch: 4043400n,
        nextChallengeEpoch: null,
        status: 'verified',
      },
      action: 'top-up',
      reason:
        'Runway forecast is in the red band (18.3% of baseline, ~334.5 days remaining) — below the 30% threshold — but PDP proof for data set 33859 is verified (last proven at epoch 4043400, current epoch 4043400). The data is provably intact, so proposing an aggressive top-up of 1217004169594291890 base units to restore runway to 35% of baseline.',
      details: {
        baselineEpochs: 5_256_000n,
        percentOfBaseline: 18.32,
        estimatedEpochsRemaining: 963357n,
        estimatedDaysRemaining: 334.49895833333335,
        suggestedTopUpAmount: 1217004169594291890n,
        targetEpochsAfterTopUp: 1839600n,
        thresholds: { greenPercent: 70, redPercent: 30, aggressiveRestorePercent: 35 },
      },
    },
    executed: {
      kind: 'top-up',
      txHash: TOP_UP_TX_HASH,
      amount: 1217004169594291890n,
    },
  },
  {
    label: 'Real red band, unverified PDP -> drop-dataset (decision only; dataset already terminated)',
    trace: {
      band: 'red',
      forecast: {
        estimatedEpochsRemaining: 963357n,
        estimatedDaysRemaining: 334.49895833333335,
        method: 'lockup-rate',
        confidence: 'high',
      },
      pdpStatus: {
        dataSetId: 32848n,
        currentEpoch: 4043400n,
        lastProvenEpoch: 4033908n,
        nextChallengeEpoch: 4034138n,
        status: 'unverified',
      },
      action: 'drop-dataset',
      reason:
        'Runway forecast is in the red band (18.3% of baseline, ~334.5 days remaining) and PDP proof for data set 32848 is unverified (last proven epoch: 4033908, missed challenge due at epoch 4034138, current epoch 4043400) — holding payment and dropping this data set rather than paying for storage that isn\'t verifiably intact.',
      details: {
        baselineEpochs: 5_256_000n,
        percentOfBaseline: 18.32,
        estimatedEpochsRemaining: 963357n,
        estimatedDaysRemaining: 334.49895833333335,
        suggestedTopUpAmount: null,
        targetEpochsAfterTopUp: null,
        thresholds: { greenPercent: 70, redPercent: 30, aggressiveRestorePercent: 35 },
      },
    },
    executed: {
      kind: 'no-op',
      reason:
        'Real decision engine chose drop-dataset for real (dataSetId 32848, live PDP read: unverified) but this dataset was already terminated in the 2026-09-02 live-verify run — not re-executing terminateService against an already-terminated dataset.',
    },
  },
];
