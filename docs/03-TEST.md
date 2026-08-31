# Phase 3 — Test

Prerequisite: 02-BUILD.md exit criteria met (end-to-end run against real onchain state has happened at least once).

## Judging lens for this phase
- **Working demo quality (25%)** — judges must be able to run or watch the core flow end-to-end, clearly, without you explaining around gaps.
- **Meaningful use of Filecoin (20%)** — verify, don't assume, that every number on screen is a real onchain value.

## Test checklist

### Correctness of the decision logic
- [ ] Force the "budget is fine" state and confirm the agent takes the expected no-action / low-priority action.
- [ ] Force the "budget is tight/insufficient" state (e.g., drain a testnet balance, or use a low-funded wallet) and confirm the agent actually branches — this is the single most important test in the whole project.
- [ ] Confirm the reason/explanation output changes appropriately between branches (not a static string).

### Realness of onchain interaction
- [ ] Pull up a block explorer or the raw SDK response during a run and visually confirm the balance/runway/proof shown in your UI matches what's actually onchain.
- [ ] Confirm no fallback/mocked value silently substitutes for a failed real call (check error handling doesn't mask a broken integration as a fake "success").
- [ ] If using PDP: confirm a real proof check happens, not a hardcoded "proof valid" flag.

### End-to-end demo run
- [ ] Time a full clean run from a fresh state (restart, don't rely on leftover session state that only works once).
- [ ] Confirm the "moment of decision" is visible and identifiable within the run, not buried in scrollback.
- [ ] Test the failure path too: what happens if the RPC/API is briefly unavailable? Should degrade visibly, not crash silently mid-demo.

### Non-happy-path robustness (only as much as the demo window needs)
- [ ] Re-running the demo twice in a row doesn't require manual cleanup/reset steps you'll forget under pressure.
- [ ] If demoing live, have a pre-recorded fallback (screen recording) in case of network/testnet flakiness during judging.

## What NOT to spend time on here
- Full test suites / edge cases unrelated to the judged flow — this is a hackathon demo, not production software. Test what judges will see and the one decision branch that matters; skip exhaustive coverage.

## Exit criteria for this phase
- A clean, repeatable end-to-end run exists, confirmed against real onchain data, showing both decision branches (or at minimum, the "budget's tight" branch triggering visibly).
- A recorded fallback exists in case live demo conditions fail.
