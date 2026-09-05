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
    expect(pageHtml).toContain('id="bandCard"');
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

  it('POST /simulate/:name invokes the registered handler and reflects its pushDecision result', async () => {
    const server: DashboardServer = createDashboardServer();
    handle = await server.start(0);

    let receivedName: string | null = null;
    server.onSimulate(async (name) => {
      receivedName = name;
      const history = [
        makeSnapshot({ epoch: 1n, lockupRatePerEpoch: 1n, runwayInEpochs: 950n, availableFunds: 950n, grossCoverageInEpochs: 1000n }),
      ];
      const pdpStatus: PDPStatusResult = { dataSetId: 1n, currentEpoch: 1n, lastProvenEpoch: 0n, nextChallengeEpoch: 5000n, status: 'verified' };
      server.pushDecision(evaluate(history, pdpStatus));
    });

    const res = await fetch(handle.url + '/simulate/healthy', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(receivedName).toBe('healthy');

    const state = await (await fetch(handle.url + '/state')).json();
    expect(state.current.band).toBe('green');
  });

  it('POST /simulate/:name returns 501 when no handler is registered', async () => {
    const server: DashboardServer = createDashboardServer();
    handle = await server.start(0);

    const res = await fetch(handle.url + '/simulate/healthy', { method: 'POST' });
    expect(res.status).toBe(501);
  });

  it('POST /simulate/:name returns 500 and does not crash the server when the handler throws', async () => {
    const server: DashboardServer = createDashboardServer();
    handle = await server.start(0);
    server.onSimulate(async () => {
      throw new Error('boom');
    });

    const res = await fetch(handle.url + '/simulate/unknown-scenario', { method: 'POST' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/boom/);

    // Server is still alive and responsive after the failure.
    const pageRes = await fetch(handle.url + '/');
    expect(pageRes.status).toBe(200);
  });

  it('page HTML includes the interactive scenario buttons', async () => {
    const server: DashboardServer = createDashboardServer();
    handle = await server.start(0);
    const html = await (await fetch(handle.url + '/')).text();
    expect(html).toContain('data-scenario="healthy"');
    expect(html).toContain('data-scenario="tight-verified"');
    expect(html).toContain('data-scenario="tight-unverified"');
    expect(html).toContain('data-scenario="auto"');
  });
});
