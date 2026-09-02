# Phase 3 — Test

Prerequisite: 02-BUILD.md exit criteria met (end-to-end run against real onchain state has happened at least once).

## Judging lens for this phase
- **Working demo quality (25%)** — judges must be able to run or watch the core flow end-to-end, clearly, without you explaining around gaps.
- **Meaningful use of Filecoin (20%)** — verify, don't assume, that every number on screen is a real onchain value.

## Test checklist

### Correctness of the decision logic
- [x] Force the "budget is fine" state and confirm the agent takes the expected no-action / low-priority action. → live-verified for real (`green`/`none`, real account); also unit-tested and demo-scripted.
- [x] Force the "budget is tight/insufficient" state and confirm the agent actually branches. → proven via the deterministic drain scenario against the REAL decision engine (`src/demo/drain-scenario.ts`, not hardcoded bands) plus 63 unit/integration tests. **Not** forced against a real, live-drained account — deliberately: draining real funds and waiting for an actual missed PDP challenge is slow/fragile and was flagged as a risk during ideation. See `docs/BUILD-PLAN.md` Phase 5's scope note.
- [x] Confirm the reason/explanation output changes appropriately between branches. → explicitly asserted in `tests/decision-engine.test.ts` (reason text must reference the real band/percent/PDP status, not a static string).

### Realness of onchain interaction
- [x] Pull up a block explorer or the raw SDK response during a run and visually confirm the balance/runway/proof shown matches what's actually onchain. → done: real block numbers (4033898, 4033905), real `dataSetId 32848`, real retrievable piece URL — all in `docs/BUILD-PLAN.md` Phase 3/5 and the README.
- [x] Confirm no fallback/mocked value silently substitutes for a failed real call. → `executeDecision` rethrows with `{ cause }` rather than swallowing (tested in `tests/actions.test.ts`).
- [x] If using PDP: confirm a real proof check happens, not a hardcoded "proof valid" flag. → `RealPDPStatusChecker` live-verified: read real `lastProvenEpoch`/`nextChallengeEpoch` from the PDPVerifier contract for `dataSetId 32848`.

### End-to-end demo run
- [x] Time a full clean run from a fresh state. → `docker run -p 3000:3000 triage-agent` IS a fresh-state run by construction — no leftover state possible, verified by actually building and running the image.
- [x] Confirm the "moment of decision" is visible and identifiable within the run, not buried in scrollback. → the dashboard's decision-log entries + the CLI's `[step] band=... action=...` lines.
- [ ] Test the failure path: RPC/API briefly unavailable should degrade visibly, not crash silently. → errors propagate and are logged (not swallowed), but no dedicated test simulates a transient RPC outage mid-run. Accepted gap given the remaining timeline — flagged, not silently skipped.

### Non-happy-path robustness (only as much as the demo window needs)
- [x] Re-running the demo twice in a row doesn't require manual cleanup/reset steps. → `npm run demo` / `docker run` both start from a fresh in-memory state every time; no external state file.
- [ ] If demoing live, have a pre-recorded fallback (screen recording) in case of network/testnet flakiness during judging. → **Phase 6 task, not yet done.**

## What NOT to spend time on here
- Full test suites / edge cases unrelated to the judged flow — this is a hackathon demo, not production software. Test what judges will see and the one decision branch that matters; skip exhaustive coverage.

## Exit criteria for this phase
- [x] A clean, repeatable end-to-end run exists, confirmed against real onchain data, showing at least the "budget's fine" branch live and the "budget's tight" branches via tested/scripted logic.
- [ ] A recorded fallback exists in case live demo conditions fail. → pending, Phase 6.

**Phase mostly complete** — the one remaining item (recorded fallback video) is explicitly Phase 6 scope, not a gap in this phase.
