import 'dotenv/config';
import { createSynapseClient, loadConfigFromEnv } from './client.js';

async function main() {
  const txHash = process.argv[2];
  if (!txHash) {
    console.error('Usage: tsx src/onchain/check-tx.ts <txHash>');
    process.exit(1);
  }

  const config = loadConfigFromEnv();
  const synapse = createSynapseClient(config);

  console.log('Checking tx:', txHash);

  try {
    const tx = await synapse.readClient.getTransaction({ hash: txHash as `0x${string}` });
    console.log('\nTransaction found (mined into a block):');
    console.log('  blockNumber:', tx.blockNumber);
    console.log('  from:', tx.from);
    console.log('  to:', tx.to);
    console.log('  value:', tx.value.toString());
    console.log('  nonce:', tx.nonce);
  } catch (err) {
    console.log('\ngetTransaction failed (likely still pending / not yet indexed):', err instanceof Error ? err.message : err);
  }

  try {
    const receipt = await synapse.readClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
    console.log('\nReceipt found:');
    console.log('  status:', receipt.status);
    console.log('  blockNumber:', receipt.blockNumber);
    console.log('  gasUsed:', receipt.gasUsed.toString());
  } catch (err) {
    console.log('\ngetTransactionReceipt failed (still pending, or not found):', err instanceof Error ? err.message : err);
  }
}

main().catch((err) => {
  console.error('check-tx failed:', err);
  process.exit(1);
});
