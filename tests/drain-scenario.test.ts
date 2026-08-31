import { describe, expect, it, vi } from 'vitest';
import { buildDrainSequence, runDrainScenario } from '../src/demo/drain-scenario.js';
import { evaluate, type Band, type DecisionTrace } from '../src/decision-engine/index.js';
import type { ActionExecutor } from '../src/onchain/actions.js';
import type { PDPStatusResult } from '../src/onchain/pdp-status.js';

function makeMockExecutor(): ActionExecutor & {
  payments: { deposit: ReturnType<typeof vi.fn> };
  storage: { terminateService: ReturnType<typeof vi.fn> };
} {
  return {
    payments: { deposit: vi.fn().mockResolvedValue('0xdeadbeef') },
    storage: {
      terminateService: vi.fn().mockResolvedValue({ txHash: '0xabc123', dataSetId: 1n, endEpoch: 999n }),
    },
  };
}

describe('buildDrainSequence', () => {
  it('produces a sequence that, run step-by-step through the real evaluate(), visits green, yellow, AND red', () => {
    const sequence = buildDrainSequence();
    const neutralPdp: PDPStatusResult = {
      dataSetId: 0n,
      currentEpoch: 0n,
      lastProvenEpoch: 0n,
      nextChallengeEpoch: 10n ** 12n,
      status: 'verified',
    };

    const bandsSeen = new Set<Band>();
    const rows: { epoch: bigint; percent: number | null; band: Band }[] = [];

    for (let i = 0; i < sequence.length; i++) {
      const history = sequence.slice(0, i + 1);
      const trace = evaluate(history, { ...neutralPdp, currentEpoch: sequence[i].epoch });
      bandsSeen.add(trace.band);
      rows.push({ epoch: sequence[i].epoch, percent: trace.details.percentOfBaseline, band: trace.band });
    }

    // Load-bearing assertion: if this ever fails, the "forced scarcity" demo
    // premise (a deterministic script that genuinely crosses all three
    // bands) is broken.
    expect(bandsSeen.has('green')).toBe(true);
    expect(bandsSeen.has('yellow')).toBe(true);
    expect(bandsSeen.has('red')).toBe(true);

    // Sanity: funds/availableFunds actually decline monotonically, and the
    // fixed baseline (grossCoverageInEpochs) never changes.
    for (let i = 1; i < sequence.length; i++) {
      expect(sequence[i].availableFunds < sequence[i - 1].availableFunds).toBe(true);
      expect(sequence[i].epoch > sequence[i - 1].epoch).toBe(true);
      expect(sequence[i].grossCoverageInEpochs).toBe(sequence[0].grossCoverageInEpochs);
    }

    // Surface the actual per-step percentages/bands for visibility.
    // eslint-disable-next-line no-console
    console.log('drain sequence bands:', rows.map((r) => `${r.band}(${r.percent}%)`).join(' -> '));
  });

  it('throws if configured with too few steps to reliably cross all bands', () => {
    expect(() => buildDrainSequence({ steps: 2 })).toThrow(/steps/i);
  });
});

describe('runDrainScenario', () => {
  it('with default finalPdpStatus (unverified), the final trace action is drop-dataset', async () => {
    const executor = makeMockExecutor();
    const traces = await runDrainScenario(executor, { stepDelayMs: 0 });

    expect(traces.length).toBeGreaterThan(0);
    const final = traces[traces.length - 1];
    expect(final.band).toBe('red');
    expect(final.pdpStatus.status).toBe('unverified');
    expect(final.action).toBe('drop-dataset');
  });

  it('with finalPdpStatus verified, the final trace action is top-up', async () => {
    const executor = makeMockExecutor();
    const traces = await runDrainScenario(executor, { stepDelayMs: 0, finalPdpStatus: 'verified' });

    const final = traces[traces.length - 1];
    expect(final.band).toBe('red');
    expect(final.pdpStatus.status).toBe('verified');
    expect(final.action).toBe('top-up');
  });

  it('calls onStep once per step with a growing history array and a valid DecisionTrace', async () => {
    const executor = makeMockExecutor();
    const seenHistoryLengths: number[] = [];
    const seenTraces: DecisionTrace[] = [];

    const traces = await runDrainScenario(executor, {
      stepDelayMs: 0,
      onStep: (history, trace) => {
        seenHistoryLengths.push(history.length);
        seenTraces.push(trace);
      },
    });

    expect(seenHistoryLengths).toEqual(traces.map((_, i) => i + 1));
    expect(seenTraces).toHaveLength(traces.length);
    for (const trace of seenTraces) {
      expect(['green', 'yellow', 'red', 'insufficient-data']).toContain(trace.band);
      expect(['none', 'top-up', 'drop-dataset', 'hold-and-monitor']).toContain(trace.action);
    }
  });

  it('deposit/terminateService are called only on top-up/drop steps, matching the returned traces exactly', async () => {
    const executor = makeMockExecutor();
    const traces = await runDrainScenario(executor, { stepDelayMs: 0, finalPdpStatus: 'unverified' });

    const expectedTopUps = traces.filter((t) => t.action === 'top-up').length;
    const expectedDrops = traces.filter((t) => t.action === 'drop-dataset').length;
    const expectedNoActs = traces.filter((t) => t.action === 'none' || t.action === 'hold-and-monitor').length;

    // Load-bearing on the scenario design: this default run should include
    // at least one top-up (yellow/red-verified) AND the final drop.
    expect(expectedTopUps).toBeGreaterThan(0);
    expect(expectedDrops).toBe(1);
    expect(expectedTopUps + expectedDrops + expectedNoActs).toBe(traces.length);

    expect(executor.payments.deposit).toHaveBeenCalledTimes(expectedTopUps);
    expect(executor.storage.terminateService).toHaveBeenCalledTimes(expectedDrops);
  });

  it('deposit is called on the final step too when finalPdpStatus is verified (aggressive top-up), terminateService never called', async () => {
    const executor = makeMockExecutor();
    const traces = await runDrainScenario(executor, { stepDelayMs: 0, finalPdpStatus: 'verified' });

    const expectedTopUps = traces.filter((t) => t.action === 'top-up').length;

    expect(executor.payments.deposit).toHaveBeenCalledTimes(expectedTopUps);
    expect(executor.storage.terminateService).not.toHaveBeenCalled();
  });

  it('respects a custom dataSetId when executing actions', async () => {
    const executor = makeMockExecutor();
    await runDrainScenario(executor, { stepDelayMs: 0, dataSetId: 42n, finalPdpStatus: 'unverified' });

    expect(executor.storage.terminateService).toHaveBeenCalledWith({ dataSetId: 42n });
  });

  describe('code-review regression: sequenceConfig threading + totalSteps callback', () => {
    it('forwards sequenceConfig to buildDrainSequence instead of ignoring it', async () => {
      const executor = makeMockExecutor();
      const totalStepsSeen: number[] = [];

      const traces = await runDrainScenario(executor, {
        stepDelayMs: 0,
        sequenceConfig: { steps: 12 },
        onStep: (_history, _trace, _executed, totalSteps) => {
          totalStepsSeen.push(totalSteps);
        },
      });

      expect(traces.length).toBe(12);
      expect(totalStepsSeen).toEqual(Array(12).fill(12));
    });

    it('onStep reports the correct totalSteps for the default sequence length', async () => {
      const executor = makeMockExecutor();
      let lastTotal = 0;

      const traces = await runDrainScenario(executor, {
        stepDelayMs: 0,
        onStep: (_history, _trace, _executed, totalSteps) => {
          lastTotal = totalSteps;
        },
      });

      expect(lastTotal).toBe(traces.length);
    });
  });
});
