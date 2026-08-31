import { describe, expect, it, afterEach } from 'vitest';
import { createDashboardServer, type DashboardServer } from '../src/ui/server.js';
import { evaluate } from '../src/decision-engine/index.js';
import type { AccountSummarySnapshot } from '../src/onchain/forecast.js';
import type { PDPStatusResult } from '../src/onchain/pdp-status.js';
import type { ExecutedAction } from '../src/onchain/actions.js';

function makeSnapshot(overrides: Partial<AccountSummarySnapshot>): AccountSummarySnapshot {
  return {
    funds: 0n,
    availableFunds: 0n,
    debt: 0n,
    lockupRatePerEpoch: 0n,
    lockupRatePerMonth: 0n,
    totalLockup: 0n,
    totalFixedLockup: 0n,
    totalRateBasedLockup: 0n,
    runwayInEpochs: 0n,
    grossCoverageInEpochs: 0n,
    epoch: 0n,
    ...overrides,
  };
}

describe('dashboard server', () => {
  let handle: { url: string; stop: () => void } | null = null;

  afterEach(() => {
    handle?.stop();
    handle = null;
  });

  it('serves the page and reflects a pushed decision trace via /state', async () => {
    const server: DashboardServer = createDashboardServer();
    handle = await server.start(0);

    // Real evaluate() call producing a red-band, PDP-unverified -> drop-dataset trace.
    const history = [
      makeSnapshot({
        epoch: 1000n,
        lockupRatePerEpoch: 10n,
        runwayInEpochs: 100n,
        availableFunds: 1000n,
        grossCoverageInEpochs: 1000n,
      }),
    ];
    const pdpStatus: PDPStatusResult = {
      dataSetId: 42n,
      currentEpoch: 1000n,
      lastProvenEpoch: null,
      nextChallengeEpoch: null,
      status: 'unverified',
    };
    const trace = evaluate(history, pdpStatus);
    expect(trace.band).toBe('red');
    expect(trace.action).toBe('drop-dataset');

    const executed: ExecutedAction = {
      kind: 'drop-dataset',
      txHash: '0xabc123',
      dataSetId: 42n,
      endEpoch: 1005n,
    };

    server.pushDecision(trace, executed);

    // Root page loads and contains recognizable content.
    const pageRes = await fetch(handle.url + '/');
    expect(pageRes.status).toBe(200);
    const pageHtml = await pageRes.text();
    expect(pageHtml).toContain('id="band"');
    expect(pageHtml).toContain('Filecoin Runway Triage');

    // /state reflects the pushed decision trace: band, action, reason all present.
    const stateRes = await fetch(handle.url + '/state');
    expect(stateRes.status).toBe(200);
    const state = await stateRes.json();

    expect(state.current).not.toBeNull();
    expect(state.current.band).toBe('red');
    expect(state.current.action).toBe('drop-dataset');
    expect(state.current.reason).toBe(trace.reason);
    expect(state.current.reason).toMatch(/red band/i);
    expect(state.events).toHaveLength(1);
    expect(state.events[0].executed).toMatchObject({ kind: 'drop-dataset', txHash: '0xabc123' });
    expect(state.current.pdpStatus.status).toBe('unverified');
  });
});
