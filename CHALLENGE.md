FilecoinTLDR Builder Challenge - Cycle 4
[Ongoing] Challenge Task: Build an AI Agent That Manages Its Own Storage Budget
Core Idea: Build an agent, workflow, or tool that reads its own onchain balance and runway on Filecoin Pay, then acts on what it finds — topping up, cutting what it can't afford, or deciding what's worth paying to keep. The decision is the product, not the transaction.

The problem

Agents can store things. They can't decide whether it's worth it.

Right now a human sets up the storage, a human funds it, and a human notices when the money runs out. The agent just calls an API. That works fine for a demo and breaks the moment you want an agent running on its own for weeks.

Filecoin Onchain Cloud makes the missing piece available. Every account has a runway – how many epochs it can keep paying before storage stops working. When runway hits zero, uploads fail and providers can drop your data. That number is readable onchain, in real time, by anything that wants to look at it.

Including the agent itself.

What to build

An agent, workflow, or tool that reads its own financial state and acts on it.
Not "an agent that stores files." An agent that knows what its storage costs, knows how long it can afford to keep going, and does something sensible about it. The decision is the product. If a human still makes every call, it doesn't count.

What good looks like

We should be able to watch it happen. The strongest builds will let a judge see the agent notice something, weigh it, and act – not just read a log afterwards saying it did.
Some directions to consider – pick one or invent your own:

Stay alive: An agent that watches its runway and tops itself up before it runs dry.
Triage: Budget's tight. Which data does the agent keep, and how does it explain the call?
Show the meter: A dashboard where you watch an agent spend, settle, and justify each transaction.
Delegate: One agent funds another's work and holds it to a budget.
Pay on proof: A service where money only moves once the work is provably done.
Have a question or stuck on your build? Join the Discord Channel: FilecoinTLDR Builder Challenges

About the program

FilecoinTLDR Builder Challenges is a series of AI-guided mini hackathons for non-builders, first-time builders, and builders of all experience levels. The goal is simple: use AI to hack together a working prototype while leveraging the Filecoin stack.

Each challenge gives a clear theme but leaves room for creativity. This isn't about following a fixed tutorial or building the same app as everyone else. The goal is something small, working, and memorable – where Filecoin is part of the product experience, not just hidden backend storage.

Each challenge is:

AI-guided – use Claude Code and provided markdown files to plan and build
Hands-on – create a real working demo
Focused – one clear theme or build direction
Practical – small enough to build in a short sprint
Showcase-driven – share what you built publicly
By the end you should have a working prototype, real interaction with the Filecoin stack, a clearer understanding of how to build with Filecoin using AI, and something public to point at.

---

## Resources

- Filecoin Onchain Cloud Documentation (docs) — https://docs.filecoin.cloud
- Filecoin Documentation (docs) — https://docs.filecoin.io
- Gstack (github) — https://github.com/garrytan/gstack
- Getting Started With FilecoinTLDR Builder Challenges (url) — https://x.com/FilecoinTLDR/status/2066462755276968367

## Judging

### Criteria

**Autonomous budget decisions — 30%**
Does the agent read its own onchain balance or runway and change what it does based on what it finds? Can judges point to the specific moment a decision gets made? An agent that stores and pays but never decides anything does not score here.

**Working demo quality — 25%**
Does the app or prototype work? Can judges see the core flow clearly, end to end? Is it more than a mockup or a fake demo?

**Meaningful use of Filecoin — 20%**
Does the project genuinely use Filecoin Pay, Synapse SDK, PDP, Warm Storage, or another FOC primitive? Are the balances, payment rails, and proofs real and onchain – not simulated or hardcoded?

**Clarity of explanation + public showcase — 15%**
Is the project easy to understand? Are the X post, demo video, README, and submission explanation clear and compelling?
