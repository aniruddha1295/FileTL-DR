import type { Hash } from 'viem';
import type { ActionExecutor } from '../onchain/actions.js';
import { runDrainScenario, type DrainScenarioOptions } from './drain-scenario.js';

/**
 * Screen-recordable CLI entry point for the Phase 4 demo centerpiece: a
 * deterministic, scripted drain from green -> yellow -> red, narrating each
 * step's band/percent/action/reason, and logging (instead of really
 * executing) the on-chain action that would fire — this project does not yet
 * have a funded testnet wallet wired up, so real `deposit`/`terminateService`
 * calls are simulated here rather than actually sent.
 *
 * Usage: `npm run demo` (defaults to the 'unverified' drop-dataset climax),
 * or `npm run demo -- verified` / `npm run demo -- verifying` to demonstrate
 * the other two branches of the red-band compound decision.
 */

const SIMULATED_TX_HASH = ('0x' + '0'.repeat(64)) as Hash;

const consoleExecutor: ActionExecutor = {
  payments: {
    async deposit(options) {
      console.log(
        `    -> [SIMULATED] payments.deposit({ amount: ${options.amount.toString()} }) — no funded wallet configured yet, logging only.`
      );
      return SIMULATED_TX_HASH;
    },
  },
  storage: {
    async terminateService(options) {
      console.log(
        `    -> [SIMULATED] storage.terminateService({ dataSetId: ${options.dataSetId.toString()} }) — no funded wallet configured yet, logging only.`
      );
      return { txHash: SIMULATED_TX_HASH, dataSetId: options.dataSetId, endEpoch: 0n };
    },
  },
};

function fmtPercent(p: number | null): string {
  return p === null ? 'unknown' : `${p.toFixed(1)}%`;
}

function isPdpStatusArg(value: string | undefined): value is 'verified' | 'unverified' | 'verifying' {
  return value === 'verified' || value === 'unverified' || value === 'verifying';
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const finalPdpStatus = isPdpStatusArg(arg) ? arg : 'unverified';

  console.log('=== Tiered Runway Triage Agent — Deterministic Drain Scenario ===');
  console.log('(Synthetic, repeatable account-state sequence — not a live chain read.)');
  console.log(`Red-band climax will demonstrate PDP status: '${finalPdpStatus}'\n`);

  let stepNumber = 0;

  const options: DrainScenarioOptions = {
    finalPdpStatus,
    stepDelayMs: 1500,
    onStep: (history, trace, executed, totalSteps) => {
      stepNumber += 1;
      const latest = history[history.length - 1];
      console.log(
        `[step ${stepNumber}/${totalSteps}] epoch=${latest.epoch}  band=${trace.band.toUpperCase().padEnd(6)}  percent=${fmtPercent(
          trace.details.percentOfBaseline
        )}  action=${trace.action}`
      );
      console.log(`    reason: ${trace.reason}`);
      if (executed) {
        console.log(`    executed: ${executed.kind}`);
      }
      console.log('');
    },
  };

  const traces = await runDrainScenario(consoleExecutor, options);

  console.log(`=== Scenario complete: ${traces.length} steps evaluated, final action = '${traces[traces.length - 1].action}'. ===`);
}

main().catch((err) => {
  console.error('Drain scenario failed:', err);
  process.exitCode = 1;
});
