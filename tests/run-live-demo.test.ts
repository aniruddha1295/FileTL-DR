import { afterEach, describe, expect, it } from 'vitest';
import { runLiveDemo } from '../src/demo/run-live-demo.js';
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
});
