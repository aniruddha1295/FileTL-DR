import type { Address, Hash } from 'viem';
import type { DecisionTrace } from '../decision-engine/index.js';

/**
 * Narrow interface capturing only what this module needs from a real
 * `Synapse` instance, so callers (and tests) can inject a minimal mock
 * without touching the network. A real `Synapse` instance structurally
 * satisfies this — see the type-only assertion in `client.ts`'s consumers /
 * the compile-time check exercised by `tsc`.
 */
export interface ActionExecutor {
  payments: {
    deposit(options: { amount: bigint; token?: string; to?: Address }): Promise<Hash>;
  };
  storage: {
    terminateService(options: { dataSetId: bigint; skipProvider?: boolean }): Promise<{
      txHash?: Hash;
      confirmedTxHash?: Hash;
      dataSetId: bigint;
      endEpoch: bigint;
    }>;
  };
}

export type ExecutedAction =
  | { kind: 'top-up'; txHash: Hash; amount: bigint }
  | { kind: 'drop-dataset'; txHash?: Hash; dataSetId: bigint; endEpoch: bigint }
  | { kind: 'no-op'; reason: string };

/**
 * Executes the real onchain action (if any) implied by a `DecisionTrace`.
 *
 * `none` and `hold-and-monitor` NEVER touch the chain — that's the whole
 * point of the compound decision engine deliberately choosing not to act.
 * `top-up` and `drop-dataset` call the real SDK methods on `executor`; any
 * failure is rethrown with additional context rather than swallowed or
 * papered over with a fake success.
 */
export async function executeDecision(
  executor: ActionExecutor,
  trace: DecisionTrace,
  dataSetId: bigint
): Promise<ExecutedAction> {
  switch (trace.action) {
    case 'top-up': {
      const amount = trace.details.suggestedTopUpAmount;
      if (amount === null || amount <= 0n) {
        return {
          kind: 'no-op',
          reason: `Decision engine proposed a top-up but no positive suggestedTopUpAmount could be sized (got ${
            amount === null ? 'null' : amount.toString()
          }) — refusing to call deposit() with an unsized/garbage amount.`,
        };
      }
      try {
        const txHash = await executor.payments.deposit({ amount });
        return { kind: 'top-up', txHash, amount };
      } catch (err) {
        throw new Error(
          `top-up deposit failed for amount ${amount.toString()}: ${err instanceof Error ? err.message : String(err)}`,
          { cause: err }
        );
      }
    }

    case 'drop-dataset': {
      try {
        const result = await executor.storage.terminateService({ dataSetId });
        return {
          kind: 'drop-dataset',
          txHash: result.txHash ?? result.confirmedTxHash,
          dataSetId: result.dataSetId,
          endEpoch: result.endEpoch,
        };
      } catch (err) {
        throw new Error(
          `drop-dataset terminateService failed for dataSetId ${dataSetId.toString()}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          { cause: err }
        );
      }
    }

    case 'none':
    case 'hold-and-monitor':
      return { kind: 'no-op', reason: trace.reason };
  }
}
