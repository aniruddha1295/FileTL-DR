import type { Chain, Client, Transport } from 'viem';
// Real Phase 3 dependencies, verified against installed package source at
// node_modules/@filoz/synapse-core/dist/src/pdp-verifier/get-next-challenge-epoch.d.ts (v0.8.1):
//   namespace getNextChallengeEpoch {
//     type OptionsType = { dataSetId: bigint; contractAddress?: Address };
//     type OutputType = bigint | null;
//   }
//   function getNextChallengeEpoch(client: Client<Transport, Chain>, options: getNextChallengeEpoch.OptionsType): Promise<getNextChallengeEpoch.OutputType>;
//
// and node_modules/@filoz/synapse-core/dist/src/pdp-verifier/index.d.ts (v0.8.1):
//   namespace getContract {
//     type OptionsType = { client: Client<Transport, Chain>; address?: Address };
//     type OutputType = GetContractReturnType<typeof pdpAbi, Client<Transport, Chain>>;
//   }
//   function getContract(options: getContract.OptionsType): getContract.OutputType;
//
// `getContract`'s returned viem contract instance exposes `.read.getDataSetLastProvenEpoch([dataSetId])`,
// confirmed against the generated PDP ABI at
// node_modules/@filoz/synapse-core/dist/src/pdp-verifier/get-next-challenge-epoch.d.ts's embedded
// `pdpVerifierAbi` (the same ABI `getContract` wires up via `chain.contracts.pdp.abi`), which declares:
//   { type: 'function', name: 'getDataSetLastProvenEpoch', inputs: [{ name: 'setId', type: 'uint256' }],
//     outputs: [{ type: 'uint256' }], stateMutability: 'view' }
// The `/pdp-verifier` subpath export is declared in @filoz/synapse-core's package.json
// `exports` map (-> dist/src/pdp-verifier/index.d.ts), so this import resolves for real.
import { getContract, getNextChallengeEpoch } from '@filoz/synapse-core/pdp-verifier';

/**
 * Number of epochs of grace given to a storage provider after
 * `nextChallengeEpoch` has passed before we consider the data set
 * definitively `unverified` (i.e. the provider missed its proving window).
 *
 * This models the real-world operational slack between "a challenge is due"
 * and "the provider is provably delinquent" — PDPVerifier itself does not
 * expose a single on-chain "grace" constant for this purpose, so we pick a
 * conservative default here for the mock/decision-engine layer. Phase 3 can
 * tune this against real `getChallengeRange` / `getDataSetLastProvenEpoch`
 * behavior once wired to a live contract.
 */
export const CHALLENGE_GRACE_EPOCHS = 60n;

export type PDPStatus = 'verified' | 'verifying' | 'unverified';

export interface PDPStatusResult {
  dataSetId: bigint;
  currentEpoch: bigint;
  lastProvenEpoch: bigint | null;
  nextChallengeEpoch: bigint | null;
  status: PDPStatus;
}

export interface PDPStatusChecker {
  checkStatus(dataSetId: bigint, currentEpoch: bigint): Promise<PDPStatusResult>;
}

/**
 * Derives a `PDPStatus` from the raw on-chain-shaped inputs, modeling real
 * PDPVerifier semantics (`getDataSetLastProvenEpoch`, `getNextChallengeEpoch`,
 * `pieceChallengable`, `getChallengeRange`) at the granularity the Phase 2
 * decision engine needs:
 *
 * - `verified`: a proof has been submitted at least once (`lastProvenEpoch`
 *   is not null) AND we have not yet reached the next challenge epoch
 *   (`currentEpoch < nextChallengeEpoch`). The proof on file is still
 *   "fresh" relative to the proving schedule.
 *
 * - `verifying`: we are at or past the next challenge epoch
 *   (`currentEpoch >= nextChallengeEpoch`) but still within
 *   `CHALLENGE_GRACE_EPOCHS` of it. The provider is expected to submit a
 *   proof imminently (challenge window is open/active), so this is treated
 *   as a transient, non-blocking state rather than a failure.
 *
 * - `unverified`: either no proof has ever been submitted
 *   (`lastProvenEpoch === null`), or `currentEpoch` has moved past
 *   `nextChallengeEpoch + CHALLENGE_GRACE_EPOCHS` with no new proof — the
 *   provider missed its challenge window. This is the state that should
 *   block payment in the Phase 2 decision engine.
 */
function deriveStatus(
  currentEpoch: bigint,
  lastProvenEpoch: bigint | null,
  nextChallengeEpoch: bigint | null,
): PDPStatus {
  if (lastProvenEpoch === null) {
    return 'unverified';
  }

  if (nextChallengeEpoch === null) {
    // No pending challenge scheduled but a proof exists on record; treat as
    // verified since there is nothing outstanding to fail against.
    return 'verified';
  }

  if (currentEpoch < nextChallengeEpoch) {
    return 'verified';
  }

  const deadline = nextChallengeEpoch + CHALLENGE_GRACE_EPOCHS;
  if (currentEpoch <= deadline) {
    return 'verifying';
  }

  return 'unverified';
}

interface DataSetState {
  lastProvenEpoch: bigint | null;
  nextChallengeEpoch: bigint | null;
}

/**
 * Deterministic, in-memory mock of `PDPStatusChecker`. Backs the Phase 2
 * decision engine during development, and gives Phase 4 demo scripting a way
 * to drive a data set through verified -> verifying -> unverified
 * transitions on demand via `setState`.
 */
export class MockPDPStatusChecker implements PDPStatusChecker {
  private readonly state = new Map<bigint, DataSetState>();

  constructor(initialState?: Map<bigint, DataSetState>) {
    if (initialState) {
      for (const [dataSetId, s] of initialState) {
        this.state.set(dataSetId, { ...s });
      }
    }
  }

  /** Force/mutate the stored state for a given data set. */
  setState(dataSetId: bigint, state: DataSetState): void {
    this.state.set(dataSetId, { ...state });
  }

  async checkStatus(dataSetId: bigint, currentEpoch: bigint): Promise<PDPStatusResult> {
    const s = this.state.get(dataSetId) ?? { lastProvenEpoch: null, nextChallengeEpoch: null };
    const status = deriveStatus(currentEpoch, s.lastProvenEpoch, s.nextChallengeEpoch);
    return {
      dataSetId,
      currentEpoch,
      lastProvenEpoch: s.lastProvenEpoch,
      nextChallengeEpoch: s.nextChallengeEpoch,
      status,
    };
  }
}

/** Injectable on-chain read functions, so tests can stub them without mocking viem itself. */
export interface RealPDPStatusCheckerDeps {
  getNextChallengeEpoch: typeof getNextChallengeEpoch;
  getContract: typeof getContract;
}

const defaultDeps: RealPDPStatusCheckerDeps = { getNextChallengeEpoch, getContract };

/**
 * Real, on-chain-backed implementation, backed by two PDPVerifier reads:
 *
 * - `getNextChallengeEpoch(client, { dataSetId })` — real wrapper exported by
 *   `@filoz/synapse-core/pdp-verifier`; already returns `null` when there is
 *   no pending challenge (including when the data set is not live).
 * - `getContract({ client }).read.getDataSetLastProvenEpoch([dataSetId])` —
 *   there is no dedicated wrapper for this read, so we go through the raw
 *   viem contract instance returned by `getContract` (same helper
 *   `getNextChallengeEpoch` itself is built on top of) against the
 *   PDPVerifier ABI's `getDataSetLastProvenEpoch(uint256 setId) -> uint256`
 *   view function. The contract returns `0n` both for "at epoch zero" and
 *   for "never proven"; since a live testnet/mainnet data set can never
 *   actually have its last-proven epoch pinned at genesis (epoch 0 predates
 *   any real data set), we treat `0n` as the "never proven" sentinel and map
 *   it to `lastProvenEpoch: null`, matching `deriveStatus`'s existing
 *   never-proven semantics (see `MockPDPStatusChecker`'s same convention).
 *
 * Both reads are wrapped in a single try/catch that rethrows with the
 * `dataSetId` for context — errors are never swallowed or replaced with a
 * fabricated status.
 */
export class RealPDPStatusChecker implements PDPStatusChecker {
  private readonly deps: RealPDPStatusCheckerDeps;

  constructor(
    private readonly client: Client<Transport, Chain>,
    deps: RealPDPStatusCheckerDeps = defaultDeps,
  ) {
    this.deps = deps;
  }

  async checkStatus(dataSetId: bigint, currentEpoch: bigint): Promise<PDPStatusResult> {
    let lastProvenEpoch: bigint | null;
    let nextChallengeEpoch: bigint | null;

    try {
      // Neither read depends on the other's result — run them concurrently
      // instead of paying two sequential RPC round-trips.
      const contract = this.deps.getContract({ client: this.client });
      const [nextChallenge, rawLastProvenEpoch] = await Promise.all([
        this.deps.getNextChallengeEpoch(this.client, { dataSetId }),
        contract.read.getDataSetLastProvenEpoch([dataSetId]),
      ]);
      nextChallengeEpoch = nextChallenge;
      lastProvenEpoch = rawLastProvenEpoch === 0n ? null : rawLastProvenEpoch;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`PDP status check failed for dataSetId ${dataSetId}: ${reason}`, { cause: error });
    }

    const status = deriveStatus(currentEpoch, lastProvenEpoch, nextChallengeEpoch);

    return {
      dataSetId,
      currentEpoch,
      lastProvenEpoch,
      nextChallengeEpoch,
      status,
    };
  }
}
