import { describe, expect, it, vi } from 'vitest';
import { executeDecision, type ActionExecutor } from '../src/onchain/actions.js';
import { evaluate } from '../src/decision-engine/index.js';
import { MAX_UINT256, type AccountSummarySnapshot } from '../src/onchain/forecast.js';
import type { PDPStatusResult } from '../src/onchain/pdp-status.js';

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

function makeLockupRateSnapshot(params: {
  epoch?: bigint;
  runwayInEpochs: bigint;
  grossCoverageInEpochs: bigint;
  ratePerEpoch?: bigint;
}): AccountSummarySnapshot {
  const rate = params.ratePerEpoch ?? 10n;
  return makeSnapshot({
    epoch: params.epoch ?? 1000n,
    lockupRatePerEpoch: rate,
    runwayInEpochs: params.runwayInEpochs,
    availableFunds: params.runwayInEpochs * rate,
    grossCoverageInEpochs: params.grossCoverageInEpochs,
  });
}

function makePdp(overrides: Partial<PDPStatusResult>): PDPStatusResult {
  return {
    dataSetId: 1n,
    currentEpoch: 1000n,
    lastProvenEpoch: 900n,
    nextChallengeEpoch: 1100n,
    status: 'verified',
    ...overrides,
  };
}

function makeMockExecutor(): ActionExecutor & {
  payments: { deposit: ReturnType<typeof vi.fn> };
  storage: { terminateService: ReturnType<typeof vi.fn> };
} {
  return {
    payments: { deposit: vi.fn() },
    storage: { terminateService: vi.fn() },
  };
}

describe('executeDecision', () => {
  it('top-up with a valid suggested amount calls deposit with exactly that amount', async () => {
    // Yellow band -> action 'top-up' with a sizable suggestedTopUpAmount.
    const history = [makeLockupRateSnapshot({ runwayInEpochs: 500n, grossCoverageInEpochs: 1000n })];
    const trace = evaluate(history, makePdp({ status: 'verified' }));
    expect(trace.action).toBe('top-up');
    const amount = trace.details.suggestedTopUpAmount;
    expect(amount).not.toBeNull();
    expect(amount! > 0n).toBe(true);

    const executor = makeMockExecutor();
    executor.payments.deposit.mockResolvedValue('0xdeadbeef');

    const result = await executeDecision(executor, trace, 1n);

    expect(executor.payments.deposit).toHaveBeenCalledTimes(1);
    expect(executor.payments.deposit).toHaveBeenCalledWith({ amount });
    expect(executor.storage.terminateService).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'top-up', txHash: '0xdeadbeef', amount });
  });

  it('top-up with a null suggestedTopUpAmount does NOT call deposit and returns no-op', async () => {
    // Craft a trace directly: 'top-up' action but unsizable amount (e.g.
    // insufficient rate data). We hand-construct this rather than hunting
    // for a real evaluate() scenario that produces action='top-up' with a
    // null amount, since that combination is deliberately rare/edge-case in
    // the engine itself.
    const history = [makeLockupRateSnapshot({ runwayInEpochs: 500n, grossCoverageInEpochs: 1000n })];
    const trace = evaluate(history, makePdp({ status: 'verified' }));
    const forcedTrace = {
      ...trace,
      action: 'top-up' as const,
      details: { ...trace.details, suggestedTopUpAmount: null },
    };

    const executor = makeMockExecutor();

    const result = await executeDecision(executor, forcedTrace, 1n);

    expect(executor.payments.deposit).not.toHaveBeenCalled();
    expect(executor.storage.terminateService).not.toHaveBeenCalled();
    expect(result.kind).toBe('no-op');
    if (result.kind === 'no-op') {
      expect(result.reason).toMatch(/unsized|null|could not be sized/i);
    }
  });

  it('top-up with suggestedTopUpAmount <= 0n does NOT call deposit and returns no-op', async () => {
    const history = [makeLockupRateSnapshot({ runwayInEpochs: 500n, grossCoverageInEpochs: 1000n })];
    const trace = evaluate(history, makePdp({ status: 'verified' }));
    const forcedTrace = {
      ...trace,
      action: 'top-up' as const,
      details: { ...trace.details, suggestedTopUpAmount: 0n },
    };

    const executor = makeMockExecutor();
    const result = await executeDecision(executor, forcedTrace, 1n);

    expect(executor.payments.deposit).not.toHaveBeenCalled();
    expect(result.kind).toBe('no-op');
  });

  it('drop-dataset calls terminateService with the right dataSetId and returns the right shape', async () => {
    // Red band + unverified PDP -> action 'drop-dataset'.
    const history = [makeLockupRateSnapshot({ runwayInEpochs: 100n, grossCoverageInEpochs: 1000n })];
    const trace = evaluate(history, makePdp({ status: 'unverified' }));
    expect(trace.action).toBe('drop-dataset');

    const executor = makeMockExecutor();
    executor.storage.terminateService.mockResolvedValue({
      txHash: '0xabc123',
      dataSetId: 42n,
      endEpoch: 12345n,
    });

    const result = await executeDecision(executor, trace, 42n);

    expect(executor.storage.terminateService).toHaveBeenCalledTimes(1);
    expect(executor.storage.terminateService).toHaveBeenCalledWith({ dataSetId: 42n });
    expect(executor.payments.deposit).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: 'drop-dataset',
      txHash: '0xabc123',
      dataSetId: 42n,
      endEpoch: 12345n,
    });
  });

  it('drop-dataset falls back to confirmedTxHash when txHash is absent', async () => {
    const history = [makeLockupRateSnapshot({ runwayInEpochs: 100n, grossCoverageInEpochs: 1000n })];
    const trace = evaluate(history, makePdp({ status: 'unverified' }));

    const executor = makeMockExecutor();
    executor.storage.terminateService.mockResolvedValue({
      confirmedTxHash: '0xconfirmed',
      dataSetId: 7n,
      endEpoch: 999n,
    });

    const result = await executeDecision(executor, trace, 7n);

    expect(result).toEqual({
      kind: 'drop-dataset',
      txHash: '0xconfirmed',
      dataSetId: 7n,
      endEpoch: 999n,
    });
  });

  it('action "none" calls NEITHER deposit NOR terminateService', async () => {
    const history = [makeLockupRateSnapshot({ runwayInEpochs: 800n, grossCoverageInEpochs: 1000n })];
    const trace = evaluate(history, makePdp({ status: 'verified' }));
    expect(trace.action).toBe('none');

    const executor = makeMockExecutor();
    const result = await executeDecision(executor, trace, 1n);

    expect(executor.payments.deposit).not.toHaveBeenCalled();
    expect(executor.storage.terminateService).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'no-op', reason: trace.reason });
  });

  it('action "hold-and-monitor" calls NEITHER deposit NOR terminateService', async () => {
    // insufficient-data forecast -> action 'hold-and-monitor'.
    const history = [makeSnapshot({ epoch: 10n })];
    const trace = evaluate(history, makePdp({ status: 'verifying' }));
    expect(trace.action).toBe('hold-and-monitor');

    const executor = makeMockExecutor();
    const result = await executeDecision(executor, trace, 1n);

    expect(executor.payments.deposit).not.toHaveBeenCalled();
    expect(executor.storage.terminateService).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: 'no-op', reason: trace.reason });
  });

  it('propagates a thrown error from deposit (does not swallow it)', async () => {
    const history = [makeLockupRateSnapshot({ runwayInEpochs: 500n, grossCoverageInEpochs: 1000n })];
    const trace = evaluate(history, makePdp({ status: 'verified' }));
    expect(trace.action).toBe('top-up');

    const executor = makeMockExecutor();
    executor.payments.deposit.mockRejectedValue(new Error('insufficient USDFC balance'));

    await expect(executeDecision(executor, trace, 1n)).rejects.toThrow(/top-up deposit failed/);
    await expect(executeDecision(executor, trace, 1n)).rejects.toThrow(/insufficient USDFC balance/);
  });

  it('propagates a thrown error from terminateService (does not swallow it)', async () => {
    const history = [makeLockupRateSnapshot({ runwayInEpochs: 100n, grossCoverageInEpochs: 1000n })];
    const trace = evaluate(history, makePdp({ status: 'unverified' }));
    expect(trace.action).toBe('drop-dataset');

    const executor = makeMockExecutor();
    executor.storage.terminateService.mockRejectedValue(new Error('revert: not the payer'));

    await expect(executeDecision(executor, trace, 1n)).rejects.toThrow(/drop-dataset terminateService failed/);
    await expect(executeDecision(executor, trace, 1n)).rejects.toThrow(/revert: not the payer/);
  });
});
