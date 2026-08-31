import 'dotenv/config';
import { createSynapseClient, loadConfigFromEnv } from './client.js';
import { getAccountSummary } from './account-summary.js';

async function main() {
  const config = loadConfigFromEnv();
  const synapse = createSynapseClient(config);

  console.log('Connected to Filecoin calibration testnet');
  console.log('Client address:', synapse.client.account.address);

  const summary = await getAccountSummary(synapse);

  console.log('\nRaw accountSummary() response:');
  console.log(
    JSON.stringify(summary, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)
  );

  const runwayEpochs = summary.runwayInEpochs;
  const runwayDays = Number(runwayEpochs) / 2880; // 2880 epochs/day, per TIME_CONSTANTS.EPOCHS_PER_DAY

  console.log(`\nrunwayInEpochs: ${runwayEpochs} (~${runwayDays.toFixed(2)} days)`);
  console.log(`grossCoverageInEpochs: ${summary.grossCoverageInEpochs}`);
}

main().catch((err) => {
  console.error('check-account failed:', err);
  process.exit(1);
});
