# Demo Video Narration Script

Timed against the real default drain sequence (9 steps, ~1.5s between steps, ~12s total auto-run). Read at a natural pace — pausing on the climax matters more than hitting exact timestamps. Total runtime target: ~75-90 seconds.

Before recording: have this terminal command ready, and the browser tab at `http://localhost:3000` already open (blank/loading is fine — starting the command is part of the shot).

---

## [0:00–0:12] Open — the problem, in one breath

> "Agents can store things on Filecoin. They can't decide whether it's worth it. Right now, a human funds the storage, and a human notices when the money runs out. This agent does that itself."

*(Show terminal. Type and run:)*
```
npm run demo
```
*(or `docker run -p 3000:3000 triage-agent` if using the Docker path)*

> "This is running the real decision engine — the same code that's already been verified live against Filecoin's calibration testnet."

## [0:12–0:20] Switch to the dashboard

*(Switch to browser, `http://localhost:3000`)*

> "It reads its own Filecoin Pay balance, forecasts its runway, and checks whether its storage provider can actually prove — PDP, Proof of Data Possession — that it still holds the data."

## [0:20–0:35] Green band — let it run

*(Let the first 2-3 steps play out on screen: green, ~95% → ~72%)*

> "Right now it's healthy — green band, plenty of runway. It's just watching. No action, because none is needed. That itself is a decision — most 'agents' would just keep paying blindly."

## [0:35–0:55] Yellow band — the top-up

*(Steps 4-6: yellow, ~60% → ~37%)*

> "As runway drops into the yellow band, it proposes a conservative top-up — sized against a real forecast, not a guess. Watch the reason text update live."

*(Point at the decision log / reason field on screen)*

## [0:55–1:10] Red band — the compound decision (THE moment)

*(Steps 7-8: red, PDP still verified → aggressive top-up)*

> "In the red band, it doesn't just panic-fund itself. It checks PDP first. Here — proof verified, data's provably intact — so it aggressively tops up."

*(Final step: red, PDP unverified → drop-dataset)*

> "But watch this last step. Same red band — except now the storage provider's proof is unverified. And instead of paying anyway, it drops the dataset. No top-up. It will not pay for storage it can't prove is actually there."

*(Pause here. Read the reason text out loud if it's legible on screen — this sentence is the entire pitch.)*

## [1:10–1:25] Close — this is real

> "This isn't a mockup. The exact same balance reads, PDP proof checks, and payment actions in this decision engine already ran for real on Filecoin's calibration testnet — a real deposit, a real dataset, a real termination, all on-chain, block numbers in the README."

*(Optional: cut briefly to the README's verification table, or `docs/BUILD-PLAN.md`)*

> "The decision is the product. This agent makes it on its own."

*(End)*

---

## Notes
- If recording via Docker, mention once: "zero install — this is `docker run`, nothing local needed to reproduce it."
- Don't apologize for or over-explain the scripted pacing — the README already discloses it's a deterministic narration layer, separate from the real on-chain proof. One line ("this is a repeatable walkthrough of the real decision logic") is enough if you want to say it at all.
- If something visually stalls, the fallback is simple: stop, restart `npm run demo` — it's fully deterministic and stateless, so a clean re-run costs nothing.
