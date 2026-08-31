# FilecoinTLDR Builder Challenge - Cycle 4

This project is a submission for the FilecoinTLDR Builder Challenge (Cycle 4). Full challenge brief: see `CHALLENGE.md` in this directory.

## MANDATORY: use the `loops-filecointldr-builder-challenge-cycle-4` skill
Invoke the `loops-filecointldr-builder-challenge-cycle-4` skill for ANY work in this repo touching: this hackathon, its sponsors or bounties, ideation ("what should I build"), sponsor docs/SDKs (Filecoin Pay, Synapse SDK, PDP, Warm Storage, etc.), the project submission, or evaluating the project against judging criteria. Do not answer these from general knowledge or the static docs alone — query the skill first, every time, even if the user doesn't say "loops" or name the skill. This is not optional/best-effort — treat it as a required step before responding on any of the above topics.

## Goal
Build an AI agent, workflow, or tool that reads its own onchain balance/runway on Filecoin Pay and *acts* on it autonomously (top up, cut unaffordable storage, or decide what's worth paying to keep). The decision-making must be visible and autonomous — not a human making each call.

## Build directions (pick one or invent your own)
- Stay alive: watch runway, top up before it runs dry
- Triage: decide which data to keep when budget is tight, explain the reasoning
- Show the meter: dashboard visualizing agent spend/settle/justify decisions
- Delegate: one agent funds another's work and enforces a budget
- Pay on proof: payment only released once work is provably done

## Constraints
- Must interact with the real Filecoin stack (Filecoin Pay / Filecoin Onchain Cloud), not simulate it.
- The agent's decision process should be observable (logs, dashboard, or live narration), not just a final log entry.

## Judging weights (design/prioritize accordingly)
1. Autonomous budget decisions — 30% (the core requirement; must be a demonstrable decision moment, not just store+pay)
2. Working demo quality — 25% (must actually run end-to-end, not a mockup)
3. Meaningful use of Filecoin — 20% (real onchain balances/payments/proofs via Filecoin Pay, Synapse SDK, PDP, or Warm Storage — no hardcoded/simulated values)
4. Clarity of explanation + public showcase — 15% (README, demo video, X post)

## Key resources
- Filecoin Onchain Cloud docs: https://docs.filecoin.cloud
- Filecoin docs: https://docs.filecoin.io
- Gstack (reference implementation/toolkit): https://github.com/garrytan/gstack

## Phase docs — read the one matching current work
This project moves through four phases, each with its own doc in `docs/`. Before doing work in a given phase, read that phase's doc and follow its checklist/exit criteria — don't skip ahead.
- `docs/00-OVERVIEW.md` — index + judging weights
- `docs/01-IDEATE.md` — use while choosing the concept/decision rule
- `docs/02-BUILD.md` — use while implementing the decision engine and onchain integration
- `docs/03-TEST.md` — use while verifying the end-to-end demo works against real onchain state
- `docs/04-EVALUATE.md` — use before submission, to self-score against judging criteria and prep the showcase materials
