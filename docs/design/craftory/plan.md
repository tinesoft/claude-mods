# Handoff: craftory mod (claude-mods)

Oct 25, 2026 · @Tine Kondo

## Summary

Build `craftory`, the second mod in `tinesoft/claude-mods`: an SDLC framework, built on top of Matt Pocock's skills, as a Claude Code mod. It guides a feature from idea to merged PR
through seven phases (Align → Spec → Tickets → Build → Review → Ship → Retro), each powered by a skill
from Matt Pocock's `mattpocock-skills` plugin, which Craftory depends on and does not vendor.

Craftory adds four things his skills do not have: an **SDLC phase rail** above the prompt that shows where
the active feature is and what to run next; a **pane** with the flow, tickets (plus a triage Inbox),
worktrees and glossary; **settings** that edit the files his skills read; and **steering** for the
parallel agents `implement-spec` starts (worktree layout, parallelism, token budget).

Principles, settled while grilling:

- **Matt's skills do the work.** Craftory submits commands, observes events and edits configuration
  files. It never replaces a skill.
- **Guide, never gate hard.** Gates ask for a confirm; nothing is refused.
- **Repo settings live in the repo.** Shared values are committed files; only personal UI preferences
  go in `$.store`.

The look is in [`DESIGN.md`](./DESIGN.md). Mockup boards map to the mod as follows:

| Board | In the mod | Render site / API |
| --- | --- | --- |
| `Main.dc.html` rail and detail card | Rail of buttons, card above it, Build's agents list | `ui.render` on `AbovePrompt` |
| `Panel.dc.html` | Pane with five tabs | `$.ui.open` + `ui.render` on `Pane` |
| `Settings.dc.html` | Tab 5 of the pane | `Pane`, `$.fs.write`, `$.store` |
| `States.dc.html` | State rules, band notices, glossary hover, toasts | `AbovePrompt`, `AssistantMessage`, `$.ui.toast` |
| `Mobile.dc.html` | Rail at the top of the Flow tab | `Pane` |

Target: Claude Code 2.1.299 or later, tested on 2.1.302 (the snapshot in
`tools/claude-code-types/2.1.302/index.d.ts`). Where the generated types disagree with this document,
the types win.

## Decisions

All resolved while grilling (Oct 24–25, 2026).

| # | Question | Decision |
| --- | --- | --- |
| 1 | Name | `craftory`: mod, Nx project, commit scope, pane id and command `/craftory`, branch prefix `craftory/` |
| 2 | Pipeline | Canvas, then a design handoff here, then code in Claude Code |
| 3 | Skills | Depend on `mattpocock-skills` (no vendoring). Check on load; if missing, ask approval to install |
| 4 | Phases | Align, Spec, Tickets, Build, Review, Ship, Retro, each anchored on a user-invoked skill, model-invoked skills as helpers (table in DESIGN.md) |
| 5 | Outside the phases | Triage is an entry point (Inbox); wayfinder a parent rail; handoff and improve-codebase-architecture are automations |
| 6 | Gates | Soft: confirm before running a phase whose gated predecessor is not done. Defaults: Align, Spec, Build, Review on |
| 7 | Build | `implement-spec` orchestrates. Craftory observes and steers through `agent.spawn` (worktree, branch, parallelism, budget, setup) |
| 8 | Review | `implement-spec` step 7's `code-review` close-out is the Review phase; the Build gate applies before it. `/code-review` re-runs it |
| 9 | Ship | Rewrite the draft PR body with `pr`, mark it ready for review against the default branch. Merging stays with the user |
| 10 | Token budget | Per agent, default 80k. Amber at 80%; at 100% the agent is told to stop and report, the ticket is Failed (budget), the worktree kept; card offers Raise budget or Diagnose |
| 11 | Trackers | All four in v1 (Local Markdown, GitHub, GitLab, Other). Rich Tickets tab for Local and GitHub; GitLab and Other show links |
| 12 | Local Markdown layout | `docs/issues/<n>-<slug>.md`, global numbering, front-matter `status`, described in `docs/agents/issue-tracker.md`; import from `.scratch/` offered |
| 13 | Where repo settings live | `docs/agents/*.md` and `GLOSSARY.md` (Matt-compatible, edited in place, never copied into `.craftory/`); Craftory-only values in a committed `.craftory/config.json` |
| 14 | Personal settings | `$.store`, with `userConfig` defaults (rail on/off, rail layout, theme) |
| 15 | Settings UI | Tab 5 of the `/craftory` pane, opened also by the rail's gear and the status line |
| 16 | Feature state | Several features in flight, one active per session (switcher in the rail). State in committed `.craftory/features/<spec-id>.json`; phase "done" from evidence |
| 17 | Command submission | Rail buttons show short names and submit the namespaced command with `$.prompt.submit`; typed namespaced commands are recognised too |
| 18 | Glossary in replies | Rich surfaces: underline, hover card, `/wait-what` on click. Terminal: no rewriting; "Used in last reply" in the Glossary tab |
| 19 | Glossary scope | Single-context `GLOSSARY.md` in v1: list, add, edit, delete terms; relationships and flagged ambiguities read-only. `GLOSSARY-MAP.md` later |
| 20 | Onboarding | A "Set up Craftory" step opens Settings pre-filled from the repo; saving writes what `/setup-matt-pocock-skills` would |
| 21 | Automations | Run at session start (weekly check if the last run is over 7 days old). Glossary drift scans the integration diff when Review starts and before Ship |
| 22 | Everything else | As session-activity: MIT, conventional commits, `nx release`, VS Code and mobile get pane + status line, cloud gets text at most |

### Still open

| # | Question | Why it matters | Recommended default |
| --- | --- | --- | --- |
| O1 | Default entry phase for a `ready-for-agent` triage item | Grilling settled "start at Build via `/implement`"; the canvas's Entry points select defaults to "Enter at Align" and offers "Bugs enter at Build, the rest at Align" | Default "Bugs enter at Build, the rest at Align", which satisfies both: a well-specified bug skips straight to Build, a feature request still gets grilled |
| O2 | Tested `mattpocock-skills` range | His skills change without notice; Craftory parses their outputs | `>=1.3.0 <1.4.0`, widened per release after the E2E suite passes |

## Dependency on mattpocock-skills

- **Detection.** On `session.start`, read the enabled plugins from `$.settings.read()` and the
  available skills from `skill.prompt` / the session's skill listing (M1 confirms which is reliable).
  Missing → the band shows the Plugin missing notice and the rail is disabled; outside the tested range →
  the same notice with **Update**.
- **Install.** **Install** runs `claude plugin install mattpocock-skills@claude-plugins-official` with
  `$.process.run` only after the click, shows progress in the notice, then asks for a restart. **Not
  now** hides the notice for the session. The pane's Settings header always shows the status.
- **Duplicates.** If the skills are present twice (plugin plus `npx skills` copies), warn once and use
  the plugin's.
- **Names.** Skills are namespaced: `/mattpocock-skills:to-spec`. The rail shows `/to-spec`.
- **Configuration.** His skills follow the `## Agent skills` block in `AGENTS.md`/`CLAUDE.md`, which
  points at `docs/agents/issue-tracker.md`, `triage-labels.md` and `domain.md`. Craftory writes those
  files and that block exactly as `/setup-matt-pocock-skills` would, so the two can be used
  interchangeably and teammates without Craftory read the same configuration.

## Repository changes

- `mods/craftory/` as a new Nx project, shaped like `mods/session-activity`.
- `.claude-plugin/marketplace.json`: add `craftory`.
- Root `README.md`: a row in the Mods table, with a light and dark logo in `assets/images/`.
- `docs/design/craftory/`: this file, `DESIGN.md`, `artboards/`.
- `craftory` becomes a valid commit scope automatically.

## Mod structure

```text
mods/craftory/
├── .claude-plugin/plugin.json      # name, userConfig (personal defaults), types
├── hooks/
│   ├── hooks.json                  # modules: ["./register.tsx"]
│   ├── register.tsx                # registers every hook; the one dispatch that answers an Action
│   └── shell/                      # every other $ call, grouped by the atoms each module owns
│       ├── repo.ts                 # atoms repo, plugin, install; fs reads, the one fs.write, git/gh probes
│       ├── tracker.ts              # atom tracker; reads the tracker the repo uses
│       ├── features.ts             # atoms features, drafts, active; saves records, the active-feature rule
│       ├── ledger.ts               # atom build (agent ledger); spawn, usage, finish and budget updates
│       ├── notices.ts              # atoms notices, dismissed, passes, signals
│       ├── git.ts                  # atom git; reads worktrees and branches, the cleanup plan
│       ├── flow.ts                 # atom running; currentFlow, settle, gates, skill and turn lifecycle
│       ├── sync.ts                 # tracker and git refresh, debounced; tells agents when their branch moves
│       ├── agents.ts               # agent lifecycle: spawn, seat, count, finish, pause, raise budget
│       ├── build.ts                # atoms diffs, steeringNote; seats, Worktrees tab, Agents list
│       ├── settings.ts             # atoms setupDraft, askedFiles, setupNote, settingsSection, termDraft,
│       │                           #   termError; Settings writes, .scratch/ import, glossary edits
│       └── ui.ts                   # atoms appearance, prefs, paneTab, openStep, isPickingFeature,
│                                   #   glossaryQuery, lastReplyTerms, glossaryAtStart; tone, openPane, pane views
├── src/                            # pure helpers: plain data in, plain data out, never $
│   ├── phases.ts                   # registry: id, label, commands, helpers, default gate, evidence rule
│   ├── evidence.ts                 # tracker + git + event facts → phase status per feature
│   ├── features.ts                 # feature state reducer, (de)serialise .craftory/features/*.json
│   ├── config.ts                   # .craftory/config.json schema, defaults, resolve with $.store overrides
│   ├── agents-md.ts                # read/write docs/agents/*.md and the "## Agent skills" block; plan of a Settings change
│   ├── glossary.ts                 # parse/serialise GLOSSARY.md (Language, Relationships, Flagged ambiguities)
│   ├── tracker/local.ts            # docs/issues front matter, numbering, blocking edges
│   ├── tracker/github.ts           # gh issue/label/sub-issue/PR command builders and parsers
│   ├── tracker/links.ts            # GitLab and Other: links only in v1
│   ├── build.ts                    # agent steering: slots, queue, names, budget state
│   ├── gates.ts                    # gate check → confirm text
│   ├── drift.ts                    # avoid-words in a diff → findings
│   ├── action.ts                   # the one Action union every button hands back
│   ├── notices.ts                  # notice views and their buttons
│   ├── ui.tsx                      # Ui table type, ink helpers, Icon
│   ├── widgets.tsx                 # Badge, CardButton, HookNote, Settings controls
│   ├── card-model.ts               # pure card and rail layout: phase meta, card view, fit
│   ├── agents-list.tsx             # the Agents list on the card
│   ├── card.tsx                    # the detail card
│   ├── notice-row.tsx              # a notice row and its buttons
│   ├── rail.tsx                    # band: rail, summary chip, phase strip, renderBand
│   ├── pane.tsx                    # tabs 1–4
│   ├── settings.tsx                # tab 5
│   ├── summary.ts                  # text summaries (cloud, /craftory where nothing draws)
│   ├── icons.ts                    # Svg icons for rich surfaces
│   └── theme.ts                    # tokens copied from session-activity, state → tokens
├── tests/
├── README.md
├── package.json, project.json, tsconfig.json
```

Each atom is declared in the one `hooks/shell` module that reads and updates it. The engine's state scan accepts `read` and `update` only on an atom declared in the same file, so a module never imports another module's atom: it calls that module's functions (`repoSnapshot`, `settle`, `openPane`). That also keeps one writer per atom. A `$`-taking helper that another file calls must be a `function` declaration, not an arrow const, for the same scan.

## Files Craftory reads and writes

| Path | Owner | Craftory |
| --- | --- | --- |
| `AGENTS.md` or `CLAUDE.md` (`## Agent skills` block) | shared with setup skill | Writes the block on setup; never touches the rest |
| `docs/agents/issue-tracker.md`, `triage-labels.md`, `domain.md` | shared with setup skill | Reads and writes (Settings) |
| `GLOSSARY.md` | shared with grill-with-docs, domain-modeling | Reads; writes only from Settings › Glossary |
| `docs/issues/*.md` (Local) | Matt's skills | Reads for evidence and the Tickets tab |
| `.craftory/config.json` | Craftory | Reads and writes; committed |
| `.craftory/features/<spec-id>.json` | Craftory | Reads and writes; committed |
| `.worktrees/` | Craftory + implement-spec | Added to `.gitignore` on setup |
| `$.store` | Craftory | Personal: rail on/off, layout, theme, "Not now" |

`.craftory/config.json` (sketch):

```json
{
  "version": 1,
  "entry": { "triage": { "enabled": true, "enterAt": "bugs-build-else-align" }, "wayfinder": { "suggest": "long-grill" } },
  "phases": {
    "align":   { "enabled": true, "command": "grill-with-docs", "gate": true },
    "spec":    { "enabled": true, "command": "to-spec", "gate": true },
    "tickets": { "enabled": true, "command": "to-tickets", "gate": false },
    "build":   { "enabled": true, "command": "implement-spec", "gate": true },
    "review":  { "enabled": true, "gate": true },
    "ship":    { "enabled": true, "gate": false },
    "retro":   { "enabled": true, "command": "retro", "gate": false }
  },
  "worktrees": {
    "folder": ".worktrees/", "integrationBranch": "feat/{spec-slug}", "ticketBranch": "craftory/{ticket}-{slug}",
    "maxParallel": 3, "tokenBudget": 80000, "setup": "pnpm install --frozen-lockfile", "copy": [".env.local", ".tool-versions"],
    "removeAfterMerge": true, "rebaseOnMove": true, "keepFailed": true, "pruneStale": false
  },
  "automation": { "suggestNext": true, "liveAgents": true, "underlineTerms": true, "retroOnPr": false, "handoffAt80": false, "weeklyArchitecture": false }
}
```

`.craftory/features/42.json` (sketch): `{ "spec": "#42", "title": "Export invoices as CSV", "entry": "align",
"skipped": [], "integrationBranch": "feat/invoice-csv", "pr": null, "phases": { "align": { "status": "done",
"at": "…", "artifacts": ["GLOSSARY.md", "docs/adr/0007-csv-streaming.md"] }, … }, "agents": { "#44": { "tokens": 31400, "status": "running" } } }`.
Only facts that cannot be re-derived are stored; everything else is recomputed from evidence.

## Event mapping

| Event | Craftory |
| --- | --- |
| `session.start` | Load config, features, plugin status; run due automations; pick the active feature |
| `skill.prompt` | Recognise which Matt skill runs → mark its phase Running; check gates (confirm via the band before `next(e)`) |
| `agent.spawn` | For Build implementers: enforce worktree isolation and names, hold the spawn while `maxParallel` is reached (queue), record the agent on the ticket |
| `turn.step`, `session.measure` | Per-agent token use and context percentage (M1 confirms per-agent figures) |
| `tool.call` | Observe `gh`/`glab`/git calls and writes under `docs/issues/` to refresh evidence; observe merges into the integration branch |
| `turn.complete` | Recompute phase status; suggest the next phase; text summary where nothing draws |
| `ui.render` `AbovePrompt` | Rail, notices, detail card |
| `ui.render` `Pane` | Tabs |
| `ui.render` `AssistantMessage` | Rich surfaces only: underline glossary terms with a hover card |
| `prompt.submit` (own) | Rail and Inbox buttons submit namespaced commands |
| `session.end` | Persist feature state |

Every hook calls `next(e)` and returns its result, except the gate confirm (which holds `skill.prompt`
until the user answers) and the parallelism queue (which holds `agent.spawn` until a slot frees).

## Phase evidence

| Phase | Done when (Local) | Done when (GitHub) |
| --- | --- | --- |
| Align | The grill skill ran and a later phase started, or the user marked it done | same |
| Spec | `docs/issues/<n>-*.md` with `type: spec` created in this feature | issue with the spec label created |
| Tickets | Files with `parent: <n>` and blocking edges exist | sub-issues of the spec exist |
| Build | Every `ready-for-agent` ticket is `status: done` and merged into the integration branch | same, issues closed by merge |
| Review | `code-review` ran on the integration branch after the last ticket merged and its fix agent finished | same |
| Ship | PR from the integration branch is ready for review | same |
| Retro | `retro` ran after Ship | same |

## Testing

Tests under `mods/craftory/tests/` run with `claude plugin test`, as in session-activity. Pure helpers
get unit tests (glossary round-trip byte-for-byte, `docs/agents` round-trip, config resolve, evidence
rules, budget state, gate text, drift finder). Engine tests drive `skill.prompt`, `agent.spawn`,
`turn.complete` and assert: hooks pass results through; gates hold and release; the queue never
exceeds `maxParallel`; nothing is written outside the files listed above. A fixture repo with a Local
tracker runs one feature end to end with stubbed skills.

## Milestones and acceptance criteria

Each milestone ends in a PR to `develop`; M5 ends in the first release from `main`.

**M0 · Scaffold**

- [ ] `mods/craftory` with `package.json`, `project.json`, `tsconfig.json`, `plugin.json`; listed in the marketplace and README
- [ ] Registers `/craftory` (opens an empty pane); `lint typecheck validate test` green

**M1 · Spikes** (findings written back into this file)

- [x] How to tell reliably that `mattpocock-skills` is installed and its version, and whether `$.process.run` may call `claude plugin install`
- [x] `skill.prompt` for a namespaced plugin skill: fields that identify plugin and skill; can a hook hold it while the band asks a confirm?
- [x] `agent.spawn` from `implement-spec`: does it carry `isolation: 'worktree'`? Can a hook rename the worktree and branch, hold the spawn to queue it, and run the setup command (or does `classic.WorktreeCreate` own that)?
- [x] Per-agent token use: is it visible (`turn.step`, `session.measure`, `$.agent.list`)? Does `$.session.send` to an agent make it stop?
- [x] `ui.render` on `AssistantMessage`: can a rich surface draw underlined spans with a hover card without changing the text?
- [ ] Glyph widths for `▸ ⊘ ▲ ✓` in four terminals
- [x] Two mods in one band: Craftory's rail with session-activity's chips

**M1 spike findings**

The spikes ran against Claude Code 2.1.302 in three ways. A throwaway mod ran under `claude plugin test`, which mocks the engine and so shows what the hook API allows. A logging mod ran live under `claude -p --plugin-dir` in a scratch git repository, with `mattpocock-skills` 1.3.1 enabled. The rest comes from the declarations in `tools/claude-code-types/2.1.302/index.d.ts`, and line numbers below are in that file. Each finding says which: *live*, *kit* or *types*.

- **Detecting the plugin.** `$.command.list()` lists each of his skills as `{ name: 'mattpocock-skills:to-spec', source: 'plugin', plugin: 'mattpocock-skills' }` (*live*, `:1765`). That is the presence check. `$.settings.read().enabledPlugins` keys are `name@marketplace`, and the plugin exists in two marketplaces, `claude-plugins-official` and `mattpocock` (*live*). Match on the name before `@`. Neither source gives the version.
- **Version.** `claude plugin list --json` gives `version` per installed id (*live*). A `skill.prompt` path also holds it, as in `.../mattpocock-skills/1.3.1/skills/...` (*live*). Use the first at `session.start` and the second as a check when a skill runs.
- **Install.** `$.process.run` takes any argv and has no rule against `claude plugin install` (`:3598`). It is CLI only (`:3576`), with a 30 s default timeout and a 10 minute ceiling (`:8163`). `mattpocock-skills@claude-plugins-official` is in the official catalog (*live*), so the plan's command is right. Pass `--json` for a parseable result.
- **Manifest dependency.** `plugin.json` accepts `"dependencies": ["mattpocock-skills@claude-plugins-official"]` and the `{ name, marketplace, version }` form (`claude plugin validate --strict` passes). Do not use it. A missing or out-of-range dependency disables the dependent plugin at load, so the Plugin missing notice would never show. A cross-marketplace dependency also needs `allowCrossMarketplaceDependenciesOn` in our `marketplace.json`, and a user's `mattpocock-skills@mattpocock` copy is a different id. Runtime detection stays.
- **`skill.prompt` fields.** `skill` is the namespaced name, `mattpocock-skills:wait-what`. Beside it come `pluginName`, `source: 'plugin'`, `path` and `frontmatter` (*live*, `:12415`). It carries no arguments. Read them from `command.run` `e.args` or `prompt.submit` `e.command` (`:9457`). For a typed command the live order is `command.run`, then `prompt.submit`, then `skill.prompt`.
- **`skill.prompt` cannot refuse.** Its only result is `{ text }`, the body the model reads (`:12468`). Answering without `next` swaps the body, and the model then replies to the swapped text.
- **Hook budget.** A hook has 10 s of its own time (`:5250`). The clock stops while a `next` or `$` call is in flight (`:6913`), but runs during `$.clock.sleep` (`:3520`) and during a plain promise. In the kit, a `skill.prompt` hook waiting on a band Button's `onPress` was dropped at 10 s and the skill ran ungated. Two 6 s `$.ui.ask` calls in one hook passed (*kit*). So the band cannot hold a skill while it waits for a press.
- **Gate design change.** For a typed or rail-submitted command, gate at `prompt.submit` on `e.command`. Return `{ drop }`, whose text the user sees (`:9544`), then show the band notice. **Run anyway** runs the command again with a one-shot pass. For a skill the model invokes (step 7's `code-review`), gate at `tool.call` `{ tool: 'Skill' }` with `$.ui.ask` (`:2463`), the engine's question dialog. The dialog holds without limit and rejects in `-p`.
- **Submitting commands.** Use `$.command.run({ command: 'mattpocock-skills:to-spec', args })` (`:3159`), which runs a slash command as if typed. It rejects only inside a hook the turn waits on (`:3153`), which a Button press is not. `$.prompt.submit({ text, asUser })` (`:3020`, `:9371`) sends a prompt. Whether it expands a `/name` line is unverified.
- **`agent.spawn` carries no isolation.** `isolation` and `name` belong to the Agent tool's input (`:16706`). They are seen and rewritten at `tool.call` `{ tool: 'Agent' }`. A `next({ ...e, name })` there reached `agent.spawn` and `$.agent.list()` (*live*). On `agent.spawn`, `name` is pinned (`:396`). `prompt`, `description`, `model`, `background` and `cwd` can be rewritten, and `{ deny }` refuses (`:261`, `:447`, *kit*). `implement-spec` 1.3.1 asks for one worktree and branch per implementer but leaves the parameters to the model.
- **Worktree and branch.** `classic.WorktreeCreate` fires before `agent.spawn` resolves, with `name: 'agent-<agentId>'` and no description (*live*, `:15396`). A hook answered it with `{ worktreePath }` after running `git worktree add -b craftory/44-probe .worktrees/44-probe`. The subagent ran in that folder on that branch, and the engine left the worktree on disk (*live*, `:1384`). The setup command runs in the same hook through `$.process.run`, budget free. The engine removes its own unchanged worktrees and never ours, so Craftory owns cleanup.
- **Matching a worktree to its ticket.** `WorktreeCreate` names the agent id only, which `agent.spawn` reports afterwards. Craftory keeps the pending spawn from `tool.call` and pairs it with the next `WorktreeCreate`. Parallel spawns in one model step may race (inferred). The kit-only fallback is to drop `isolation` at `tool.call` and set `agent.spawn` `cwd` to a worktree Craftory made.
- **Queueing.** A spawn held on a plain promise was let go at 10 s and started anyway (*kit*). A loop of `$.process.run(['sleep', '1'])` held one for 13 s, since each call stops the clock (*kit*). That loop is a CLI-only hack. The queue instead denies the spawn with a reason that tells the model to wait for a running implementer and try again. This is a new fallback, beside the ones under Risks.
- **Per-agent tokens.** `turn.step` carries `agentId` (`:14114`), and its result carries `usage` per request (`:14174`). `turn.complete` carries both for each agent turn (`:13939`). Both were seen for a subagent (*live*). `session.measure` reports the main thread only (`:4516`), and `$.agent.list()` has no tokens (`:125`). The budget stays in tokens, and the Risks fallback to turns is not needed.
- **Stopping an agent.** `$.session.send({ to: { agentId }, text })` queues a message (`:12001`). The agent reads it at its next turn, never mid-request (`:12103`). A `turn.step` hook that returns its own result without `next` sends no request (*kit*, `:4567`), which is the hard stop. `TaskStop` is in the session's tool list (*live*), so `$.tool.call({ tool: 'TaskStop', task_id })` is a third route (*kit*, shape only). At 100%, Craftory sends the stop message and answers the agent's next `turn.step` itself.
- **`AssistantMessage`.** It is raised on every attached surface (`:10272`). Its props are `text`, `isFirstOfReply`, `isSummary` and `onScreen`. A hook may rewrite `props.text` for the drawing alone, since the stored message never changes, or return its own tree. `Markdown` is an element on every surface, but it is a leaf with no `hover` (`:5837`). `Text` has `underline` and no dotted style (`:13207`). A `Text` hover needs a keyed `Box` or a `scope` (`:13159`). The kit validated a desktop tree with each term as a pressable Markdown link (`onLinkPress`), plus an underlined `Text` whose `scope` reveals an absolute `display: 'none'` card. A hover card cannot sit on a word inside `Markdown`. Craftory links terms in the reply and puts hover cards on a term row under it.
- **Surfaces.** Claude Code for VS Code attaches no surface in 2.1.302 (`:3956`, `:10808`), so VS Code gets nothing drawn, unlike DESIGN.md's Surfaces table. Mobile has no `Input` or `Select` (`:3936`), so the Settings tab is read-only there.
- **UI calls.** `$.ui.toast(text, { timeoutMs })` takes no action button (`:2480`, `:13270`). Each toast in DESIGN.md therefore names its command, and the action lives in the band or pane. `$.ui.status` takes text or `undefined` (`:2510`). `$.ui.open` takes `id`, `title`, `focus`, `closeOnEscape`, `holdToasts`, `rows` and `columns` (`:7550`). Panes have no built-in tabs. Each id is one pane, and several open panes show as tabs (`:10724`). Craftory draws its five tabs as Buttons. `$.fs` has `read`, `write`, `list`, `exists` and `stat` (`:3325`). `$.process.run` takes `cwd`, `env`, `stdin` and `timeoutMs`, and git runs with repo hooks off (`:3588`).
- **Two mods in one band.** One plugin's hook is outer and gets the other's tree from `next(e)` (`:6911`). Modules fold in list order, managed plugins first (`:4011`). In the kit, Craftory with an inline chips mod got the chips as `below` and drew both. The outer mod decides placement, so session-activity's README line holds only when it is outer. Craftory must always draw `below` (except during a survey), in its own row above the rail.
- **Glyph widths.** No width function reaches a mod. By East Asian Width, `▸ ⊘ ✓ ◓ ◒` are Neutral and `▲ ◐ ◑ –` are Ambiguous (Unicode 15.1). The 2.1.302 binary lays out terminal text with `CellSegmenter({ ambiguousIsNarrow: true })`, so the engine counts every glyph as one cell. A terminal set to draw ambiguous glyphs wide shows `▲ ◐ ◑ –` two cells wide and misaligns the rail. Keep the `> x !` fallback and add `|/-\` for the spinner.
- **Managed installs.** `claude plugin validate` reports that `skill.prompt` and `classic.WorktreeCreate` skip user-installed plugins where an organization manages Claude Code. There, the Risks fallback applies. Craftory passes worktree settings as `prompt.submit` `context` (`:9480`, *kit*) and only observes spawns.
- **Event mapping mismatches.** `agent.spawn` has no worktree fields; use `tool.call` Agent plus `classic.WorktreeCreate`. `turn.step` streams, so its hook is an async generator (`:12729`). Per-agent figures come from `turn.step` and `turn.complete`, not `session.measure`. The skill gate moves to `prompt.submit` and `tool.call` Skill. A plugin's own `$.prompt.submit` skips its own hooks (`:3013`), so Craftory recognises its submissions by origin. `session.end` shares one short time limit across every plugin (`:4532`), so feature state is written when it changes, not only at the end. `implement-spec` 1.3.1 step 8 already marks the draft PR ready, which overlaps Ship (Decision 9).

Not yet observed on a live client: the band and pane on a terminal or Desktop, link underline and hover cards on Desktop and mobile, `$.ui.ask` from inside a `tool.call` Skill hook, `$.prompt.submit` with a slash command, `TaskStop` on a running subagent, `/reload-plugins` after an install, plugin order between two user mods, and glyph widths in four terminals.

**M2 · Model, config and setup**

- [ ] `phases.ts`, `config.ts`, `features.ts`, `agents-md.ts`, `glossary.ts`, `tracker/local.ts` with tests
- [ ] Plugin missing notice, install flow, version range
- [ ] First-run setup writes `docs/agents/*.md`, the `## Agent skills` block, `.craftory/config.json`, `.gitignore` entry; output identical to `/setup-matt-pocock-skills` for the same answers

**M3 · Rail and Align → Tickets**

- [ ] Rail with every state, detail card, commands submitted namespaced
- [ ] Evidence for Align, Spec, Tickets on Local and GitHub; feature switcher; soft gates
- [ ] Status line, toasts

**M4 · Build, Review, Ship, Retro**

- [x] Agent steering per M1: names, queue, budget states, stop at budget, worktree kept
- [x] Agents list live in Build's card; Worktrees tab with Diff, Open terminal, Remove, Prune
- [x] Review recognised as Build's close-out; Ship rewrites the PR body and marks it ready; Retro
- [x] Rebase-conflict and budget toasts

**M5 · Pane, Settings, glossary · first release**

- [x] Tabs 1–5 complete; Settings writes every value to the file in DESIGN.md's table and reloads on change
- [x] Glossary editing round-trips; underline and hover on rich surfaces; "Used in last reply" on the terminal; drift scan
- [x] GitLab and Other templates; Inbox with triage roles and entry phase
- [ ] Desktop, VS Code and mobile checked in light and dark; README with screenshots; release `craftory@1.0.0`

**M6 · Optional**

- [ ] Automations: handoff at 80%, retro on PR, weekly architecture check
- [ ] Wayfinder parent rail; multi-context `GLOSSARY-MAP.md`; cloud text summary

## Risks and references

- **Upstream drift.** Matt's skills change often and Craftory reads their outputs. Mitigation: a tested
  version range, evidence rules that read files and tracker state rather than skill text, and an E2E
  fixture run per range bump.
- **Steering limits.** If `agent.spawn` cannot be held or renamed, Craftory falls back to passing its
  worktree settings to `implement-spec` as context through `skill.prompt`, and to observing only.
- **Budget visibility.** If per-agent tokens are not exposed, the budget becomes a time and turn
  budget, and the bar shows turns.
- **Writes to shared files.** Every write from Settings shows a diff first the first time per file, and
  never touches content outside the sections it owns.
- References: `mattpocock/skills` (README, `setup-matt-pocock-skills`, `implement-spec`, `GLOSSARY.md`),
  `docs/design/session-activity/plan.md` for repo conventions, the canvas linked above.
