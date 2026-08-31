import 'dotenv/config';
import { createSynapseClient, loadConfigFromEnv } from './client.js';

async function main() {
  const config = loadConfigFromEnv();
  const synapse = createSynapseClient(config);
  const address = synapse.client.account.address;

  const nativeBalance = await synapse.readClient.getBalance({ address });
  console.log('Native tFIL balance (for gas):', nativeBalance.toString());

  const usdfcWalletBalance = await synapse.payments.walletBalance({ token: 'USDFC' });
  console.log('USDFC wallet balance (not yet deposited into Filecoin Pay):', usdfcWalletBalance.toString());
}

main().catch((err) => {
  console.error('check-wallet-balance failed:', err);
  process.exit(1);
});
