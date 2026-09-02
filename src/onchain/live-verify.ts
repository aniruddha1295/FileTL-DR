import 'dotenv/config';
import { createSynapseClient, loadConfigFromEnv } from './client.js';
import { getAccountSummary } from './account-summary.js';
import { RealPDPStatusChecker } from './pdp-status.js';
import { evaluate } from '../decision-engine/index.js';
import { executeDecision, type ActionExecutor } from './actions.js';

/**
 * Full live, real-money (testnet) end-to-end verification against Filecoin
 * calibration testnet — no mocks, no simulation. Run with `npm run live-verify`.
 *
 * Requires: a funded .env (PRIVATE_KEY + some tFIL for gas + some USDFC —
 * see .env.example and the faucet link in docs/BUILD-PLAN.md Phase 3).
 *
 * Steps: deposit into Filecoin Pay -> approve Warm Storage as an operator
 * (one-time) -> create a real dataset with a real storage provider ->
 * real PDP status check -> real decision engine evaluation against the
 * resulting live account state -> execute that decision for real ->
 * explicitly verify the real termination path too.
 *
 * First confirmed run (2026-09-02, calibration testnet):
 *   - deposit: 2 USDFC, confirmed block 4033898
 *   - approveService: confirmed block 4033905
 *   - real dataSetId 32848 created with provider 2, piece uploaded to
 *     https://calib2.ezpdpz.net (retrievalUrl)
 *   - accountSummary after dataset creation: lockupRatePerEpoch and
 *     runwayInEpochs both went finite/nonzero for the first time (993599
 *     epochs ~345 days) — confirming a real active payment rail
 *   - RealPDPStatusChecker: lastProvenEpoch === currentEpoch, status
 *     'verified' (freshly created data sets are proven immediately)
 *   - decision engine: green band, action 'none' (correctly did nothing —
 *     345 days of runway needs no top-up)
 *   - terminateService called directly to prove the real drop path:
 *     confirmed, endEpoch set
 *
 * Note: PaymentsService.deposit()/approveService() submit but do NOT wait
 * for confirmation (there are separate `*Sync` variants in
 * @filoz/synapse-core that do) — this script explicitly waits via
 * `synapse.client.waitForTransactionReceipt` after each. Also: the
 * locally-computed tx hash returned by these calls can differ from the
 * hash Filecoin's FEVM layer reports in the receipt (`receipt.transactionHash`)
 * — a known quirk. `waitForTransactionReceipt` still resolves correctly
 * against the originally-returned hash; use `check-tx.ts` to inspect a
 * confirmed transaction's on-chain receipt directly.
 */

function fmt(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

async function depositAndWait(synapse: Awaited<ReturnType<typeof createSynapseClient>>, amount: bigint) {
  const tx = await synapse.payments.deposit({ amount });
  console.log('deposit tx:', tx, '- waiting for confirmation...');
  const receipt = await synapse.client.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
  console.log('deposit confirmed, status:', receipt.status, 'block:', receipt.blockNumber);
}

async function approveOperatorAndWait(synapse: Awaited<ReturnType<typeof createSynapseClient>>) {
  const current = await synapse.payments.serviceApproval();
  if (current.isApproved) {
    console.log('Warm Storage already approved as operator — skipping.');
    return;
  }
  const tx = await synapse.payments.approveService();
  console.log('approveService tx:', tx, '- waiting for confirmation...');
  const receipt = await synapse.client.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
  console.log('approveService confirmed, status:', receipt.status, 'block:', receipt.blockNumber);
}

async function main() {
  const config = loadConfigFromEnv();
  const synapse = createSynapseClient(config);
  console.log('Address:', synapse.client.account.address);

  console.log('\n=== accountSummary BEFORE ===');
  console.log(fmt(await getAccountSummary(synapse)));

  const depositAmount = process.env.LIVE_VERIFY_DEPOSIT_AMOUNT
    ? BigInt(process.env.LIVE_VERIFY_DEPOSIT_AMOUNT)
    : 0n;
  if (depositAmount > 0n) {
    console.log(`\n=== Depositing ${depositAmount} into Filecoin Pay (real tx) ===`);
    await depositAndWait(synapse, depositAmount);
  } else {
    console.log('\n(Skipping deposit — set LIVE_VERIFY_DEPOSIT_AMOUNT to deposit more before this run.)');
  }

  console.log('\n=== Ensuring Warm Storage is approved as an operator (real tx if not already) ===');
  await approveOperatorAndWait(synapse);

  console.log('\n=== Creating a real storage context + uploading real data (127 bytes) ===');
  const context = await synapse.storage.createContext({});
  const data = new Uint8Array(127).fill(7);
  const uploadResult = await context.upload(data, {
    onStored: (providerId, pieceCid) => console.log('  onStored - providerId:', providerId, 'pieceCid:', pieceCid.toString()),
    onPiecesAdded: (tx) => console.log('  onPiecesAdded - tx:', tx),
    onPiecesConfirmed: (dataSetId) => console.log('  onPiecesConfirmed - dataSetId:', dataSetId),
  });
  console.log('upload result:', fmt(uploadResult));

  const dataSetId = context.dataSetId;
  if (dataSetId === undefined) {
    throw new Error('No dataSetId available after upload.');
  }
  console.log('\nReal dataSetId:', dataSetId);

  console.log('\n=== accountSummary AFTER dataset creation (real active rail) ===');
  const afterDataset = await getAccountSummary(synapse);
  console.log(fmt(afterDataset));

  console.log('\n=== REAL PDP status check ===');
  const pdpChecker = new RealPDPStatusChecker(synapse.client);
  const pdpStatus = await pdpChecker.checkStatus(dataSetId, afterDataset.epoch);
  console.log(fmt(pdpStatus));

  console.log('\n=== Real decision engine evaluation against real state ===');
  const trace = evaluate([afterDataset], pdpStatus);
  console.log('band:', trace.band, '| action:', trace.action);
  console.log('reason:', trace.reason);

  console.log('\n=== Executing the resulting decision for real ===');
  const executor: ActionExecutor = synapse;
  const executed = await executeDecision(executor, trace, dataSetId);
  console.log('executed:', fmt(executed));

  console.log('\n=== Explicit real drop-dataset (terminate) verification ===');
  const terminateResult = await synapse.storage.terminateService({ dataSetId });
  console.log('terminate result:', fmt(terminateResult));

  console.log('\n=== DONE ===');
}

main().catch((err) => {
  console.error('\nlive-verify FAILED:', err);
  process.exit(1);
});
