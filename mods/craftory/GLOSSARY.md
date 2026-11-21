# Craftory

An SDLC framework, built on top of Matt Pocock's skills, that guides a feature from idea to merged PR. It is delivered as a Claude Code mod that shows where a feature is and steers the agents that build it.

## Language

### The framework

**Craftory**:
The SDLC itself: seven phases, each started by one of Matt Pocock's skills. Delivered as a mod.
_Avoid_: Plugin (that is `mattpocock-skills`)

**Mod**:
The Claude Code artifact that delivers Craftory: the rail, pane and hooks.
_Avoid_: Plugin, extension

**Phase**:
One of the seven stages a feature passes through: Align, Spec, Tickets, Build, Review, Ship, Retro.
_Avoid_: Step, stage

**Phase state**:
Where a phase stands for the active feature: Done, Up next, Running, Needs you, Gated, Failed, Over budget or Skipped.
_Avoid_: Step state, status

**Done**:
A phase whose evidence exists, such as a Spec on the tracker or every Ticket merged.

**Ran**:
A phase whose skill ran, whether or not its evidence exists yet. Align is cleared by Ran, because a grill ends when you move on.

**Gate**:
A soft check before a phase starts that asks first when the preceding gated phase has not cleared. Done clears it, except for Align, which Ran clears. Nothing is refused unless an opt-in is on: `deny.skipGate` refuses the gated phase's skill, called by Claude or typed, instead of asking, `deny.overBudget` refuses a phase's skill once that phase or the Feature is Over budget, gated or not, and `deny.hardGates` makes every gate hard (see **Hard gates**).
_Avoid_: Block, guard

**Hard gates**:
The opt-in `deny.hardGates` switch, repo-wide. It turns the soft gates into refusals: a gated phase typed, called by Claude or pressed is refused with no Run anyway, edits in the main checkout on an integration branch are refused, a phase's skill or a new Implementer is refused once it is Over budget, and a ready PR or MR is refused until Review is done. It refuses only on evidence it can read, and has no per-command override.
_Avoid_: Strict mode, enforce

### Work items

**Feature**:
The unit that runs through all seven phases, from a title at the start to retro at the end. Exists before it has a Spec.
_Avoid_: Epic, project

**Archived**:
A Feature hidden from the switcher, the rail and the status line once Ship is done. Its record, Worktrees and Tickets are kept, and the pane's Flow tab lists it with an Unarchive button. New work on it, other than a retro, brings it back.
_Avoid_: Closed, deleted, hidden

**Map**:
A wayfinder effort for large work: a destination, the decisions made so far and the tickets still open. It sits before the Specs it produces, and a Feature may name one as its parent.
_Avoid_: Roadmap, epic

**Map source**:
Where a Map lives: the configured tracker, or Local Markdown under `.scratch/`. A repo can hold Maps from both.

**Decision ticket**:
A child of a Map holding a question whose answer is a decision, not a slice of work. It is takeable, claimed, blocked or decided, and never gets an implementer.
_Avoid_: Ticket (that is a child of a Spec)

**Frontier**:
The Decision tickets of a Map that can be taken now: open, unblocked and unclaimed, in order. A Map with no open tickets has no Frontier, and says "No open tickets" rather than "destination reached".

**Takeable**:
A Decision ticket on the Frontier. A ticket that is claimed (open with an assignee) or blocked (waiting on an unresolved ticket) is not Takeable. A blocker the Map does not hold, or one the tracker could not answer for, counts as unresolved: the ticket shows as Blocked, with "blockers unknown" when the tracker said nothing at all.

**Active map**:
The Map the chip shows: the one the active Feature names, else the most recently updated open one.

**Issue**:
An item on the tracker that has not been triaged into a Spec or a Ticket.

**Inbox**:
The queue of untriaged Issues, listed in the Tickets tab and counted by the rail's Triage button (`Triage 3`).

**Triage**:
Choosing the phase an Issue enters a Feature at. Phases before it show as Skipped.

**Spec**:
The tracker issue that `/to-spec` writes for a Feature. A Spec always belongs to one Feature.
_Avoid_: PRD, requirements doc, issue (once triaged)

**Ticket**:
A child of a Spec, one vertical slice of work. Gets one implementer, one worktree and one branch.
_Avoid_: Task, slice, issue (once triaged)

**Ref**:
How Craftory names an issue: `#44` on GitHub, and on a Local tracker the feature folder for its Spec (`csv`) or the folder and ticket number (`csv/01`). A skill is handed the file path of a Local issue, not its ref.
_Avoid_: Id, number

**Ticket status**:
Where a Ticket stands: open (not yet classified), ready (unblocked and meant for an agent), blocked (waiting on another Ticket), human or merged.

**Human ticket**:
A Ticket meant for a person. It never gets an implementer.
_Avoid_: HITL ticket

### Build

**Implementer**:
The agent that Build starts for one Ticket.
_Avoid_: Agent (when you mean the one for a specific Ticket)

**Integration branch**:
The branch of a Feature that every Ticket merges into and that the PR is made from.

**Ticket branch**:
The branch an Implementer works on, cut from the integration branch.

**Routing**:
The model and effort a phase's subagents run on, set per phase and `session` (none) by default. An Implementer belongs to Build, and any other subagent to the phase running in the main session when it spawns. The model is set only at spawn, never on a later step, and a call that names its own model is left alone. The main session is routed too only with the opt-in `routing.mainThread`.
_Avoid_: Tiering

**Escalation**:
Starting a Failed or Over budget Ticket again on a stronger model, the `routing.escalateTo` one, by a press of **Retry on opus**, in its kept Worktree and branch. Offered only when that model differs from the one its last Implementer ran on, and never done by itself.
_Avoid_: Upgrade, upshift

**Worktree**:
The checkout folder where an Implementer works on its Ticket branch. Craftory keeps it while the Implementer is running, failed, stopped or over budget.

### Spend

**Spend**:
What a Feature has cost: the tokens of every step Claude answered for it, and their share of the session's dollars. Charged to a phase, and to a ticket for an Implementer's steps. Committed per session under `.craftory/spend/`, so a Feature's Spend adds up across sessions and people. Once the Feature is through (Retro done, or Ship done with Retro skipped), its summary is written once to `.craftory/spend/<spec>/spend.md` and never rewritten: the total, Build against its Forecast, the costliest tickets and phases, the Cache-hit % and the Spend by model. The Retro card shows it, and `/retro` is given it as context.
_Avoid_: Burn

**Fresh tokens**:
Input, cache-write and output tokens: the count the per-agent token budget uses. Cache reads are counted apart.
_Avoid_: Billed tokens

**Cache-hit %**:
Of the input the model read, the share the prompt cache served. Shown on a phase card's Spend row, such as `61% cache`.
_Avoid_: Cache rate

**Between phases**:
Spend from the main session while the active Feature had no phase running, such as chat between `/to-spec` and `/to-tickets`. It counts towards the Feature.
_Avoid_: Unphased, idle

**Budget**:
A cap in whole dollars on a Feature's Spend, or on one phase's. The Feature's own budget wins over the default in `.craftory/config.json`, `0` is none, and all are off until set. Applies only where the host keeps a cost ledger. Distinct from an Implementer's token budget.
_Avoid_: Quota, allowance

**Near budget**:
A Spend figure at `budgets.warnAtPercent` (80% by default) of its Budget or more, but under it. Shown amber, with the words "Near budget".
_Avoid_: Almost over

**Over budget**:
A Spend figure at its Budget or more: shown red with the words "Over budget", raising a band notice once per Budget, and refused by the opt-in `deny.overBudget`. As a Phase state, also an Implementer stopped at its token budget.
_Avoid_: Overspent, exceeded

**Outside features**:
Spend with no Feature in flight. Kept on this machine only, for 30 days, and shown only in the Spend tab.
_Avoid_: Unattributed

**Rate-limit window**:
One of the account's usage limits that Claude Code reports, such as the 5-hour or 7-day window, with its use and when it resets. Shown on the Build card's Limits row. None off a subscription.
_Avoid_: Usage cap

**Forecast**:
What a Build ticket, and each phase, usually costs in this repo: the median and the p90 of the Spend of finished Features (Ship done, or archived), shown once 2 have given a sample. Build's is the per-ticket Forecast times the Tickets meant for an agent, as `Build ≈ $9.20 (p90 $14) for 5 tickets`, and is saved on the Feature when Build starts. In fresh tokens where the host keeps no cost ledger.
_Avoid_: Projection, prediction

**Throttled**:
A Rate-limit window at or above `rateLimits.throttleAt` (80% by default), and Build while one is: it starts at most `rateLimits.throttledParallel` Implementers at once. `throttleAt` 100 is off.
_Avoid_: Slowed, rationed

### Surfaces

**Rail**:
The row of seven phases, with their states, shown above the prompt and at the start of the pane's Flow tab.
_Avoid_: Stepper, progress bar

**Band**:
The region above the prompt. It holds the rail, the open card and questions such as "Run anyway?".
_Avoid_: Banner, header

**Card**:
The detail view of one phase, opened from the rail: what it does, its command, its skills, what it wrote and its gate.
_Avoid_: Popover, panel

**Pane**:
The `/craftory` view with the tabs Flow, Tickets, Worktrees, Glossary, Settings and Spend.
_Avoid_: Dashboard, panel

**Status line**:
The one-line summary under the prompt, such as `Export invoices as CSV · Build 2/5 · $4.12`, ending with the Feature's Spend once it has any. A surface of its own, not part of the band.

### Glossary

**Context**:
One area of a repo with a language of its own, and its own `GLOSSARY.md`. A repo with no Glossary map is one Context. The same term can mean different things in two Contexts, and Craftory shows each definition labelled with its Context.
_Avoid_: Domain, module, bounded context

**Glossary map**:
The `GLOSSARY-MAP.md` at a repo's root, listing each Context with its glossary file, and how Contexts relate. Craftory reads it and never edits it.
_Avoid_: Index, glossary index

**Glossary drift**:
Words a diff adds that the glossary of the Context holding the file says to avoid. A file outside every Context is checked against all of them. Craftory scans for it when Review or Ship starts.
