# Build Plan — Tiered Runway Triage Agent

Submission deadline: **Sep 6, 2026, 00:00 UTC**. Plan is organized purely by phase, not by calendar day — each phase runs until its exit checklist is green, then the next opens.

## How phase-gating works
Each phase below has: tasks, parallel tracks, an exit checklist, and a review step. **No phase starts until the previous phase's exit checklist is fully green and reviewed.** Where a phase splits into independent tracks, those run as parallel subagents; a review/integration step merges them before the gate opens.

Autonomy rule: I execute each phase's tracks without asking you at every step. I only stop and prompt you when I hit one of the flagged **[NEEDS YOU]** items below, or when a gate review surfaces something that changes scope/timeline.

---

## Phase 0 — Environment & Access Setup
Not parallelized — everything downstream depends on this.

**Tasks**
- Scaffold repo structure (TypeScript/Node, package.json, folder layout matching decision-engine / onchain / ui / tests separation)
- Install Synapse SDK, set up config/env handling
- Connect to Filecoin testnet, confirm `getAccountSummary` returns real data for a test wallet

**[NEEDS YOU]**
- Your testnet wallet's public address (never the private key in chat — that stays in a local `.env` I create and you fill in)
- Confirmed: new public GitHub repo — I'll propose a name and confirm before first push

**Exit checklist**
- [x] Repo scaffolded, dependencies install cleanly
- [x] One real, verified `getAccountSummary` call returns live testnet data (raw response logged, not assumed)

**Status: DONE.** Verified against real SDK source (`@filoz/synapse-core` v0.8.1 `get-account-summary.d.ts`), not docs summaries. Live call against wallet `0x044c40FBC017C74273eF402655391D4372Cf715e` on calibration testnet returned real epoch `4028086`, `funds: 0` (account not yet deposited into Filecoin Pay), and `runwayInEpochs`/`grossCoverageInEpochs` at max-uint256 (the contract's correct "infinite runway" sentinel when `lockupRatePerEpoch` is 0 — no active payment rail yet). This account will need a deposit + an active storage rail before runway becomes a finite, meaningful number — relevant for Phase 1/3.

**Review:** self-check passed — real SDK method names/shapes verified against package source, not assumed from docs. Confirmed before opening Phase 1.

---

## Phase 1 — Onchain Read Foundation
Two parallel tracks once Phase 0 is green.

**Track A (critical path):** Runway/forecast model
- Wire `getAccountSummary` → `runwayInEpochs` / `grossCoverageInEpochs`
- Build the forecast model anchored to observed spend/settlement events (not a static guess)
- Unit tests: forecast model against known synthetic spend sequences

**Track B (parallel, non-blocking):** PDP mock layer
- Build a mock provider PDP endpoint returning deterministic unverified/verifying/verified states, matching the real shape of `getNextChallengeEpoch`
- This lets the decision engine (Phase 2) build/test against a stable contract while real PDP integration happens later (Phase 3)

**Exit checklist**
- [x] Runway/forecast module has passing unit tests
- [x] Mock PDP module returns all three states on demand, matches expected real interface
- [x] Both merged, no conflicts

**Status: DONE.** `src/onchain/forecast.ts` (11 tests) + `src/onchain/pdp-status.ts` (6 tests), 17/17 passing, `tsc --noEmit` clean across the repo. Real Phase 3 import path for PDP verified against actual package exports (`@filoz/synapse-core/pdp-verifier`), not guessed.

**Review:** `/code-review` (medium) found 2 real bugs in `forecast.ts` — (1) the "sanity cross-check against wildly disagreeing derived value" was promised in a comment but never implemented (dead code, unreachable branch); (2) the max-uint256 sentinel was only checked when `lockupRatePerEpoch === 0n`, so an inconsistent contract state (nonzero rate + sentinel) would've produced a ~4e73-day finite forecast instead of "infinite". Both fixed with real logic + new tests (sentinel-wins-unconditionally, wildly-disagreeing-falls-back, roughly-agreeing-stays-high-confidence). Re-verified: 17/17 tests pass, clean type-check. Phase 2 gate open.

---

## Phase 2 — Decision Engine Core
Single track — this is the heart of the 30% judging criterion, sequential and carefully tested.

**Tasks**
- Implement three-tier bands (green ≥70%, yellow 30–70%, red <30%) against the forecast model
- Implement the compound rule: in red, top-up UNLESS PDP unverified → then hold payment + drop dataset
- Implement decision trace output: `band → forecast → PDP status → action → reason`
- Unit tests covering: all three bands, both red-band branches (top-up path AND drop path), edge cases at band boundaries

**Exit checklist**
- [x] Decision engine is a pure, isolated module (no UI/network dependencies)
- [x] Both red-band branches proven to trigger correctly in tests, not just the happy path
- [x] Trace output is human-readable and matches the format needed for demo narration

**Status: DONE.** `src/decision-engine/index.ts` — pure `evaluate(accountHistory, pdpStatus, config?) => DecisionTrace`. Three-tier bands (green >=70% inclusive, red <30% exclusive) measured against `grossCoverageInEpochs` (or an explicit `targetRunwayEpochs` override) as the 100% baseline. Compound red-band rule: PDP verified -> aggressive top-up to 100% baseline; unverified -> drop-dataset, no top-up; verifying (grace window) -> hold-and-monitor, neither top-up nor drop. 37/37 tests passing, clean type-check.

**Review:** `/code-review` (high) found 5 real issues, all fixed:
1. Top-up sizing returned `null` for a fully-exhausted account (0 epochs remaining, 0 rate) — exactly the scenario needing a concrete number most. Fixed with a fallback to the observed decline rate between the two most recent snapshots.
2. `epochsForPercent` truncated instead of rounding up, letting small baselines produce a self-contradictory "top-up of 0" in the yellow band. Fixed with ceiling division.
3. The unverified-branch reason string could render a literal "epoch null" when `nextChallengeEpoch` was unset. Fixed with a `?? 'unknown'` fallback.
4. No validation that `greenThresholdPercent > redThresholdPercent` — a misconfigured/swapped config would silently invert band semantics. Fixed: throws on construction.
5. The epoch-sort comparator was duplicated between `forecast.ts` and the decision engine, risking silent desync. Fixed by extracting a shared `sortByEpoch` export from `forecast.ts`.

5 new regression tests added (37 total, up from 32). Re-verified: all pass, clean type-check. Phase 3 gate open.

---

## Phase 3 — Real Integration: Payment Actions + Real PDP
Two parallel tracks.

**Track A:** Wire decision engine output to a real onchain action (top-up call, drop/terminate call) against testnet
**Track B:** Swap mock PDP for the real provider PDP check, validated against Phase 1's mock interface contract so the swap is low-risk

**[NEEDS YOU]**
- If the real provider PDP integration proves flaky/opaque under time pressure (a risk the mentor flagged), I will propose falling back to "PDP mock in demo, documented as real-interface-compatible" rather than risk a broken live demo — I'll flag this explicitly if it happens, not decide it silently.

**Exit checklist**
- [x] Real onchain top-up/drop actions wired (`src/onchain/actions.ts`) — genuinely call `synapse.payments.deposit()` / `synapse.storage.terminateService()`, not simulated
- [ ] At least one LIVE onchain top-up executes successfully against testnet — **blocked on USDFC funding**, see below
- [ ] At least one LIVE onchain drop/terminate executes successfully against testnet — **blocked on USDFC funding**, see below
- [x] Real PDP status feeds the decision engine without changing its interface (`RealPDPStatusChecker` now fully implemented, shares `deriveStatus` with the mock)

**Status: CODE DONE, LIVE VERIFICATION PENDING.** `src/onchain/actions.ts` (`executeDecision`) wires the decision engine's output to real SDK calls behind a narrow `ActionExecutor` interface (verified a real `Synapse` instance structurally satisfies it). `RealPDPStatusChecker.checkStatus` now does real contract reads (`getNextChallengeEpoch` + `getDataSetLastProvenEpoch` via `getContract`, run concurrently) instead of throwing a stub. 51/51 tests passing, clean type-check.

**[NEEDS YOU] — blocking live verification only, not the code itself:** the testnet wallet (`0x044c40FBC017C74273eF402655391D4372Cf715e`) has plenty of tFIL for gas but 0 USDFC — Filecoin Pay's token. Get testnet USDFC from https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc (5 tUSDFC/request, rate-limited to 1/60s). Without it we cannot deposit, create a real dataset/rail, or execute a live top-up/terminate — that live run is deferred to Phase 5 (Testing), where it's required before the exit checklist there can close. Phase 4 (UI + demo script) does not need this and proceeds now.

**Review:** `/code-review` (medium) found 2 minor issues in the real PDP implementation, both fixed: (1) the two contract reads ran sequentially instead of concurrently (`Promise.all`), doubling latency for no reason; (2) the rethrown error dropped the original error via missing `{ cause }`, inconsistent with `actions.ts`'s pattern. Manual full-cycle dry-run performed (forecast -> band -> PDP-gated decision -> action execution against a mocked chain), covering green/none, red+verified/top-up, and the critical red+unverified/drop-dataset path — all three fired correctly end-to-end. Phase 4 gate open (Phase 3's live-verification checkbox carries forward to Phase 5).

---

## Phase 4 — Observability UI + Demo Script
Two parallel tracks (UI has no dependency on Phase 3 internals beyond the trace format fixed in Phase 2).

**Track A:** Simple web UI — live runway/band/PDP-status/decision-trace view (started as early as Phase 2 against the trace format, finished here against real data)
**Track B:** Deterministic drain script — a scripted, repeatable sequence of spends that reliably forces the agent from green → yellow → red live, per the mentor's fragility warning about relying on live gas/RPC variance

**Exit checklist**
- [x] UI shows live state changes as the agent runs, decision trace visible in real time
- [x] Drain script reliably reproduces the red-band trigger on repeat runs (deterministic by construction — same sequence every run, verified via `assertSequenceCrossesAllBands`)

**Status: DONE.** `src/ui/server.ts` — zero-dependency Node `http` dashboard, polling-based live updates (`/state` JSON endpoint, 1.5s client poll) chosen over SSE for demo robustness. `src/demo/drain-scenario.ts` — deterministic 9-step green→yellow→red sequence, verified against the real `evaluate()` (not hardcoded bands). `src/demo/run-live-demo.ts` — the integration point wiring both together (built as independent parallel tracks, confirmed to genuinely interoperate via a dedicated integration test). `npm run demo` runs the full dashboard+scenario; `npm run demo:cli-only` runs the console-only narration. 63/63 tests passing, clean type-check.

**Review:** `/code-review` (medium) found 4 issues:
1. **Fixed** — the demo's direct-execution guard (`import.meta.url === file://${process.argv[1]}`) never matches on Windows (backslash path vs file:// URL), so `npm run demo` silently produced no output on this project's actual dev OS. Fixed with `pathToFileURL`, verified by actually running it.
2. **Fixed** — `DrainScenarioOptions.sequenceConfig` didn't exist; `runDrainScenario` ignored any attempt to customize step count/baseline/rate. Threaded through, plus `onStep` now reports `totalSteps` so the CLI doesn't hardcode "9".
3. **Fixed** — CLI hardcoded `/9` in its step display instead of deriving it.
4. **Flagged, not silently fixed** — the reviewer correctly noted the drain scenario and its CLI generate synthetic account snapshots and log simulated tx hashes, which taken alone would conflict with the "no simulated values" judging criterion. This is a deliberate, mentor-endorsed design choice (a scripted narrative layer for reliable live pacing), NOT a replacement for real onchain proof — that proof lives in Phase 0's live `getAccountSummary` call and Phase 3's real `deposit`/`terminateService` wiring, to be exercised live once USDFC funding lands (Phase 5). **Decision needed for the final demo/README: clearly label the drain-scenario segment as "scripted narrative" and pair it with a segment showing the real, funded, live testnet call — do not present the drain scenario alone as if it were live chain interaction.** Tracking this explicitly for Phase 6 (showcase materials).

Manual full-cycle dry-run performed (dashboard + drain scenario together, real HTTP requests against `/` and `/state`): confirmed the two independently-built tracks integrate correctly end-to-end. Phase 5 gate open.

---

## Phase 5 — Full Testing & Hardening
This is `docs/03-TEST.md` executed in full — not skipped.

**Tasks**
- Force both decision branches against real onchain state (not just unit tests)
- Verify no mocked/hardcoded value silently substitutes for a failed real call
- Clean-restart test of the full demo run
- Record a fallback demo video in case live conditions fail on submission day

**Exit checklist:** all boxes in `docs/03-TEST.md` checked.

**Review:** `/code-review` (medium, focused on error handling/edge cases) if any fixes were needed during testing.

---

## Phase 6 — Self-Evaluation & Showcase
Parallel tracks.

**Track A:** Run `loops evaluate --sponsor filecointldr`, act on feedback, run `docs/04-EVALUATE.md` rubric self-score
**Track B:** README, demo video edit, X post draft — content can be drafted in parallel with Track A using the Phase 5 recording and Phase 2 decision traces as source material

**[NEEDS YOU]**
- Final review/approval before I publish anything public: the X post, and before I run `loops project create`/`update` (submission is visible to the platform/judges) or push the repo public if it isn't already

**Exit checklist**
- [ ] Self-score against all 4 judging criteria completed, gaps addressed or consciously accepted
- [ ] README, video, X post ready
- [ ] Submission created/updated via `loops project`

---

## Parallelization summary
- Phase 1: Track A (runway/forecast) + Track B (mock PDP) — parallel
- Phase 3: Track A (real payment actions) + Track B (real PDP swap) — parallel
- Phase 4: Track A (UI) + Track B (demo script) — parallel
- Phase 6: Track A (evaluation) + Track B (showcase content) — parallel
- Phases 0, 2, 5 are single-track by necessity (setup, core logic, and testing are inherently sequential/critical-path)
