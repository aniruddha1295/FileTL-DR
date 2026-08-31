import { Synapse } from '@filoz/synapse-sdk';
import { calibration } from '@filoz/synapse-core/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

export interface AgentConfig {
  privateKey: Hex;
}

export function createSynapseClient(config: AgentConfig): Synapse {
  const account = privateKeyToAccount(config.privateKey);
  return Synapse.create({
    chain: calibration,
    account,
    source: 'filecoin-runway-triage-agent',
  });
}

export function loadConfigFromEnv(): AgentConfig {
  const raw = process.env.PRIVATE_KEY?.trim();
  if (!raw || raw === '0x...') {
    throw new Error(
      'PRIVATE_KEY is missing in .env. Copy .env.example to .env and fill in your testnet private key.'
    );
  }
  const privateKey = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(
      `PRIVATE_KEY in .env does not look like a valid 32-byte hex key (got ${privateKey.length} chars including 0x).`
    );
  }
  return { privateKey };
}
