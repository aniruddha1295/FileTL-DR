# Phase 2 — Build

Prerequisite: 01-IDEATE.md exit criteria are met (decision rule, actions, FOC primitive all named). If not, go back — building on a fuzzy decision rule wastes this phase.

## Judging lens for this phase
- **Autonomous budget decisions (30%)** — build the decision logic first, as its own testable unit, before any UI or polish. This is the part that must never be faked.
- **Meaningful use of Filecoin (20%)** — every balance/runway/proof value the agent acts on must come from a real onchain read, not a config value or mock.

## Architecture checklist

1. **Onchain read path**
   - [x] Identify the exact contract/SDK call for balance and runway (Filecoin Pay docs / Synapse SDK). → `synapse.payments.accountSummary()`, verified against `@filoz/synapse-core` source, not docs summaries (Phase 0).
   - [x] Confirm it returns real, current data from testnet (log the raw response once, don't trust an assumption). → done live in Phase 0 and again in the Phase 3/5 live verification (`src/onchain/live-verify.ts`).
   - [x] No hardcoded balances or runway numbers anywhere in the decision path. → `forecastRunway`/`evaluate` take real `AccountSummary` history only; no constants substitute for a read.

2. **Decision engine (the core deliverable)**
   - [x] Implement the if/then rule from 01-IDEATE.md as an isolated function/module, independent of any UI. → `src/decision-engine/index.ts`, pure, zero I/O.
   - [x] It takes onchain state in, returns a decision + a human-readable reason out. → `DecisionTrace.reason`.
   - [x] Write down (in code comments or a log line) the *reason* for each decision. → every `evaluate()` call returns a plain-English `reason` referencing the real band/percent/PDP status.
   - [x] Handle both branches: budget fine AND budget tight. → three-tier bands + the compound red-band branch (verified/verifying/unverified), all covered by tests and by the live-verify run (green/none case) and the demo drain scenario (all three bands + both red-band outcomes).

3. **Action execution**
   - [x] Wire the decision engine's output to a real action. → `src/onchain/actions.ts` (`executeDecision`) calls real `payments.deposit()` / `storage.terminateService()`.
   - [x] Action must actually execute onchain, not print "would have done X." → live-verified: real deposit (block 4033898) and real terminate, both confirmed on-chain — see `docs/BUILD-PLAN.md` Phase 3.

4. **Observability (this is what makes the decision "watchable")**
   - [x] Pick ONE mechanism. → a live dashboard (`src/ui/server.ts`), not a narrated-CLI-only or log-scrub approach.
   - [x] Every decision event shows: the onchain input, the rule applied, the action taken, and the resulting state. → the dashboard's decision log entries + `DecisionTraceDetails`.

5. **Scope control**
   - [x] MVP cut list agreed up front. → single provider/dataset scope held throughout; multi-dataset triage, disputes, and multi-rail settlement explicitly cut (see `docs/01-IDEATE.md`).
   - [x] No support built for hypothetical future sponsors/bounties out of scope.

## Suggested build order
1. Get a testnet wallet funded and confirm you can read its Filecoin Pay balance/runway from code. Do this before writing any agent logic.
2. Build and unit-test the decision engine in isolation (feed it fake-but-realistic onchain states, assert on the decision).
3. Wire the decision engine to the real onchain read (replace fake input with live read).
4. Wire the decision engine's output to a real onchain action.
5. Add the observability layer last, once the underlying flow works headless.

## Reference docs (pull specifics from these, don't guess API shapes)
- Filecoin Onchain Cloud docs — https://docs.filecoin.cloud
- Filecoin docs — https://docs.filecoin.io
- Gstack (reference implementation/toolkit) — https://github.com/garrytan/gstack

## Exit criteria for this phase
- [x] Decision engine runs end-to-end against real onchain reads and produces a real onchain action, at least once. → live-verified, `docs/BUILD-PLAN.md` Phase 3/5.
- [x] The specific moment of decision can be pointed to in code (`src/decision-engine/index.ts`, `evaluate()`) and in a run (dashboard decision-log entry, or `[step] band=... action=...` CLI line).

**Phase complete.** See `docs/BUILD-PLAN.md` Phases 0–4 for the full build log, including every bug caught by code review and fixed before gating forward.
