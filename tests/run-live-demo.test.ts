import { afterEach, describe, expect, it } from 'vitest';
import { runLiveDemo, DEMO_WALLET_ADDRESS } from '../src/demo/run-live-demo.js';
import type { ActionExecutor } from '../src/onchain/actions.js';

describe('runLiveDemo (dashboard + drain scenario integration)', () => {
  let stopFn: (() => void) | undefined;

  afterEach(() => {
    stopFn?.();
    stopFn = undefined;
  });

  it('wires the drain scenario into the dashboard so /state reflects the final decision', async () => {
    const executor: ActionExecutor = {
      payments: { deposit: async () => '0xTOPUP' as `0x${string}` },
      storage: {
        terminateService: async (opts) => ({
          txHash: '0xDROP' as `0x${string}`,
          dataSetId: opts.dataSetId,
          endEpoch: 9999n,
        }),
      },
    };

    const { url, stop, traces } = await runLiveDemo(executor, { port: 0, stepDelayMs: 0 });
    stopFn = stop;

    expect(traces.length).toBeGreaterThanOrEqual(3);
    const finalTrace = traces[traces.length - 1];
    expect(finalTrace.band).toBe('red');
    expect(finalTrace.action).toBe('drop-dataset');

    const stateRes = await fetch(`${url}/state`);
    const state = await stateRes.json();
    expect(state.current.band).toBe('red');
    expect(state.current.action).toBe('drop-dataset');
    expect(state.events.length).toBe(traces.length);

    const pageRes = await fetch(url);
    const html = await pageRes.text();
    expect(html).toContain('id="bandCard"');
  });

  it('replays the real captured live-verified run (real tx hash, red band, both PDP branches) via POST /simulate/live-verified', async () => {
    const executor: ActionExecutor = {
      payments: { deposit: async () => '0xTOPUP' as `0x${string}` },
      storage: {
        terminateService: async (opts) => ({
          txHash: '0xDROP' as `0x${string}`,
          dataSetId: opts.dataSetId,
          endEpoch: 9999n,
        }),
      },
    };

    const { url, stop } = await runLiveDemo(executor, { port: 0, stepDelayMs: 0 });
    stopFn = stop;

    const res = await fetch(`${url}/simulate/live-verified`, { method: 'POST' });
    expect(res.status).toBe(200);

    const state = await (await fetch(`${url}/state`)).json();
    const events = state.events.slice(-2);
    expect(events[0].band).toBe('red');
    expect(events[0].action).toBe('top-up');
    expect(events[0].pdpStatus.status).toBe('verified');
    expect(events[0].executed.kind).toBe('top-up');
    expect(events[0].executed.txHash).toMatch(/^0x[0-9a-f]{64,66}$/i);

    expect(events[1].band).toBe('red');
    expect(events[1].action).toBe('drop-dataset');
    expect(events[1].pdpStatus.status).toBe('unverified');
    expect(events[1].executed.kind).toBe('no-op');
  });

  it('sets the real wallet address and an honest scripted-demo mode in /state.meta at startup', async () => {
    const executor: ActionExecutor = {
      payments: { deposit: async () => '0xTOPUP' as `0x${string}` },
      storage: {
        terminateService: async (opts) => ({
          txHash: '0xDROP' as `0x${string}`,
          dataSetId: opts.dataSetId,
          endEpoch: 9999n,
        }),
      },
    };

    const { url, stop } = await runLiveDemo(executor, { port: 0, stepDelayMs: 0 });
    stopFn = stop;

    const state = await (await fetch(`${url}/state`)).json();
    expect(state.meta).toEqual({ walletAddress: DEMO_WALLET_ADDRESS, mode: 'scripted-demo' });
  });
});
