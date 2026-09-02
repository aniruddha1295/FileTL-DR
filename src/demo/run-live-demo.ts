import { pathToFileURL } from 'node:url';
import { createDashboardServer } from '../ui/server.js';
import { runDrainScenario, type DrainScenarioOptions } from './drain-scenario.js';
import type { ActionExecutor } from '../onchain/actions.js';
import type { DecisionTrace } from '../decision-engine/index.js';
import type { ExecutedAction } from '../onchain/actions.js';

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
