# Phase 4 — Evaluate & Showcase

Prerequisite: 03-TEST.md exit criteria met. Use this doc to self-score before submitting, exactly the way judges will.

## Self-scoring rubric (mirror the real judging weights)

### 1. Autonomous budget decisions — 30%
- [ ] Can you point to the exact line of code / log event / dashboard moment where the agent reads onchain state and decides?
- [ ] Does the demo show the agent's behavior actually changing based on what it read (not the same action every time)?
- [ ] Is there zero human-in-the-loop for the decision itself (a human may configure it beforehand, but not make the call at runtime)?
- Score honestly 0–30. If you can't point to a specific moment, this is near 0 regardless of how polished the rest is — fix this before anything else.

### 2. Working demo quality — 25%
- [ ] Does it run, live or via a video, start to finish, without you narrating around a broken part?
- [ ] Is the core flow legible to someone seeing it for the first time in ~2 minutes?
- [ ] Is it clearly more than a mockup/UI shell — real logic actually executes?

### 3. Meaningful use of Filecoin — 20%
- [ ] Are balances/runway/proofs pulled from a real onchain source, verifiable independently (explorer, SDK call log)?
- [ ] Is at least one of Filecoin Pay / Synapse SDK / PDP / Warm Storage genuinely load-bearing to the outcome, not decorative?
- [ ] No hardcoded or simulated financial/proof values anywhere in the judged flow.

### 4. Clarity of explanation + public showcase — 15%
- [ ] README explains: the problem, the decision rule, which FOC primitive is used and why, and how to run/watch the demo.
- [ ] Demo video (short, e.g. 1-3 min) shows the actual decision moment, not just a feature tour.
- [ ] X/social post is clear, links the demo, and states the decision the agent makes in one sentence.
- [ ] A judge with zero prior context could understand what happened within the first 30 seconds of your materials.

## Showcase checklist
- [ ] README.md in repo root (problem, approach, FOC primitives used, how to run, link to demo video)
- [ ] Demo video recorded and uploaded/linked
- [ ] Public X post drafted/published, linking the demo and stating the one-sentence decision-moment hook
- [ ] Submission form fields cross-checked against this rubric before submitting

## Final gut check
Read the one-sentence description of your project out loud. If it could describe "an agent that stores files and pays for storage" with no decision implied, rewrite the sentence (and possibly the demo emphasis) so the decision is unmistakably the headline — that's the 30% criterion and the whole premise of the challenge.
