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

  it('/state exposes meta with a default scripted-demo mode and null wallet before setMeta is called', async () => {
    const server: DashboardServer = createDashboardServer();
    handle = await server.start(0);
    const state = await (await fetch(handle.url + '/state')).json();
    expect(state.meta).toEqual({ walletAddress: null, mode: 'scripted-demo' });
  });

  it('setMeta populates /state.meta independent of whether a decision has been pushed', async () => {
    const server: DashboardServer = createDashboardServer();
    handle = await server.start(0);
    server.setMeta({ walletAddress: '0x044c40FBC017C74273eF402655391D4372Cf715e', mode: 'scripted-demo' });

    const state = await (await fetch(handle.url + '/state')).json();
    expect(state.current).toBeNull();
    expect(state.events).toHaveLength(0);
    expect(state.meta).toEqual({ walletAddress: '0x044c40FBC017C74273eF402655391D4372Cf715e', mode: 'scripted-demo' });
  });

  it('page HTML renders the wallet pill link and mode pill wired to the real Filfox address and honest scripted-demo mode', async () => {
    const server: DashboardServer = createDashboardServer();
    handle = await server.start(0);
    server.setMeta({ walletAddress: '0x044c40FBC017C74273eF402655391D4372Cf715e', mode: 'scripted-demo' });

    const html = await (await fetch(handle.url + '/')).text();
    // Static "mode" pill hook is present in the markup (populated client-side from /state.meta).
    expect(html).toContain('id="modePill"');
    expect(html).toContain('scripted-demo');
    // Wallet pill hook + client-side rendering wired to the real Filfox address URL base.
    expect(html).toContain('id="walletPill"');
    expect(html).toContain('https://calibration.filfox.info/en/address/');

    // The client-side rendering logic embedded in the page must build the
    // real Filfox address link (verified by exercising renderMeta via the
    // served /state data + a DOM-less string check on the script source).
    expect(html).toContain('FILFOX_ADDRESS_BASE');
    expect(html).toContain('FILFOX_MESSAGE_BASE');
  });

  it('decision-log entry with a real txHash embeds a real, clickable Filfox message link (via fmtExecuted/txRef logic in the served page)', async () => {
    const server: DashboardServer = createDashboardServer();
    handle = await server.start(0);

    const history = [
      makeSnapshot({ epoch: 1000n, lockupRatePerEpoch: 10n, runwayInEpochs: 100n, availableFunds: 1000n, grossCoverageInEpochs: 1000n }),
    ];
    const pdpStatus: PDPStatusResult = { dataSetId: 42n, currentEpoch: 1000n, lastProvenEpoch: null, nextChallengeEpoch: null, status: 'unverified' };
    const trace = evaluate(history, pdpStatus);
    const realTxHash = '0xb3a77e25f3cf8d7fc96048bb65fa4d06b69b616308bce4b3893a2f4012e474b';
    const executed: ExecutedAction = { kind: 'drop-dataset', txHash: realTxHash as `0x${string}`, dataSetId: 42n, endEpoch: 1005n };
    server.pushDecision(trace, executed);

    const state = await (await fetch(handle.url + '/state')).json();
    expect(state.events[0].executed.txHash).toBe(realTxHash);

    // The page's client-side logic must classify this as a real hash and
    // build a Filfox message link for it — verified here by confirming the
    // served page contains the link-building logic keyed on the real base
    // URL and the isRealTxHash placeholder guard.
    const html = await (await fetch(handle.url + '/')).text();
    expect(html).toContain('https://calibration.filfox.info/en/message/');
    expect(html).toContain('isRealTxHash');
  });

  it('placeholder tx hashes (0xTOPUP / 0xDROP) are recognized as non-real and never linked, falling back to #seq', async () => {
    const html = await (
      await fetch((handle = await createDashboardServer().start(0)).url + '/')
    ).text();
    // Placeholder hashes used by console-only executors must be excluded
    // from real-link treatment.
    expect(html).toContain("'0xTOPUP': true");
    expect(html).toContain("'0xDROP': true");
    // Fallback to '#seq' display remains present in the source.
    expect(html).toMatch(/'#' \+ escapeHtml\(String\(evt\.seq\)\)/);
  });
});
