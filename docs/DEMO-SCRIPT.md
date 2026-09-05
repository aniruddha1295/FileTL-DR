# Demo Video Narration Script

Rewritten against the actual current UI (verified live, 2026-09-05): a two-page dashboard —
`/` is the control panel (band/gauge hero, 5 scenario buttons, 4 stat cards, a link into the
trace), `/trace` is the full decision timeline. It is **click-to-decide**, not an auto-playing
slideshow: you press a scenario button, the real decision engine runs, and the UI updates live
via polling. Total runtime target: ~100–120 seconds.

Four of the five buttons replay realistic-but-synthetic scenarios through the real decision
engine (honestly labeled "scripted-demo" in the page metadata). The fifth — **Live Verified
Run** — replays a real captured run against Filecoin calibration testnet from 2026-09-05
(`src/demo/live-run-record.ts`): a real freshly-created dataset (33859) with a real PDP-verified
proof read, red-banded against an explicit long-horizon target, triggering a real executed
top-up deposit (tx `0x814b84c3...`, confirmed calibration block 4043404); followed by a real live
PDP read on the dataset from the original `live-verify.ts` run (32848, terminated 2026-09-02)
genuinely coming back `unverified` — its proof aged past its challenge window after
termination — landing the same red band on the drop-dataset branch instead. Nothing in that
button is simulated; the tx hash renders as a real, clickable Filfox link.

Before recording:
- Have a terminal ready with `npm run demo` (or `docker run -p 3000:3000 triage-agent`) NOT yet
  run — starting it on camera is part of the shot.
- Confirm port 3000 is free (`netstat -ano | grep :3000` on Windows) so the dashboard doesn't
  fail to bind to something else already listening there.
- **Give every click 3–4 seconds before your next cut or narration beat.** The band pill, gauge
  fill, and stat cards animate (width transition ~0.6s, color transition ~0.35s) — cutting away
  or screenshotting immediately after a click catches the UI mid-transition (e.g. the gauge bar
  still showing the old color/width). This is a real animation timing quirk, not a bug — just
  breathe between actions on camera.
- The dashboard boots by auto-running one fixed drain sequence (green → yellow → red → drop) over
  ~12 seconds before it goes idle — let it finish before your first manual click, or narrate over
  it as the cold-open (see below).

---

## [0:00–0:15] Open — the problem, in one breath

> "Agents can store things on Filecoin. They can't decide whether it's worth it. Right now, a
> human funds the storage, and a human notices when the money runs out. This agent does that
> itself."

*(Show terminal. Type and run:)*
```
npm run demo
```
*(or `docker run -p 3000:3000 triage-agent` for the zero-install path)*

> "This is the real decision engine — the same code that's already been verified live against
> Filecoin's calibration testnet."

## [0:15–0:25] Switch to the dashboard, let the cold-open finish

*(Switch to browser, `http://localhost:3000`. The dashboard auto-runs one fixed sequence on
boot — green through to a dropped dataset, about 12 seconds. Let it finish; don't talk over the
climax.)*

> "On load it walks itself through one full scenario automatically, so there's always something
> on screen. Everything after this is me driving it live."

*(Wait for the header to settle on "Critical" / "Dataset dropped" — confirms the auto-run is
done and idle.)*

## [0:25–0:40] Orient on the control panel

*(Point at, in order: the "Verified against real Filecoin Pay and PDP..." strip near the top;
the wallet pill in the top-right, e.g. `0x044c...f715e`.)*

> "This isn't simulated. That wallet pill links straight to the real address on Filfox — every
> balance and proof this agent reads comes from Filecoin's calibration testnet."

*(Click the wallet pill — opens `https://calibration.filfox.info/en/address/0x044c...` in a new
tab. Show it briefly, then close/switch back.)*

> "It reads its own Filecoin Pay balance and runway, and checks whether its storage provider can
> actually prove — PDP, Proof of Data Possession — that it still holds the data. Those are the
> two signals it decides on."

## [0:40–0:55] Click: Healthy Account

*(Click "Healthy Account". Wait ~3s for the transition to settle before narrating over the
result.)*

> "Click one: healthy account. Runway's at 95% of baseline, PDP verified. The agent's decision:
> do nothing. Just watching. That itself is a decision — most 'agents' would keep paying blindly
> regardless of whether they need to."

*(Point at the four stat cards: Filecoin Pay Runway, Est. Epochs Remaining, PDP Proof Status,
Current Action — all updated from this one click.)*

## [0:55–1:15] Click: Tight Budget · Proof Verified

*(Click "Tight Budget · Proof Verified". Wait ~3-4s.)*

> "Click two: runway's dropped into the red band — critical. But PDP proof is still verified,
> the data is provably intact. So instead of panicking, it proposes an aggressive top-up, sized
> against the real forecast, to restore the runway."

*(Point at the "Current Action" card showing "Top-up proposed".)*

## [1:15–1:40] Click: Tight Budget · Proof Unverified — THE moment

*(Click "Tight Budget · Proof Unverified". Wait ~3-4s — this is the payoff, don't rush the cut.)*

> "Click three — same critical runway. But now the storage provider's proof is unverified. And
> watch what changes: instead of topping up anyway, it drops the dataset. No top-up. It will not
> keep paying for storage it can't prove is actually there."

*(Point at "Current Action" now reading "Dataset dropped" in red.)*

## [1:40–2:00] Click: Live Verified Run — this one is real, not scripted

*(Click "Live Verified Run (real testnet)". Wait ~3-4s for each of its two steps to land.)*

> "Everything so far ran the real decision engine against realistic, synthetic account states.
> This last button is different: it replays a run that actually happened on Filecoin calibration
> testnet a few days ago. Same red band, same compound rule — but this top-up is a real deposit
> transaction, and this drop-dataset call is a real live proof read coming back unverified."

*(Open `/trace`, scroll to the two newest entries. Point at the top-up entry's `tx` link.)*

> "That's a real, clickable transaction hash — confirmed on calibration block 4043404. Click it
> and it opens straight to Filfox."

*(Optionally click the tx link to show the real Filfox transaction page, then return.)*

## [2:00–2:15] Open the Decision Trace

*(Click "View full timeline →" to open `/trace`.)*

> "Every one of those clicks is a full structured trace, not just a final state — band, forecast,
> PDP status, action, and the plain-English reason, in order."

*(Scroll to the latest "Dataset dropped" entry and read the reason sentence aloud — this is the
whole pitch. It will read something like:)*

> "'Runway forecast is in the red band... and PDP proof for data set 1 is unverified... holding
> payment and dropping this data set rather than paying for storage that isn't verifiably
> intact.' That sentence is generated live, by the agent, from real on-chain state. That's the
> product."

*(Optionally scroll further to show the top-up and healthy entries below it, and point out the
executed action line under each — `tx 0xTOPUP` / `tx 0xDROP` for this scripted-demo executor, or
a real clickable Filfox transaction link when run against a live wallet.)*

*(Click "Back to dashboard" to return to `/`.)*

## [2:15–2:25] Close — this is real

> "This isn't a mockup. The exact same balance reads, PDP proof checks, and payment actions in
> this decision engine already ran for real on Filecoin's calibration testnet — a real deposit, a
> real dataset, a real termination, all on-chain, block numbers in the README."

*(Optional: cut briefly to the README's live-verification table, or `docs/BUILD-PLAN.md`.)*

> "The decision is the product. This agent makes it on its own."

*(End)*

---

## Notes
- If recording via Docker, mention once: "zero install — this is `docker run`, nothing local
  needed to reproduce it."
- Don't apologize for or over-explain the fixed cold-open sequence — the README already
  discloses that `npm run demo` drives a deterministic, repeatable scenario set (separate from
  the real on-chain path in `src/onchain/live-verify.ts`). One line is enough if you say it at
  all; the manual clicks afterward are what make the demo genuinely interactive, not scripted.
- If a click doesn't seem to register on screen, click again and wait — this is a UI you're
  actually operating live, so treat it like any other live demo: pause, don't panic, retry.
- If something visually stalls, the fallback is simple: stop, restart `npm run demo` — each
  scenario click is fully self-contained and stateless in effect, so a clean re-run costs
  nothing.
