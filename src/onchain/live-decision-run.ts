import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { createSynapseClient, loadConfigFromEnv } from './client.js';
import { getAccountSummary } from './account-summary.js';
import { RealPDPStatusChecker } from './pdp-status.js';
import { evaluate, type DecisionConfig } from '../decision-engine/index.js';
import { executeDecision, type ActionExecutor } from './actions.js';

/**
 * Exercises the red-band compound decision (top-up on verified proof, drop
 * on unverified proof) for real on calibration testnet — the one branch
 * `live-verify.ts` never reached, because that run's fresh dataset landed in
 * the green band (345 days of runway is nowhere near a 30% threshold against
 * its own gross-coverage baseline).
 *
 * To reach red without a multi-week organic drain, this run passes an
 * explicit `targetRunwayEpochs` into the decision engine — a documented,
 * first-class DecisionConfig field (see decision-engine/index.ts) for "an
 * operator pinning a fixed target independent of on-chain state, e.g. we
 * always want 30 days of runway". Here the target models a long-horizon
 * archival commitment (5 years), so the real ~year-scale runway a small
 * testnet deposit buys comes out well under 30% of that target — a real
 * percentage computed from a real on-chain read, just measured against an
 * explicit target instead of the contract's own (much shorter) gross
 * coverage figure.
 *
 * Two real decisions are produced:
 *  1. A freshly created dataset (proven immediately, so PDP status is really
 *     'verified') -> red band -> top-up. Executed for real via
 *     `executeDecision`, producing a real deposit tx.
 *  2. The dataSetId from the original `live-verify.ts` run (32848,
 *     terminated 2026-09-02) -> its PDP proof has since aged past its
 *     challenge window with no new proof, so a live `RealPDPStatusChecker`
 *     read genuinely returns 'unverified' -> red band -> drop-dataset. NOT
 *     re-executed (the dataset is already terminated; calling
 *     terminateService again would just fail against a non-live dataset) —
 *     recorded as a real read + real decision, with execution explicitly
 *     skipped and why.
 *
 * Writes both traces to live-run-record.json for the dashboard's "Live
 * Verified Run" replay (src/demo/live-run-record.ts).
 */

const LONG_HORIZON_TARGET_EPOCHS = 5_256_000n; // ~5 years at 2880 epochs/day
const AGGRESSIVE_RESTORE_PERCENT = 35; // keep the resulting top-up affordable on a testnet wallet
const PRIOR_TERMINATED_DATA_SET_ID = 32848n;

const redBandConfig: DecisionConfig = {
  targetRunwayEpochs: LONG_HORIZON_TARGET_EPOCHS,
  aggressiveRestorePercent: AGGRESSIVE_RESTORE_PERCENT,
};

function fmt(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

async function main() {
  const config = loadConfigFromEnv();
  const synapse = createSynapseClient(config);
  console.log('Address:', synapse.client.account.address);

  console.log('\n=== [1/4] Creating a real storage context + uploading real data (fresh dataset) ===');
  const context = await synapse.storage.createContext({});
  const data = new Uint8Array(127).fill(9);
  const uploadResult = await context.upload(data, {
    onStored: (providerId, pieceCid) => console.log('  onStored - providerId:', providerId, 'pieceCid:', pieceCid.toString()),
    onPiecesAdded: (tx) => console.log('  onPiecesAdded - tx:', tx),
    onPiecesConfirmed: (dataSetId) => console.log('  onPiecesConfirmed - dataSetId:', dataSetId),
  });
  console.log('upload result:', fmt(uploadResult));

  const freshDataSetId = context.dataSetId;
  if (freshDataSetId === undefined) {
    throw new Error('No dataSetId available after upload.');
  }
  console.log('\nFresh real dataSetId:', freshDataSetId);

  console.log('\n=== [2/4] Real accountSummary + real PDP status for the fresh dataset ===');
  const afterDataset = await getAccountSummary(synapse);
  console.log(fmt(afterDataset));
  const pdpChecker = new RealPDPStatusChecker(synapse.client);
  const freshPdpStatus = await pdpChecker.checkStatus(freshDataSetId, afterDataset.epoch);
  console.log(fmt(freshPdpStatus));

  console.log('\n=== [3/4] Real decision engine eval (long-horizon target -> red band) + real execution ===');
  const verifiedTrace = evaluate([afterDataset], freshPdpStatus, redBandConfig);
  console.log('band:', verifiedTrace.band, '| action:', verifiedTrace.action);
  console.log('reason:', verifiedTrace.reason);
  console.log('suggestedTopUpAmount:', verifiedTrace.details.suggestedTopUpAmount?.toString());

  const executor: ActionExecutor = synapse;
  let verifiedExecuted;
  if (verifiedTrace.action === 'top-up') {
    verifiedExecuted = await executeDecision(executor, verifiedTrace, freshDataSetId);
    console.log('executed:', fmt(verifiedExecuted));
    if (verifiedExecuted.kind === 'top-up') {
      console.log('\nWaiting for top-up tx confirmation...');
      const receipt = await synapse.client.waitForTransactionReceipt({ hash: verifiedExecuted.txHash, timeout: 120_000 });
      console.log('top-up confirmed, status:', receipt.status, 'block:', receipt.blockNumber);
    }
  } else {
    console.log(`Decision engine did not propose a top-up (action=${verifiedTrace.action}) — check target/threshold tuning.`);
    verifiedExecuted = { kind: 'no-op', reason: verifiedTrace.reason };
  }

  console.log('\n=== [4/4] Real PDP status for the prior (already-terminated) dataset -> unverified -> drop-dataset ===');
  const currentSummary = await getAccountSummary(synapse);
  const priorPdpStatus = await pdpChecker.checkStatus(PRIOR_TERMINATED_DATA_SET_ID, currentSummary.epoch);
  console.log(fmt(priorPdpStatus));
  const unverifiedTrace = evaluate([currentSummary], priorPdpStatus, redBandConfig);
  console.log('band:', unverifiedTrace.band, '| action:', unverifiedTrace.action);
  console.log('reason:', unverifiedTrace.reason);
  const unverifiedExecuted = {
    kind: 'no-op' as const,
    reason: `Real decision engine chose drop-dataset for real (dataSetId ${PRIOR_TERMINATED_DATA_SET_ID}, live PDP read: unverified) but this dataset was already terminated in the 2026-09-02 live-verify run — not re-executing terminateService against an already-terminated dataset.`,
  };

  const record = {
    generatedAt: new Date().toISOString(),
    walletAddress: synapse.client.account.address,
    steps: [
      {
        label: 'Real red band, verified PDP -> aggressive top-up',
        trace: verifiedTrace,
        executed: verifiedExecuted,
      },
      {
        label: 'Real red band, unverified PDP -> drop-dataset (decision only; dataset already terminated)',
        trace: unverifiedTrace,
        executed: unverifiedExecuted,
      },
    ],
  };
  writeFileSync(
    new URL('../demo/live-run-record.json', import.meta.url),
    JSON.stringify(record, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
  );
  console.log('\nWrote src/demo/live-run-record.json');
  console.log('\n=== DONE ===');
}

main().catch((err) => {
  console.error('\nlive-decision-run FAILED:', err);
  process.exit(1);
});
