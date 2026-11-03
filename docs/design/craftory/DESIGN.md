# craftory: design spec

Source of truth for the look and behaviour of the `craftory` mod. How each element is built and the
decisions behind it are in [`plan.md`](./plan.md); where this file and `plan.md` differ, `plan.md` wins.
The interactive canvas lives at https://claude.ai/artifact/4DU8JVRxfgtaKVKQcVkrbw (owner access), and a
copy of its boards is in [`artboards/`](./artboards/README.md).

Craftory is an SDLC framework, built on top of Matt Pocock's skills, as a Claude Code mod
(`mattpocock-skills`), guiding a feature from idea to merged PR. It never does the work itself: each phase is started by one of his
user-invoked skills, and his model-invoked skills are its helpers. Craftory tracks where a feature is,
suggests the next phase, steers parallel Build agents, and edits the repo files his skills read.

## How to read these files

`artboards/*.dc.html` are a **visual and behavioural reference, not code to port**. A mod draws with
`Box`, `Text`, `Button`, `Input`, `Select`, `Markdown` and, on rich surfaces, `Svg`, in the
`AbovePrompt` band and in a `Pane`. Each file's `<script data-dc-script>` block holds the sample data
and interaction logic, which is the most useful part to read.

| Board | File | Becomes in the mod |
| --- | --- | --- |
| SDLC phase rail above the prompt, Build open | `Main.dc.html` | `AbovePrompt` band: the triage button, seven phase steps, the feature title, a gear. A pressed step opens its detail card above the rail; Build's card holds the live agents list |
| Panel beside the chat | `Panel.dc.html` | `Pane` id `craftory`, opened by `/craftory`: tabs `1 Flow`, `2 Tickets` (with Inbox), `3 Worktrees`, `4 Glossary`, `5 Settings` |
| Settings | `Settings.dc.html` | Tab `5 Settings` of the same pane. Claude Code has no settings page a mod can join, so the left nav of the board is the pane's tab list |
| Phase states, rail variants, glossary, toasts | `States.dc.html` | State glyph + colour + text rules below; band notices for plugin missing and first run; `$.ui.toast` |
| Mobile | `Mobile.dc.html` | No band (Claude Code raises `AbovePrompt` on the terminal and Desktop only). The pane's Flow tab heads with the same scrolling rail |

## Surfaces

| Surface | What Craftory draws |
| --- | --- |
| Terminal | Rail in the band (glyphs, one row, wraps if narrow), detail card above it, the pane, the status line |
| Desktop Code tab | Same, with `Svg` icons, exact colours, hover, clicks; glossary terms underlined with a hover card |
| VS Code, mobile | Pane and status line. The Flow tab starts with the rail. Glossary hover as on Desktop |
| claude.ai/code cloud | `/craftory` replies with a text summary of the active feature, at most |
| claude.ai chat, `claude -p` | Nothing |

## Phases

Each phase is anchored on a **user-invoked** skill (the command a rail button submits). **Helpers** are
model-invoked skills the agent reaches for during the phase; they are shown, never typed.

| # | Phase | Command | Helpers | Done when | Gate (default) |
| --- | --- | --- | --- | --- | --- |
| 1 | Align | `/grill-with-docs` (or `/grill-me`) | grilling, domain-modeling, prototype, research | The grill ended and the user moved on, or `/to-spec` started | On |
| 2 | Spec | `/to-spec` (or `/wayfinder` for large work) | – | A spec issue exists on the tracker | On |
| 3 | Tickets | `/to-tickets` | – | Child tickets with blocking edges exist for the spec | Off |
| 4 | Build | `/implement-spec` (or `/implement` for one ticket) | tdd, diagnosing-bugs, codebase-design | Every agent-ready ticket is merged into the integration branch | On |
| 5 | Review | none: the close-out of Build | code-review | `code-review` finished on the integration branch and its fixes are merged | On |
| 6 | Ship | none: the agent uses `pr` on the draft PR Build opened | pr | The PR is marked ready for review | Off |
| 7 | Retro | `/retro` | – | `retro` produced its ranked suggestions | Off |

A gate is **soft**: when the next phase starts while this one is not done, Craftory asks
"Review is gated: #44 has 2 failing tests. Run anyway?" with **Run anyway** and **Diagnose**. It never
refuses on its own.

### Outside the seven phases

| Entry | Where it shows | Behaviour |
| --- | --- | --- |
| Triage (`/triage`) | Triage button at the left of the rail; Inbox in the Tickets tab | Issues from outside the flow. A `ready-for-agent` item starts a feature at the phase set in Settings › Entry points; `ready-for-human` never gets an agent |
| Wayfinder (`/wayfinder`) | Parent rail above the seven phases | Tracks decision tickets (decided, open) and child specs; each child spec gets its own rail |
| Handoff | Automation | At 80% context, `handoff` writes a handoff document (off by default) |
| improve-codebase-architecture | Automation | At session start when the last run is more than 7 days old; findings filed as `needs-triage` (off by default) |

## Phase states

| State | Terminal | Colour tokens | Text badge / meta | Meaning |
| --- | --- | --- | --- | --- |
| Done | `✓` | perm (teal) | artifact, e.g. `#42` | Its evidence exists. Press to open it or re-run |
| Up next | `▸` | skill (blue), bold | – | Suggested next phase; the card has its command ready |
| Running | `◐◓◑◒` | skill (blue) filled | progress, e.g. `1/5` | A skill is working |
| Needs you | `?` | hook (amber) | e.g. `Q6 of ~14` | Waiting on an answer during a grill, or on a `ready-for-human` ticket |
| Gated | `⊘` | neutral | – | Gate on and the phase before is not done; runs after confirm |
| Failed | `▲` | danger, bold | e.g. `2 tests red` | Card offers `diagnosing-bugs` instead of moving on |
| Over budget | `▲` | danger, bold | `#44 · 80k` | An agent reached its token budget, was stopped, its worktree kept |
| Skipped | `–`, struck through | muted, dashed | – | Off in Settings, skipped for this feature, or before the phase a triaged issue entered at |

Every state is also text, so colour is never the only signal. Every glyph must be one terminal cell
wide; M1 checks `▸ ⊘ ▲` and falls back to `> x !`.

## Rail

Left to right: the triage button (`Inbox 3` when items wait), a divider, seven phases joined by
connectors (teal when the phase before is done, neutral otherwise), the active feature title (a
switcher when several features are in flight), and a gear opening the Settings tab.

Variants (`States.dc.html`):

- **Plugin missing**: an amber notice in place of the rail: "Craftory needs mattpocock-skills 1.3.x ·
  Install · Not now". An installed version outside the tested range shows the same with **Update**.
- **First run**: "No `docs/agents/` yet. Found a GitHub remote and CONTEXT.md. · Set up Craftory".
- **No feature in flight**: "Start a feature: talk it through first. · `/grill-with-docs`".
- **Collapsed summary**: one chip, `Export invoices as CSV · Build 2/5`, for narrow bands or by choice.
- **Wayfinder**: parent rail `Billing v2 · 3 decided · 2 open · 4 specs` above the child's rail.
- **Entered from triage**: earlier phases struck through, the entry phase up next with the issue id.

## Detail card

Opens above the rail on the pressed phase, closes on a second press or its close button. Content:
kicker (`Phase 4 of 7 · Running`, or `Entry point · outside the 7 phases` for triage), title, one
paragraph on what the phase does, a **Command** row (or "None to type" plus what starts it), a
**Helpers** row, the artifact line (`Written`, `Created`, `Integration branch`, `Will mark ready`), the
gate line in amber when a gate is on, and buttons (primary command, secondary such as `Open #42`).

Build's card adds the **Agents** list: one row per ticket with id, title, status badge (Merged,
Running, Queued, Needs you, Near budget, Over budget), the TDD step (`red · test 4 of 5`), a token bar
against the budget with time, and the worktree path, branch, `+add −del` and commits. A footer says
"One git worktree per agent · 80k token budget each" with **Pause all** and **Open panel**. The token
bar is the skill colour, amber from 80% and danger at 100%.

## Pane

`/craftory`, the gear, `Open panel` or the status line open it docked beside the transcript where the
surface allows; the rail hides while it is open. Tabs:

1. **Flow**: the seven phases as a vertical list with their command and a one-line result.
2. **Tickets**: tracker header (`Local Markdown · docs/issues/ · Open folder`), the **Inbox** (triage
   roles, `/triage #51`, `Start feature`), then the spec's tickets with status, blocking edges and
   `/implement #n` on ready ones, and `/implement-spec #42 · run all in parallel`.
3. **Worktrees**: your checkout, the integration worktree, one per running agent, stale ones, each
   with branch, sync state, size, and Diff, Open terminal, Remove; `Prune 1 stale`.
4. **Glossary**: search, `GLOSSARY.md · 3 added this session`, **Used in last reply**, then every term
   with definition and Avoid list. `Edit` jumps to Settings › Glossary.
5. **Settings**: below.

## Settings

The tab header shows the plugin status (`mattpocock-skills 1.3.1 installed · tested with 1.3.x`) and
the rail switch. Sections and where each value is written:

| Section | Values | Stored in |
| --- | --- | --- |
| Entry points | triage on/off and entry phase; wayfinder suggestion | `.craftory/config.json` |
| Issue tracker | Local Markdown, GitHub, GitLab or Other, with their fields; triage label per role | `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` |
| Docs layout | glossary file, ADR folder, research notes, steering file (AGENTS.md or CLAUDE.md) | `docs/agents/domain.md` and the `## Agent skills` block of the steering file |
| Glossary | add, edit, delete terms (term, definition, avoid); import from CONTEXT.md | `GLOSSARY.md` |
| Pipeline | phase on/off, command choice, gate per phase; helpers shown read-only | `.craftory/config.json` |
| Worktrees | folder, integration branch, ticket branch, max parallel, token budget, setup command, files to copy, four switches | `.craftory/config.json` |
| Automation | suggest next phase, live agents, underline glossary terms, retro on PR, handoff at 80%, weekly architecture check | `.craftory/config.json` |
| Rail switch | show the rail above the prompt | `$.store` (personal) |

Buttons: **Reset to defaults**, **Re-run /setup-matt-pocock-skills**. Changes save as you go.

## Glossary in replies

On Desktop, VS Code and mobile, terms from `GLOSSARY.md` are underlined (dotted, skill tint) in
Claude's replies. Hover shows a card: `GLOSSARY.md`, term, definition, `Avoid: …`, and
`/wait-what` and `Edit term`. On the terminal, replies are never rewritten; the Glossary tab's
**Used in last reply** lists the terms instead.

## Toasts

One `$.ui.toast` each, with one action:

| Toast | Action |
| --- | --- |
| Spec #42 published · 6 user stories | Open |
| Agent #44 hit its 80k budget · worktree kept | Raise budget |
| Review is gated · #44 has 2 failing tests | Run anyway |
| Rebase conflict in .worktrees/45-date-filter · agent paused | Resolve |
| Glossary drift · the diff says "line item" 4 times | Rename |
| Retro ready · 3 ranked suggestions | Review |

## Palette

Craftory reuses session-activity's tokens (`--ink`, `--surface`, `--line`, … and the `skill`, `perm`,
`hook`, `danger` triples) in light and dark, so the two mods sit together in one band. Their roles
here: **skill** (blue) = running and up next, **perm** (teal) = done and merged, **hook** (amber) =
needs you, gated, near budget and gate lines, **danger** = failed and over budget. Values are in
`mods/session-activity/src/theme.ts` `TOKENS`; `craftory` copies them into its own `src/theme.ts`
rather than importing across mods.

## Copy

Phase names are single words: Align, Spec, Tickets, Build, Review, Ship, Retro. Commands are shown
short (`/to-spec`) and submitted namespaced (`/mattpocock-skills:to-spec`). "Issue" is the tracker's
unit; "ticket" means a slice made by `to-tickets` (as in Matt's `GLOSSARY.md`). Never "backlog".
