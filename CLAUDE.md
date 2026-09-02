# FilecoinTLDR Builder Challenge - Cycle 4

This project is a submission for the FilecoinTLDR Builder Challenge (Cycle 4). Full challenge brief: see `CHALLENGE.md` in this directory.

## MANDATORY: use the `loops-filecointldr-builder-challenge-cycle-4` skill
Invoke the `loops-filecointldr-builder-challenge-cycle-4` skill for ANY work in this repo touching: this hackathon, its sponsors or bounties, ideation ("what should I build"), sponsor docs/SDKs (Filecoin Pay, Synapse SDK, PDP, Warm Storage, etc.), the project submission, or evaluating the project against judging criteria. Do not answer these from general knowledge or the static docs alone — query the skill first, every time, even if the user doesn't say "loops" or name the skill. This is not optional/best-effort — treat it as a required step before responding on any of the above topics.

## Goal
Build an AI agent, workflow, or tool that reads its own onchain balance/runway on Filecoin Pay and *acts* on it autonomously (top up, cut unaffordable storage, or decide what's worth paying to keep). The decision-making must be visible and autonomous — not a human making each call.

## Chosen concept: Tiered Runway Triage Agent
Decided (see `docs/01-IDEATE.md`'s "Notes / chosen concept" for the full reasoning) — a combined Triage + Pay-on-proof direction: a single-account, single-dataset agent that reads its Filecoin Pay runway into three tiers (green/yellow/red) and, in the red tier, chains a second real primitive — PDP proof status — into the decision: top up if the provider's proof verifies, drop the dataset (no top-up) if it doesn't. Repo: https://github.com/aniruddha1295/FileTL-DR.

**For current build status, read [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) first** — it's the concrete, phase-gated execution log (real exit criteria, code-review findings, live-verification evidence) that superseded the generic candidate-direction brainstorming below once building started.

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
- `docs/BUILD-PLAN.md` — **the actual execution log; read this first.** Phase 0–6, gated on real exit criteria, updated after every phase with code-review findings and (from Phase 3 onward) live on-chain verification evidence.
- `docs/00-OVERVIEW.md` — index + judging weights
- `docs/01-IDEATE.md` — the ideation reasoning behind the chosen concept (already decided, see above)
- `docs/02-BUILD.md` — build-phase checklist, now checked off against what was actually built
- `docs/03-TEST.md` — testing checklist, now checked off against the live verification actually performed
- `docs/04-EVALUATE.md` — self-scoring rubric; filled in, with the two remaining gaps (demo video, X post) explicitly marked
