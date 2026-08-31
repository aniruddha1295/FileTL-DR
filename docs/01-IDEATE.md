# Phase 1 — Ideate

Goal of this phase: land on ONE concrete concept where the decision (not the transaction) is the demo. Don't start building until every question below has a written answer.

## Judging lens for this phase
- **Autonomous budget decisions (30%)** — this is decided almost entirely at ideation. If the idea doesn't have a clear, pointable "moment of decision," no amount of good engineering later fixes it.
- **Meaningful use of Filecoin (20%)** — the idea must require a real FOC primitive (Filecoin Pay, Synapse SDK, PDP, Warm Storage), not one bolted on after the fact.

## Pick a direction
- [ ] **Stay alive** — agent watches its runway, tops itself up before it runs dry
- [ ] **Triage** — budget is tight, agent decides what data to keep/drop and explains why
- [ ] **Show the meter** — dashboard where you watch an agent spend, settle, justify each transaction
- [ ] **Delegate** — one agent funds another's work and enforces a budget on it
- [ ] **Pay on proof** — payment only releases once work is provably done
- [ ] **Invent your own** — must still have a single, pointable decision moment

## Forcing questions (answer all before moving to Build)

1. **What onchain value does the agent read?** (balance, runway in epochs, PDP proof status, etc.) Name the exact call/contract/SDK method.
2. **What is the decision rule?** State it as an if/then. E.g. "if runway < 3 days, drop the lowest-priority dataset" — not "the agent manages storage smartly."
3. **What are the possible actions?** (top up, deprioritize/delete a dataset, delay a write, delegate budget to sub-agent, release payment on proof). Pick 2-3 max for the demo.
4. **How will a judge SEE the decision happen**, live, not in a log after the fact? (a dashboard event, a narrated CLI run, a webhook firing, a before/after balance shown on screen)
5. **Which FOC primitive is load-bearing?** Filecoin Pay (payment rails/streaming), Synapse SDK, PDP (proof of data possession), Warm Storage — pick the one(s) actually necessary for the decision, not decorative.
6. **What's the smallest real onchain setup that proves this isn't simulated?** (testnet wallet, funded Filecoin Pay stream, a couple of small deals/proofs) — plan this now since funding/faucet delays are the easiest thing to discover too late.
7. **What's the failure mode if this doesn't work end-to-end in the demo window?** Have a fallback scope cut identified now (see 02-BUILD.md's MVP cut list).

## Anti-patterns to reject at this stage
- "Agent stores files and pays for storage" with no branch in behavior — scores ~0 on the 30% criterion.
- Balance/runway numbers computed in your own backend instead of read from chain — scores poorly on Meaningful use of Filecoin.
- A decision that only ever fires one way in the demo (no real "what if it can't afford it" path shown).

## Exit criteria for this phase
- One direction chosen, one sentence describing the decision moment.
- Answers to all 7 forcing questions written down (in this file or a linked note).
- The specific FOC primitive(s) and SDK/API calls identified by name.

## Notes / chosen concept

**Chosen: Tiered Runway Triage Agent** (saved as loops artifact `5018a98c-d05e-45bc-9489-2412d956dc5c`)

- Direction: Triage + Pay-on-proof, combined.
- Decision moment: one provider/one dataset account hits a runway band (green/yellow/red); in red, agent either tops up OR — if the provider's PDP proof for the current challenge epoch is unverified — holds payment and drops the dataset instead. Every check logs `band -> forecast -> PDP status -> action -> reason`.
- FOC primitives: Filecoin Pay (`getAccountSummary`, runwayInEpochs/grossCoverageInEpochs) chained with PDP (`getNextChallengeEpoch` / proof verification) — deliberately one compound pairing, not three, per mentor guidance.
- Demo: scripted deterministic wallet-drain sequence forces red band live, so the decision is watched, not read from a log.
- Risk mitigation: build/prove the compound rule against a mocked PDP endpoint first, swap to real provider once solid.
- MVP scope: single provider, single dataset, single account. Cut: multi-provider, multi-dataset triage, disputes, full multi-rail settlement.
- Stack: TypeScript/Node.js + Synapse SDK, testnet wallet, simple web UI (live runway/band/PDP status/decision trace).
- Full spec in the saved artifact above (`loops artifact list --event filecointldr-builder-challenge-cycle-4` to view).
