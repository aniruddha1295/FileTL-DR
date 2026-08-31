# Phase 2 — Build

Prerequisite: 01-IDEATE.md exit criteria are met (decision rule, actions, FOC primitive all named). If not, go back — building on a fuzzy decision rule wastes this phase.

## Judging lens for this phase
- **Autonomous budget decisions (30%)** — build the decision logic first, as its own testable unit, before any UI or polish. This is the part that must never be faked.
- **Meaningful use of Filecoin (20%)** — every balance/runway/proof value the agent acts on must come from a real onchain read, not a config value or mock.

## Architecture checklist

1. **Onchain read path**
   - [ ] Identify the exact contract/SDK call for balance and runway (Filecoin Pay docs / Synapse SDK).
   - [ ] Confirm it returns real, current data from testnet (log the raw response once, don't trust an assumption).
   - [ ] No hardcoded balances or runway numbers anywhere in the decision path.

2. **Decision engine (the core deliverable)**
   - [ ] Implement the if/then rule from 01-IDEATE.md as an isolated function/module, independent of any UI.
   - [ ] It takes onchain state in, returns a decision + a human-readable reason out.
   - [ ] Write down (in code comments or a log line) the *reason* for each decision — judges need to see the agent "explain the call."
   - [ ] Handle both branches: the case where budget is fine AND the case where it isn't. Demo must show both, or at least the "budget's tight" branch triggering visibly.

3. **Action execution**
   - [ ] Wire the decision engine's output to a real action: a Filecoin Pay top-up/settlement, a storage deal drop, a proof check via PDP, a delegated budget transfer, etc.
   - [ ] Action must actually execute onchain (or against the real testnet/SDK) — not print "would have done X."

4. **Observability (this is what makes the decision "watchable")**
   - [ ] Pick ONE mechanism: a live dashboard, a narrated CLI trace, or an event log a judge can scrub through. Don't build all three.
   - [ ] Every decision event should show: the onchain input that triggered it, the rule applied, the action taken, and the resulting new state (e.g., new runway).

5. **Scope control**
   - [ ] MVP cut list agreed up front — if time runs short, what's the first thing dropped? (e.g., multi-agent delegation before single-agent triage; fancy dashboard styling before the decision engine)
   - [ ] Don't build support for hypothetical future sponsors/bounties not in scope for this submission.

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
- Decision engine runs end-to-end against real onchain reads and produces a real onchain action, at least once.
- The specific moment of decision can be pointed to in code (a function/line) and in a run (a log line/dashboard event).
