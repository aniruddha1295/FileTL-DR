# Tiered Runway Triage Agent

**An AI agent that pays for its own Filecoin storage — but only keeps paying if it's affordable *and* actually working.**

Built for the [FilecoinTLDR Builder Challenge — Cycle 4](https://filecointldr.io/): *Build an AI Agent That Manages Its Own Storage Budget.*

---

## The problem

Agents can store things. They can't decide whether it's worth it.

Today, a human sets up storage, a human funds it, and a human notices when the money runs out. That breaks the moment you want an agent running unattended for weeks. Filecoin Onchain Cloud exposes a **runway** — how many epochs an account can keep paying before storage stops — readable onchain, in real time, by anything that looks. Including the agent itself.

## What this agent does

It reads its own **Filecoin Pay balance and runway**, checks whether its storage provider can actually **prove (PDP)** it still holds the data, and — with zero human in the loop — decides:

- **Green** (≥70% of baseline runway): do nothing, keep watching.
- **Yellow** (30–70%): top itself up, conservatively.
- **Red** (<30%) — the compound decision:
  - Provider's PDP proof **verified** → aggressive top-up. The data is provably intact, worth fully re-funding.
  - Provider's PDP proof **unverified** → **drop the dataset, no top-up.** We will not keep paying for storage that isn't verifiably there.

Every decision produces a structured trace — `band → forecast → PDP status → action → reason` — in plain English, live, not a log entry read after the fact.

> *"Runway forecast is in the red band (15.0% of baseline, ~2.1 days remaining) and PDP proof for data set 1 is unverified (missed challenge due at epoch 4800, current epoch 5000) — holding payment and dropping this data set rather than paying for storage that isn't verifiably intact."*

That sentence, generated live by the agent, **is** the product.

## Why this, and not just "read balance, top up"

Most agents in this space stop at one signal. This one chains **two real Filecoin Onchain Cloud primitives** — Filecoin Pay (runway) and PDP (proof of data possession) — into a single compound decision, and sizes every action against a forecast anchored to real onchain state, not a static guess.

---

## This is real, not simulated — live-verified on calibration testnet

Every primitive below was executed for real, on-chain, and is independently checkable:

| Action | Result |
|---|---|
| Deposit 2 USDFC into Filecoin Pay | ✅ Confirmed, block `4033898` |
| Approve Warm Storage as a Payments operator | ✅ Confirmed, block `4033905` |
| Create a real dataset with a real storage provider, upload real data | ✅ `dataSetId 32848`, provider `2`, piece live at [calib2.ezpdpz.net](https://calib2.ezpdpz.net/piece/bafkzcibcaablfqvd4fm7g4r4spttdxn37xqqgopv5bb2hw5zsuzdkycr36u3ypq) |
| Real active payment rail appears | ✅ `runwayInEpochs` went from Filecoin Pay's "infinite" sentinel to a real finite number (**993,599 epochs, ~345 days**) for the first time |
| Real PDP proof status read from chain | ✅ `verified` — correctly derived from live `getNextChallengeEpoch` / `getDataSetLastProvenEpoch` contract reads |
| Real decision engine, run against that real state | ✅ Correctly decided `green / none` — did nothing, because nothing needed doing |
| Real drop-dataset (terminate) | ✅ Confirmed on-chain |

No hardcoded balances, no mocked proofs, no simulated transactions in this path. Reproduce it yourself: `npm run live-verify` (see [Running it](#running-it)).

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  Filecoin Pay    │────▶│  Forecast model   │────▶│                    │
│  (real balance,  │     │  (runway bands,   │     │   Decision Engine  │
│   runwayInEpochs)│     │   anchored to     │────▶│   (the 30% that    │
└─────────────────┘     │   real chain rate)│     │   matters most)    │
                         └──────────────────┘     └─────────┬──────────┘
┌─────────────────┐                                          │
│  PDP Verifier    │────▶  PDP Status Checker  ───────────────┘
│  (real proof     │      (verified/verifying/                │
│   challenges)    │       unverified)                        ▼
└─────────────────┘                                ┌───────────────────┐
                                                     │  Real Action      │
                                                     │  (deposit /       │
                                                     │   terminate)      │
                                                     └─────────┬─────────┘
                                                               ▼
                                                     ┌───────────────────┐
                                                     │  Live Dashboard    │
                                                     │  (watch it happen) │
                                                     └───────────────────┘
```

- **`src/onchain/`** — real Synapse SDK integration: account reads, PDP proof status, payment/termination actions.
- **`src/decision-engine/`** — the pure, heavily-tested core: three-tier bands + the compound runway/PDP rule.
- **`src/demo/`** — a deterministic, repeatable green→yellow→red scenario for live narration (clearly separate from the real onchain proof above).
- **`src/ui/`** — a zero-dependency live dashboard showing the decision trace as it happens.

## Tech stack

TypeScript · Node.js · [Synapse SDK](https://www.npmjs.com/package/@filoz/synapse-sdk) (`@filoz/synapse-sdk`) · Filecoin Pay · PDP (Proof of Data Possession) · Warm Storage · Filecoin calibration testnet · Vitest

## Running it

### Fastest path: Docker, zero setup

No Node, no npm install, no `.env` — the demo needs no real wallet at all (it narrates through a logging stand-in, not a live account):

```bash
docker build -t triage-agent .
docker run -p 3000:3000 triage-agent
```

Open `http://localhost:3000` and watch the agent walk green → yellow → red, firing the compound decision live. The image runs the full test suite and type-check as part of `docker build`, so a broken build fails there, not on `docker run`.

### Locally, with npm

```bash
npm install
npm test                        # 63 tests, the whole decision engine + integrations
npm run demo                    # the full scripted demo: dashboard + drain scenario, http://localhost:3000
```

To reproduce the real on-chain verification (needs your own funded testnet wallet):

```bash
cp .env.example .env   # fill in a testnet private key — see .env.example
npm run check-account           # one real, live balance/runway read
npm run live-verify             # reproduce the full real on-chain verification above
```

## Judging criteria, mapped

| Criterion | Weight | Where |
|---|---|---|
| **Autonomous budget decisions** | 30% | `src/decision-engine/index.ts` — the compound rule, zero human in the loop at decision time |
| **Working demo quality** | 25% | `npm run demo` — live dashboard, forced scarcity, decision fires on screen |
| **Meaningful use of Filecoin** | 20% | Real Filecoin Pay deposits, real PDP proof reads, real dataset creation — see the verification table above |
| **Clarity + showcase** | 15% | This README, the decision trace's plain-English `reason` field, demo video |

## Project status

Built phase-by-phase with code review and tests gating every step — see [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) for the full history, including every bug caught and fixed along the way.

---

Submission for [FilecoinTLDR Builder Challenge — Cycle 4](https://filecointldr.io/).
