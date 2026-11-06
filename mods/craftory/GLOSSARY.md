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
A soft check before a phase starts that asks first when the preceding gated phase has not cleared. Done clears it, except for Align, which Ran clears. Nothing is refused.
_Avoid_: Block, guard

### Work items

**Feature**:
The unit that runs through all seven phases, from a title at the start to retro at the end. Exists before it has a Spec.
_Avoid_: Epic, project

**Map**:
A wayfinder effort for large work: a destination, the decisions made so far and the tickets still open. It sits before the Specs it produces, and a Feature may name one as its parent.
_Avoid_: Roadmap, epic

**Map source**:
Where a Map lives: the configured tracker, or Local Markdown under `.scratch/`. A repo can hold Maps from both.

**Decision ticket**:
A child of a Map holding a question whose answer is a decision, not a slice of work. It is takeable, claimed, blocked or decided, and never gets an implementer.
_Avoid_: Ticket (that is a child of a Spec)

**Active map**:
The Map the chip shows: the one the active Feature names, else the most recently updated open one.

**Issue**:
An item on the tracker that has not been triaged into a Spec or a Ticket.

**Inbox**:
The queue of untriaged Issues, shown as `Inbox 3` at the left of the rail.

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

**Worktree**:
The checkout folder where an Implementer works on its Ticket branch. Craftory keeps it while the Implementer is running, failed, stopped or over budget.

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
The `/craftory` view with the tabs Flow, Tickets, Worktrees, Glossary and Settings.
_Avoid_: Dashboard, panel

**Status line**:
The one-line summary under the prompt, such as `Export invoices as CSV · Build 2/5`. A surface of its own, not part of the band.

### Glossary

**Glossary drift**:
Words a diff adds that the repo's glossary says to avoid. Craftory scans for it when Review or Ship starts.
