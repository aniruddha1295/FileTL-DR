# Phase 4 — Evaluate & Showcase

Prerequisite: 03-TEST.md exit criteria met. Use this doc to self-score before submitting, exactly the way judges will.

## Self-scoring rubric (mirror the real judging weights)

### 1. Autonomous budget decisions — 30%
- [x] Can you point to the exact line of code / log event / dashboard moment where the agent reads onchain state and decides? → `src/decision-engine/index.ts`, `evaluate()`; dashboard decision-log entry per step.
- [x] Does the demo show the agent's behavior actually changing based on what it read? → green/none, yellow/top-up, red+verified/top-up, red+unverified/drop-dataset — all four distinct, all tested, all demoed.
- [x] Is there zero human-in-the-loop for the decision itself? → yes; a human only sets thresholds/config beforehand, `evaluate()` decides at runtime with no human call.
- **Self-score: strong.** The compound runway+PDP rule (not a single threshold) and the live-verified real green/none decision are the strongest evidence here.

### 2. Working demo quality — 25%
- [x] Does it run, live or via a video, start to finish, without narrating around a broken part? → `docker run -p 3000:3000 triage-agent`, verified working end-to-end including the container build itself running the full test suite.
- [x] Is the core flow legible to someone seeing it for the first time in ~2 minutes? → dashboard shows band/runway/PDP-status/reason live; ~15s scripted run to full climax.
- [x] Is it clearly more than a mockup/UI shell? → real decision engine executes every step; real Synapse SDK calls exist and are live-verified separately.
- **Self-score: strong**, pending the actual video recording (Phase 6) which turns "can run" into "judges saw it run."

### 3. Meaningful use of Filecoin — 20%
- [x] Are balances/runway/proofs pulled from a real onchain source, verifiable independently? → yes: real block numbers, real `dataSetId 32848`, real retrievable piece — see README's verification table.
- [x] Is at least one of Filecoin Pay / Synapse SDK / PDP / Warm Storage genuinely load-bearing? → two chained: Filecoin Pay (runway) AND PDP (proof gating), not one decorative primitive.
- [x] No hardcoded or simulated financial/proof values anywhere in the judged flow? → the judged flow (decision engine + real actions) has none; the deliberately-separate demo-narration layer (`src/demo/`) is clearly labeled as scripted, not presented as live chain interaction.
- **Self-score: strong.** This is the criterion the live-verification work most directly targeted.

### 4. Clarity of explanation + public showcase — 15%
- [x] README explains: the problem, the decision rule, which FOC primitive is used and why, and how to run/watch the demo. → done.
- [ ] Demo video (short, e.g. 1-3 min) shows the actual decision moment, not just a feature tour. → **not yet recorded.**
- [ ] X/social post is clear, links the demo, and states the decision the agent makes in one sentence. → **not yet drafted.**
- [x] A judge with zero prior context could understand what happened within the first 30 seconds of the README (leads with the plain-English decision sentence).
- **Self-score: partial.** This is the one criterion with real remaining work — video + X post.

## Showcase checklist
- [x] README.md in repo root (problem, approach, FOC primitives used, how to run, verification evidence).
- [ ] Demo video recorded and uploaded/linked.
- [ ] Public X post drafted/published, linking the demo and stating the one-sentence decision-moment hook.
- [ ] Submission form fields cross-checked against this rubric before submitting.
- [ ] Run `loops evaluate --sponsor filecointldr` and act on its feedback before final submission.

## Final gut check
Read the one-sentence description of your project out loud. If it could describe "an agent that stores files and pays for storage" with no decision implied, rewrite the sentence (and possibly the demo emphasis) so the decision is unmistakably the headline — that's the 30% criterion and the whole premise of the challenge.
