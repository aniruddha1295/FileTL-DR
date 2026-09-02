import 'dotenv/config';
import { createSynapseClient, loadConfigFromEnv } from './client.js';

/**
 * Blocks until a given tx hash confirms, printing the real receipt. Useful
 * because several PaymentsService calls (deposit, approveService) submit a
 * transaction without waiting for it — see live-verify.ts's docstring.
 * Usage: `npx tsx src/onchain/wait-for-tx.ts <txHash>`
 */
async function main() {
  const txHash = process.argv[2] as `0x${string}` | undefined;
  if (!txHash) {
    console.error('Usage: tsx src/onchain/wait-for-tx.ts <txHash>');
    process.exit(1);
  }

  const config = loadConfigFromEnv();
  const synapse = createSynapseClient(config);

  console.log('Waiting for receipt of', txHash, '(timeout 120s)...');
  const receipt = await synapse.client.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
  console.log('CONFIRMED:', JSON.stringify(receipt, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
}

main().catch((err) => {
  console.error('wait-for-tx failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
