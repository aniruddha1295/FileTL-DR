# Build Plan — Tiered Runway Triage Agent

Submission deadline: **Sep 6, 2026, 00:00 UTC**. Plan is organized purely by phase, not by calendar day — each phase runs until its exit checklist is green, then the next opens.

## How phase-gating works
Each phase below has: tasks, parallel tracks, an exit checklist, and a review step. **No phase starts until the previous phase's exit checklist is fully green and reviewed.** Where a phase splits into independent tracks, those run as parallel subagents; a review/integration step merges them before the gate opens.

Autonomy rule: I execute each phase's tracks without asking you at every step. I only stop and prompt you when I hit one of the flagged **[NEEDS YOU]** items below, or when a gate review surfaces something that changes scope/timeline.

---

## Phase 0 — Environment & Access Setup
Not parallelized — everything downstream depends on this.

**Tasks**
- Scaffold repo structure (TypeScript/Node, package.json, folder layout matching decision-engine / onchain / ui / tests separation)
- Install Synapse SDK, set up config/env handling
- Connect to Filecoin testnet, confirm `getAccountSummary` returns real data for a test wallet

**[NEEDS YOU]**
- Your testnet wallet's public address (never the private key in chat — that stays in a local `.env` I create and you fill in)
- Confirmed: new public GitHub repo — I'll propose a name and confirm before first push

**Exit checklist**
- [x] Repo scaffolded, dependencies install cleanly
- [x] One real, verified `getAccountSummary` call returns live testnet data (raw response logged, not assumed)

**Status: DONE.** Verified against real SDK source (`@filoz/synapse-core` v0.8.1 `get-account-summary.d.ts`), not docs summaries. Live call against wallet `0x044c40FBC017C74273eF402655391D4372Cf715e` on calibration testnet returned real epoch `4028086`, `funds: 0` (account not yet deposited into Filecoin Pay), and `runwayInEpochs`/`grossCoverageInEpochs` at max-uint256 (the contract's correct "infinite runway" sentinel when `lockupRatePerEpoch` is 0 — no active payment rail yet). This account will need a deposit + an active storage rail before runway becomes a finite, meaningful number — relevant for Phase 1/3.

**Review:** self-check passed — real SDK method names/shapes verified against package source, not assumed from docs. Confirmed before opening Phase 1.

---

## Phase 1 — Onchain Read Foundation
Two parallel tracks once Phase 0 is green.

**Track A (critical path):** Runway/forecast model
- Wire `getAccountSummary` → `runwayInEpochs` / `grossCoverageInEpochs`
- Build the forecast model anchored to observed spend/settlement events (not a static guess)
- Unit tests: forecast model against known synthetic spend sequences

**Track B (parallel, non-blocking):** PDP mock layer
- Build a mock provider PDP endpoint returning deterministic unverified/verifying/verified states, matching the real shape of `getNextChallengeEpoch`
- This lets the decision engine (Phase 2) build/test against a stable contract while real PDP integration happens later (Phase 3)

**Exit checklist**
- [ ] Runway/forecast module has passing unit tests
- [ ] Mock PDP module returns all three states on demand, matches expected real interface
- [ ] Both merged, no conflicts

**Review:** run `/code-review` (medium effort) on Track A + B diff before opening Phase 2 gate.

---

## Phase 2 — Decision Engine Core
Single track — this is the heart of the 30% judging criterion, sequential and carefully tested.

**Tasks**
- Implement three-tier bands (green ≥70%, yellow 30–70%, red <30%) against the forecast model
- Implement the compound rule: in red, top-up UNLESS PDP unverified → then hold payment + drop dataset
- Implement decision trace output: `band → forecast → PDP status → action → reason`
- Unit tests covering: all three bands, both red-band branches (top-up path AND drop path), edge cases at band boundaries

**Exit checklist**
- [ ] Decision engine is a pure, isolated module (no UI/network dependencies)
- [ ] Both red-band branches proven to trigger correctly in tests, not just the happy path
- [ ] Trace output is human-readable and matches the format needed for demo narration

**Review:** `/code-review` (high effort — this is the highest-stakes module) before opening Phase 3 gate.

---

## Phase 3 — Real Integration: Payment Actions + Real PDP
Two parallel tracks.

**Track A:** Wire decision engine output to a real onchain action (top-up call, drop/terminate call) against testnet
**Track B:** Swap mock PDP for the real provider PDP check, validated against Phase 1's mock interface contract so the swap is low-risk

**[NEEDS YOU]**
- If the real provider PDP integration proves flaky/opaque under time pressure (a risk the mentor flagged), I will propose falling back to "PDP mock in demo, documented as real-interface-compatible" rather than risk a broken live demo — I'll flag this explicitly if it happens, not decide it silently.

**Exit checklist**
- [ ] At least one real onchain top-up executes successfully against testnet
- [ ] At least one real onchain drop/terminate executes successfully against testnet
- [ ] Real or mock PDP status feeds the decision engine without changing its interface

**Review:** `/code-review` (medium) + manual run-through of one full end-to-end cycle.

---

## Phase 4 — Observability UI + Demo Script
Two parallel tracks (UI has no dependency on Phase 3 internals beyond the trace format fixed in Phase 2).

**Track A:** Simple web UI — live runway/band/PDP-status/decision-trace view (started as early as Phase 2 against the trace format, finished here against real data)
**Track B:** Deterministic drain script — a scripted, repeatable sequence of spends that reliably forces the agent from green → yellow → red live, per the mentor's fragility warning about relying on live gas/RPC variance

**Exit checklist**
- [ ] UI shows live state changes as the agent runs, decision trace visible in real time
- [ ] Drain script reliably reproduces the red-band trigger on repeat runs (test this at least 3x)

**Review:** full local dry-run of the demo flow end-to-end.

---

## Phase 5 — Full Testing & Hardening
This is `docs/03-TEST.md` executed in full — not skipped.

**Tasks**
- Force both decision branches against real onchain state (not just unit tests)
- Verify no mocked/hardcoded value silently substitutes for a failed real call
- Clean-restart test of the full demo run
- Record a fallback demo video in case live conditions fail on submission day

**Exit checklist:** all boxes in `docs/03-TEST.md` checked.

**Review:** `/code-review` (medium, focused on error handling/edge cases) if any fixes were needed during testing.

---

## Phase 6 — Self-Evaluation & Showcase
Parallel tracks.

**Track A:** Run `loops evaluate --sponsor filecointldr`, act on feedback, run `docs/04-EVALUATE.md` rubric self-score
**Track B:** README, demo video edit, X post draft — content can be drafted in parallel with Track A using the Phase 5 recording and Phase 2 decision traces as source material

**[NEEDS YOU]**
- Final review/approval before I publish anything public: the X post, and before I run `loops project create`/`update` (submission is visible to the platform/judges) or push the repo public if it isn't already

**Exit checklist**
- [ ] Self-score against all 4 judging criteria completed, gaps addressed or consciously accepted
- [ ] README, video, X post ready
- [ ] Submission created/updated via `loops project`

---

## Parallelization summary
- Phase 1: Track A (runway/forecast) + Track B (mock PDP) — parallel
- Phase 3: Track A (real payment actions) + Track B (real PDP swap) — parallel
- Phase 4: Track A (UI) + Track B (demo script) — parallel
- Phase 6: Track A (evaluation) + Track B (showcase content) — parallel
- Phases 0, 2, 5 are single-track by necessity (setup, core logic, and testing are inherently sequential/critical-path)
