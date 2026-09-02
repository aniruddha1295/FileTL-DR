# Docs Index — FilecoinTLDR Cycle 4

Use these in order. Each phase doc is self-contained: read it at the start of that phase, work through its checklist, don't move on until its "exit criteria" are met.

| Phase | Doc | Feeds judging criteria |
|---|---|---|
| 1. Ideate | [01-IDEATE.md](01-IDEATE.md) | Autonomous budget decisions (30%), Meaningful use of Filecoin (20%) |
| 2. Build | [02-BUILD.md](02-BUILD.md) | Autonomous budget decisions (30%), Meaningful use of Filecoin (20%) |
| 3. Test | [03-TEST.md](03-TEST.md) | Working demo quality (25%), Meaningful use of Filecoin (20%) |
| 4. Evaluate & Showcase | [04-EVALUATE.md](04-EVALUATE.md) | Clarity of explanation + public showcase (15%), + final score check across all four |

Source brief: [../CHALLENGE.md](../CHALLENGE.md). Full judging weights also live in [../CLAUDE.md](../CLAUDE.md).

**The actual execution log lives in [BUILD-PLAN.md](BUILD-PLAN.md)** — a concrete, phase-gated build plan (Phase 0 through 6) with real exit criteria, code-review findings, and live-verification evidence for each phase, superseding the generic checklists below once building started. Read `BUILD-PLAN.md` first for "where are we now"; use 01–04 below for the reasoning/checklists behind each phase.

## Current status (2026-09-02)
Phases 0–5 substantially complete: real Synapse SDK integration, the decision engine (37 tests, high-effort reviewed), real payment/PDP actions, a live dashboard + deterministic demo, and a full live on-chain verification run on calibration testnet (real deposit, real dataset, real PDP proof, real termination — see `BUILD-PLAN.md` Phase 3/5 and the README). Remaining: Phase 6 showcase (demo video, X post, `loops evaluate` self-score) before the Sep 6, 2026 00:00 UTC submission deadline.

## Judging weights, for reference in every phase
1. Autonomous budget decisions — 30%
2. Working demo quality — 25%
3. Meaningful use of Filecoin — 20%
4. Clarity of explanation + public showcase — 15%

The rule that overrides every design decision below: **if a human makes the call, it doesn't count.** The agent must read real onchain state and visibly branch its behavior on it.
