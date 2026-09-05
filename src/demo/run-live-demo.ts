import { pathToFileURL } from 'node:url';
import { createDashboardServer } from '../ui/server.js';
import { runDrainScenario, type DrainScenarioOptions } from './drain-scenario.js';
import { SCENARIOS, type ScenarioName } from './scenarios.js';
import { LIVE_RUN_STEPS } from './live-run-record.js';
import { evaluate } from '../decision-engine/index.js';
import { executeDecision, type ActionExecutor } from '../onchain/actions.js';
import type { DecisionTrace } from '../decision-engine/index.js';
import type { ExecutedAction } from '../onchain/actions.js';

function isScenarioName(name: string): name is ScenarioName {
  return name in SCENARIOS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The project's actual live-verified testnet wallet (see README.md and
 * docs/BUILD-PLAN.md) — used only as a static "Verify on-chain" link target
 * in the dashboard header. This entry point never sends transactions from
 * or reads live balances for this address; it always runs the scripted
 * drain sequence / named scenarios against a console-logging executor (see
 * `mode: 'scripted-demo'` below, which is the honest, only value this entry
 * point ever sets).
 */
export const DEMO_WALLET_ADDRESS = '0x044c40FBC017C74273eF402655391D4372Cf715e';

/**
 * Wires the Phase 4 dashboard (src/ui/server.ts) and the deterministic drain
 * scenario (src/demo/drain-scenario.ts) together — these were built as
 * independent parallel tracks and never imported each other, so this is the
 * actual integration point the demo runs through. Starts the dashboard,
 * pushes every drain-scenario step into it live, and returns the dashboard
 * handle (still running) plus the full trace history so a caller (CLI or
 * test) can inspect the result or keep the server open for a live demo.
 */
export async function runLiveDemo(
  executor: ActionExecutor,
  options: DrainScenarioOptions & { port?: number } = {}
): Promise<{
  url: string;
  stop: () => void;
  traces: DecisionTrace[];
}> {
  const dashboard = createDashboardServer();
  const { url, stop } = await dashboard.start(options.port);
  dashboard.setMeta({ walletAddress: DEMO_WALLET_ADDRESS, mode: 'scripted-demo' });

  // Interactive controls (the dashboard's "Simulate" buttons): can be
  // clicked any time after this, including re-running the full walkthrough
  // ("auto") on demand — additive to the auto-play run below, not a
  // replacement for it.
  dashboard.onSimulate(async (name) => {
    if (name === 'auto') {
      await runDrainScenario(executor, {
        ...options,
        onStep: (history, trace, executed, totalSteps) => {
          dashboard.pushDecision(trace, executed);
          options.onStep?.(history, trace, executed, totalSteps);
        },
      });
      return;
    }
    if (name === 'live-verified') {
      // Replays a real captured run, not a synthetic scenario — see
      // src/demo/live-run-record.ts. Real tx hashes render as real,
      // clickable calibration Filfox links (src/ui/page.ts's
      // isRealTxHash), same as any other pushed decision.
      for (let i = 0; i < LIVE_RUN_STEPS.length; i++) {
        const step = LIVE_RUN_STEPS[i];
        dashboard.pushDecision(step.trace, step.executed);
        if (i < LIVE_RUN_STEPS.length - 1) {
          await sleep(options.stepDelayMs ?? 1500);
        }
      }
      return;
    }
    if (!isScenarioName(name)) {
      throw new Error(`Unknown scenario "${name}". Valid: auto, live-verified, ${Object.keys(SCENARIOS).join(', ')}`);
    }
    const scenario = SCENARIOS[name];
    const trace = evaluate(scenario.history, scenario.pdpStatus);
    const executed = await executeDecision(executor, trace, scenario.pdpStatus.dataSetId);
    dashboard.pushDecision(trace, executed);
  });

  const traces = await runDrainScenario(executor, {
    ...options,
    onStep: (history, trace, executed, totalSteps) => {
      dashboard.pushDecision(trace, executed);
      options.onStep?.(history, trace, executed, totalSteps);
    },
  });

  return { url, stop, traces };
}

/* c8 ignore start -- manual/demo entry point, not exercised by unit tests */
// `file://${process.argv[1]}` breaks on Windows: process.argv[1] is a raw
// backslash path (C:\foo\bar.ts) with no scheme, while import.meta.url is a
// proper file:// URL (file:///C:/foo/bar.ts) — the two never match, so
// `npm run demo` silently did nothing on this project's target OS. Convert
// argv[1] through pathToFileURL so both sides are normalized URLs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const consoleExecutor: ActionExecutor = {
    payments: {
      deposit: async (opts) => {
        console.log('  [chain] deposit', opts.amount);
        return '0xTOPUP' as `0x${string}`;
      },
    },
    storage: {
      terminateService: async (opts) => {
        console.log('  [chain] terminateService', opts.dataSetId);
        return { txHash: '0xDROP' as `0x${string}`, dataSetId: opts.dataSetId, endEpoch: 9999n };
      },
    },
  };

  // Fixed, configurable port (not the library default of 0/ephemeral) so
  // this can be published predictably from a container (`docker run -p`).
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;

  const { url, stop, traces } = await runLiveDemo(consoleExecutor, {
    port,
    stepDelayMs: 1500,
    onStep: (_h, trace) => console.log(`[step] band=${trace.band} action=${trace.action}`),
  });

  console.log(`\nDashboard live at ${url} — open it in a browser to watch the decision log.`);
  console.log(`Final decision: ${traces[traces.length - 1].band} / ${traces[traces.length - 1].action}`);
  console.log('Press Ctrl+C to stop the server.');
  process.on('SIGINT', () => {
    stop();
    process.exit(0);
  });
}
/* c8 ignore stop */
